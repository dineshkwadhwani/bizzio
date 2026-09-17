import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createBalancedJournal, findPaymentAccount } from "@/lib/finance-ledger";

const LedgerEntrySchema = z.object({
  entry_type: z.enum(["expense", "income", "opening_balance", "gst_payment"]),
  account_id: z.string().min(1),
  amount: z.coerce.number().positive(),
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  entry_date: z.string().optional().or(z.literal("")).transform((value) => value || new Date().toISOString().slice(0, 10)),
  is_accountable: z.boolean().default(true)
});

export async function GET(request: Request) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode");
    const includeBalanceAccounts = url.searchParams.get("include_balance_accounts") === "true";
    const companyId = guard.employee.company_id;

    if (mode === "account-options") {
      const [{ data: heads }, { data: vendors }, { data: customers }] = await Promise.all([
        supabase
          .from("account_heads")
          .select("id, name, type, is_party_account, party_type")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("type", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("vendors")
          .select("id, name, party_account_head_id")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase
          .from("customers")
          .select("id, name, party_account_head_id")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("name", { ascending: true })
      ]);

      const headLookup = new Map((heads ?? []).map((head) => [head.id, head]));
      const optionList: any[] = [];

      (heads ?? []).forEach((head) => {
        if (!head.is_party_account && (includeBalanceAccounts || head.type === "expense" || head.type === "income")) {
          optionList.push({
            id: head.id,
            label: `${head.name} — ${head.type}`,
            kind: "head",
            type: head.type,
            party_type: null,
            group: "General account head"
          });
        }
      });

      (vendors ?? []).forEach((vendor) => {
        const partyHead = vendor.party_account_head_id ? headLookup.get(vendor.party_account_head_id) : null;
        if (partyHead && partyHead.is_party_account && partyHead.party_type === "vendor") {
          optionList.push({
            id: partyHead.id,
            label: `Vendor: ${vendor.name} — ${partyHead.name}`,
            kind: "party",
            type: "expense",
            party_type: "vendor",
            group: "Party account"
          });
        }
      });

      (customers ?? []).forEach((customer) => {
        const partyHead = customer.party_account_head_id ? headLookup.get(customer.party_account_head_id) : null;
        if (partyHead && partyHead.is_party_account && partyHead.party_type === "customer") {
          optionList.push({
            id: partyHead.id,
            label: `Customer: ${customer.name} — ${partyHead.name}`,
            kind: "party",
            type: "income",
            party_type: "customer",
            group: "Party account"
          });
        }
      });

      return NextResponse.json({ options: optionList });
    }

    const journalId = url.searchParams.get("journal_id");
    let entriesQuery = supabase
      .from("ledger_entries")
      .select("*, account_head:account_heads(id, name, type, is_party_account, party_type)")
      .eq("company_id", companyId)
      .in("source_type", ["adhoc_expense", "adhoc_income", "opening_balance", "gst_payment"])
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (journalId) entriesQuery = entriesQuery.eq("journal_id", journalId);
    const { data, error } = await entriesQuery;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) {
    return error as Response;
  }
}

