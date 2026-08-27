import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const LedgerEntrySchema = z.object({
  entry_type: z.enum(["expense", "income"]),
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
        if (!head.is_party_account && (head.type === "expense" || head.type === "income")) {
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

    const { data, error } = await supabase
      .from("ledger_entries")
      .select("*, account_head:account_heads(id, name, type, is_party_account, party_type)")
      .eq("company_id", companyId)
      .in("source_type", ["adhoc_expense", "adhoc_income"])
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
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
    const isExpense = entryType === "expense";

    if (account.is_party_account) {
      if (account.party_type === "vendor" && !isExpense) {
        return NextResponse.json({ error: "Vendor party accounts are only valid for expense entries." }, { status: 400 });
      }
      if (account.party_type === "customer" && isExpense) {
        return NextResponse.json({ error: "Customer party accounts are only valid for income entries." }, { status: 400 });
      }
    } else {
      if (account.type !== entryType) {
        return NextResponse.json({ error: `Selected account does not match the ${entryType} entry type.` }, { status: 400 });
      }
    }

    const description = (parsed.data.description?.trim() || parsed.data.notes?.trim() || `${isExpense ? "Ad-hoc expense" : "Ad-hoc income"}`).slice(0, 255);

    const { data: entry, error: insertError } = await supabase
      .from("ledger_entries")
      .insert({
        company_id: companyId,
        account_head_id: account.id,
        entry_type: isExpense ? "debit" : "credit",
        amount: Number(parsed.data.amount.toFixed(2)),
        is_accountable: parsed.data.is_accountable,
        source_type: isExpense ? "adhoc_expense" : "adhoc_income",
        source_id: null,
        payment_mode: parsed.data.payment_mode,
        reference_number: parsed.data.reference_number?.trim() || null,
        description,
        entry_date: parsed.data.entry_date,
        created_by: guard.employee.id
      })
      .select("*, account_head:account_heads(id, name, type, is_party_account, party_type)")
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