export async function PATCH(request: Request) {
  try {
    const guard = await requireFinance();
    const body = await request.json();
    const parsed = LedgerEntrySchema.safeParse(body);
    const journalId = typeof body.journal_id === "string" ? body.journal_id : "";
    if (!parsed.success || !journalId) return NextResponse.json({ error: "A valid journal and entry details are required." }, { status: 400 });

    const supabase = createClient();
    const companyId = guard.employee.company_id;
    const { data: lines, error: linesError } = await supabase.from("ledger_entries").select("id, source_type, journal_line, entry_type, account_head_id").eq("company_id", companyId).eq("journal_id", journalId);
    if (linesError || !lines?.length || lines.some((line: any) => !["adhoc_expense", "adhoc_income", "opening_balance"].includes(line.source_type))) return NextResponse.json({ error: "Only ad-hoc journals can be edited." }, { status: 400 });

    const isOpening = lines[0].source_type === "opening_balance";
    const isExpense = lines[0].source_type === "adhoc_expense";
    const { data: account } = await supabase.from("account_heads").select("id, type, is_party_account, party_type, is_active").eq("id", parsed.data.account_id).eq("company_id", companyId).single();
    if (!account?.is_active || account.is_party_account || (isOpening ? account.type !== "asset" : account.type !== (isExpense ? "expense" : "income"))) return NextResponse.json({ error: "Selected account is not valid for this entry." }, { status: 400 });
    const primary = lines.find((line: any) => isOpening ? line.journal_line === "Opening asset balance" : line.journal_line === (isExpense ? "Expense" : "Income")) || lines.find((line: any) => isOpening ? line.entry_type === "debit" : line.account_head_id === parsed.data.account_id);
    if (!primary) return NextResponse.json({ error: "The journal is missing its main account line." }, { status: 400 });
    const amount = Number(parsed.data.amount.toFixed(2));
    const common = { amount, entry_date: parsed.data.entry_date, reference_number: parsed.data.reference_number?.trim() || null, description: (parsed.data.description?.trim() || parsed.data.notes?.trim() || (isOpening ? "Opening asset balance" : isExpense ? "Ad-hoc expense" : "Ad-hoc income")).slice(0, 255), notes: parsed.data.notes?.trim() || null, is_accountable: parsed.data.is_accountable, payment_mode: isOpening ? null : parsed.data.payment_mode };
    const { error: updateError } = await supabase.from("ledger_entries").update(common).eq("company_id", companyId).eq("journal_id", journalId);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    const { error: accountUpdateError } = await supabase.from("ledger_entries").update({ account_head_id: account.id }).eq("id", primary.id).eq("company_id", companyId);
    if (accountUpdateError) return NextResponse.json({ error: accountUpdateError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return error as Response;
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireFinance();
    const body = await request.json();
    const parsed = LedgerEntrySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const accountId = parsed.data.account_id;
    const companyId = guard.employee.company_id;

    const { data: account, error: accountError } = await supabase
      .from("account_heads")
      .select("id, company_id, name, type, is_party_account, party_type, is_active")
      .eq("id", accountId)
      .eq("company_id", companyId)
      .single();

    if (accountError || !account || !account.is_active) {
      return NextResponse.json({ error: "Selected account is invalid or inactive." }, { status: 400 });
    }

    const entryType = parsed.data.entry_type;
    const isOpeningBalance = entryType === "opening_balance";
    const isGstPayment = entryType === "gst_payment";
    const isExpense = entryType === "expense";

    if (isOpeningBalance && (account.is_party_account || account.type !== "asset")) {
      return NextResponse.json({ error: "Opening balance must be posted to an active asset account such as Bank Account." }, { status: 400 });
    }
    if (isGstPayment && (account.is_party_account || account.type !== "liability")) {
      return NextResponse.json({ error: "GST payment must be posted to an active liability account such as GST Payable." }, { status: 400 });
    }
    if (!isOpeningBalance && !isGstPayment && account.is_party_account) {
      if (account.party_type === "vendor" && !isExpense) {
        return NextResponse.json({ error: "Vendor party accounts are only valid for expense entries." }, { status: 400 });
      }
      if (account.party_type === "customer" && isExpense) {
        return NextResponse.json({ error: "Customer party accounts are only valid for income entries." }, { status: 400 });
      }
    } else if (!isOpeningBalance && !isGstPayment) {
      if (account.type !== entryType) {
        return NextResponse.json({ error: `Selected account does not match the ${entryType} entry type.` }, { status: 400 });
      }
    }

    const { data: paymentAccount, error: paymentAccountError } = await findPaymentAccount(supabase, companyId, parsed.data.payment_mode);
    const amount = Number(parsed.data.amount.toFixed(2));
    const description = (parsed.data.description?.trim() || parsed.data.notes?.trim() || `${isExpense ? "Ad-hoc expense" : "Ad-hoc income"}`).slice(0, 255);
    let counterpart = paymentAccount;
    if (isOpeningBalance) {
      const { data: openingEquity, error: openingEquityError } = await supabase.from("account_heads").select("id, name, type").eq("company_id", companyId).eq("name", "Opening Balance Equity").eq("type", "equity").eq("is_active", true).maybeSingle();
      if (openingEquityError || !openingEquity) return NextResponse.json({ error: "Opening Balance Equity account is missing or inactive." }, { status: 400 });
      counterpart = openingEquity;
    } else if (paymentAccountError || !paymentAccount) {
      return NextResponse.json({ error: "The selected payment account is missing or inactive." }, { status: 400 });
    }
    const result = await createBalancedJournal(supabase, {
      companyId,
      lines: isOpeningBalance
        ? [{ accountHeadId: account.id, amount, entryType: "debit", label: "Opening asset balance" }, { accountHeadId: counterpart.id, amount, entryType: "credit", label: "Opening Balance Equity" }]
        : isGstPayment
        ? [{ accountHeadId: account.id, amount, entryType: "debit", label: "GST Payable" }, { accountHeadId: paymentAccount.id, amount, entryType: "credit", label: "Bank/Cash" }]
        : isExpense
        ? [{ accountHeadId: account.id, amount, entryType: "debit", label: "Expense" }, { accountHeadId: paymentAccount.id, amount, entryType: "credit", label: "Payment" }]
        : [{ accountHeadId: paymentAccount.id, amount, entryType: "debit", label: "Receipt" }, { accountHeadId: account.id, amount, entryType: "credit", label: "Income" }],
      paymentMode: parsed.data.payment_mode,
      referenceNumber: parsed.data.reference_number?.trim() || null,
      description,
      notes: parsed.data.notes,
      entryDate: parsed.data.entry_date,
      createdBy: guard.employee.id,
      sourceType: isOpeningBalance ? "opening_balance" : isGstPayment ? "gst_payment" : (isExpense ? "adhoc_expense" : "adhoc_income")
    });
    if (result.error || !result.data) return NextResponse.json({ error: result.error?.message ?? "Could not create balanced journal entry." }, { status: 500 });
    return NextResponse.json({ entries: result.data, journalId: result.journalId }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
