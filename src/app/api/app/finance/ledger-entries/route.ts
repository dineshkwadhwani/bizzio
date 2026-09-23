import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createBalancedJournal, findPaymentAccount } from "@/lib/finance-ledger";
import { effectiveToggles } from "@/lib/permissions";

const LedgerEntrySchema = z.object({
  entry_type: z.enum(["expense", "income", "opening_balance", "gst_payment"]),
  account_id: z.string().min(1),
  amount: z.coerce.number().positive(),
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  entry_date: z.string().optional().or(z.literal("")).transform((value) => value || new Date().toISOString().slice(0, 10)),
  is_accountable: z.boolean().default(true),
  attachment_path: z.string().optional().nullable(),
  attachment_name: z.string().optional().nullable()
});

const BankImportEditSchema = z.object({
  account_id: z.string().min(1),
  amount: z.coerce.number().positive(),
  reference_number: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  entry_date: z.string().min(1),
  is_accountable: z.boolean().default(true)
  ,attachment_path: z.string().optional().nullable()
  ,attachment_name: z.string().optional().nullable()
});

const ReceiptEditSchema = z.object({
  reference_number: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  entry_date: z.string().min(1),
  attachment_path: z.string().optional().nullable(),
  attachment_name: z.string().optional().nullable()
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
      const [{ data: heads }, { data: vendors }, { data: customers }, { data: employees }] = await Promise.all([
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
          .order("name", { ascending: true }),
        supabase
          .from("employees")
          .select("id, name, salary_payable_account_head_id")
          .eq("company_id", companyId)
          .eq("status", "active")
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

      (employees ?? []).forEach((employee) => {
        const salaryHead = employee.salary_payable_account_head_id ? headLookup.get(employee.salary_payable_account_head_id) : null;
        if (salaryHead && salaryHead.is_party_account && salaryHead.party_type === "employee") {
          optionList.push({
            id: salaryHead.id,
            label: `Employee: ${employee.name} — ${salaryHead.name}`,
            kind: "party",
            type: "liability",
            party_type: "employee",
            group: "Employee salary payable"
          });
        }
      });

      return NextResponse.json({ options: optionList });
    }

    const journalId = url.searchParams.get("journal_id");
    const includeAllSources = url.searchParams.get("include_all") === "true";
    if (journalId) {
      const { data: permissionEmployee } = await supabase
        .from("employees")
        .select("permission_overrides, permission_templates(toggles)")
        .eq("id", guard.employee.id)
        .single();
      const permissionTemplate = Array.isArray((permissionEmployee as any)?.permission_templates)
        ? (permissionEmployee as any).permission_templates[0]
        : (permissionEmployee as any)?.permission_templates;
      const toggles = effectiveToggles(permissionTemplate?.toggles, (permissionEmployee as any)?.permission_overrides);
      if (toggles.edit_transactions !== true) return NextResponse.json({ error: "Edit Transactions permission is required." }, { status: 403 });
    }
    let entriesQuery = supabase
      .from("ledger_entries")
      .select("*, account_head:account_heads(id, name, type, is_party_account, party_type)")
      .eq("company_id", companyId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (!includeAllSources) entriesQuery = entriesQuery.in("source_type", ["adhoc_expense", "adhoc_income", "opening_balance", "gst_payment"]);
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
    const { data: permissionEmployee } = await guard.supabase
      .from("employees")
      .select("permission_overrides, permission_templates(toggles)")
      .eq("id", guard.employee.id)
      .single();
    const permissionTemplate = Array.isArray((permissionEmployee as any)?.permission_templates)
      ? (permissionEmployee as any).permission_templates[0]
      : (permissionEmployee as any)?.permission_templates;
    const toggles = effectiveToggles(permissionTemplate?.toggles, (permissionEmployee as any)?.permission_overrides);
    if (toggles.edit_transactions !== true) return NextResponse.json({ error: "Edit Transactions permission is required." }, { status: 403 });
    const body = await request.json();
    const journalId = typeof body.journal_id === "string" ? body.journal_id : "";
    if (!journalId) return NextResponse.json({ error: "A valid journal and entry details are required." }, { status: 400 });

    const supabase = createClient();
    const companyId = guard.employee.company_id;
    const { data: lines, error: linesError } = await supabase.from("ledger_entries").select("id, source_id, source_type, journal_line, entry_type, account_head_id, amount").eq("company_id", companyId).eq("journal_id", journalId);
    if (linesError || !lines?.length) return NextResponse.json({ error: "The journal could not be found." }, { status: 404 });

    const isBankImport = lines.every((line: any) => line.source_type === "bank_import_row");
    if (isBankImport) {
      const parsedBank = BankImportEditSchema.safeParse(body);
      if (!parsedBank.success) return NextResponse.json({ error: "A valid account, amount, date, and journal details are required." }, { status: 400 });
      const bankRowId = lines.find((line: any) => line.source_id)?.source_id;
      if (!bankRowId) return NextResponse.json({ error: "The bank-import row could not be identified." }, { status: 400 });
      const { data: account } = await supabase.from("account_heads").select("id, type, is_active, is_party_account, party_type").eq("id", parsedBank.data.account_id).eq("company_id", companyId).single();
      if (!account?.is_active) return NextResponse.json({ error: "Selected account is invalid or inactive." }, { status: 400 });

      const categoryLines = lines.filter((line: any) => ["Expense/category", "Income/category", "Salary payable — accrual", "Salary payable — settlement"].includes(line.journal_line));
      if (!categoryLines.length) return NextResponse.json({ error: "This bank journal does not have an editable category line." }, { status: 400 });
      const isSalaryJournal = categoryLines.some((line: any) => ["Salary payable — accrual", "Salary payable — settlement"].includes(line.journal_line));
      if (isSalaryJournal && (!account.is_party_account || account.party_type !== "employee")) return NextResponse.json({ error: "A salary journal must remain assigned to an employee salary account." }, { status: 400 });
      const amount = Number(parsedBank.data.amount.toFixed(2));
      const common = { amount, entry_date: parsedBank.data.entry_date, reference_number: parsedBank.data.reference_number?.trim() || null, description: (parsedBank.data.description?.trim() || "Bank statement transaction").slice(0, 255), notes: parsedBank.data.notes?.trim() || null, is_accountable: parsedBank.data.is_accountable, attachment_path: parsedBank.data.attachment_path?.trim() || null, attachment_name: parsedBank.data.attachment_name?.trim() || null };
      const { error: updateError } = await supabase.from("ledger_entries").update(common).eq("company_id", companyId).eq("journal_id", journalId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      const { error: accountUpdateError } = await supabase.from("ledger_entries").update({ account_head_id: parsedBank.data.account_id }).in("id", categoryLines.map((line: any) => line.id)).eq("company_id", companyId);
      if (accountUpdateError) return NextResponse.json({ error: accountUpdateError.message }, { status: 500 });
      const { data: bankRow } = await supabase.from("bank_statement_rows").select("withdrawal, deposit").eq("id", bankRowId).eq("company_id", companyId).single();
      const isWithdrawal = Number(bankRow?.withdrawal || 0) > 0;
      const { error: rowUpdateError } = await supabase.from("bank_statement_rows").update({
        assigned_account_head_id: parsedBank.data.account_id,
        row_date: parsedBank.data.entry_date,
        ref_no: parsedBank.data.reference_number?.trim() || null,
        particulars: parsedBank.data.description?.trim() || null,
        withdrawal: isWithdrawal ? amount : 0,
        deposit: isWithdrawal ? 0 : amount,
        notes: parsedBank.data.notes?.trim() || null
      }).eq("id", bankRowId).eq("company_id", companyId);
      if (rowUpdateError) return NextResponse.json({ error: rowUpdateError.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const isSalaryJournal = lines.every((line: any) => line.source_type === "salary_paid");
    if (isSalaryJournal) {
      const parsedSalary = BankImportEditSchema.safeParse(body);
      if (!parsedSalary.success) return NextResponse.json({ error: "A valid amount, date, and transaction details are required." }, { status: 400 });

      const { data: salaryPayment, error: salaryPaymentError } = await supabase
        .from("salary_payments")
        .select("id, journal_id, accrual_journal_id")
        .or(`journal_id.eq.${journalId},accrual_journal_id.eq.${journalId}`)
        .eq("company_id", companyId)
        .maybeSingle();
      if (salaryPaymentError || !salaryPayment) return NextResponse.json({ error: "The salary payment could not be found." }, { status: 404 });

      const journalIds = [salaryPayment.journal_id, salaryPayment.accrual_journal_id].filter(Boolean);
      const common = {
        amount: Number(parsedSalary.data.amount.toFixed(2)),
        entry_date: parsedSalary.data.entry_date,
        reference_number: parsedSalary.data.reference_number?.trim() || null,
        description: (parsedSalary.data.description?.trim() || "Salary payment").slice(0, 255),
        notes: parsedSalary.data.notes?.trim() || null,
        is_accountable: parsedSalary.data.is_accountable,
        attachment_path: parsedSalary.data.attachment_path?.trim() || null,
        attachment_name: parsedSalary.data.attachment_name?.trim() || null
      };
      const { error: updateError } = await supabase.from("ledger_entries").update(common).eq("company_id", companyId).in("journal_id", journalIds);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      const { error: salaryUpdateError } = await supabase.from("salary_payments").update({ amount: common.amount, paid_at: `${parsedSalary.data.entry_date}T00:00:00.000Z`, reference_number: common.reference_number }).eq("id", salaryPayment.id).eq("company_id", companyId);
      if (salaryUpdateError) return NextResponse.json({ error: salaryUpdateError.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const isPurchaseInvoiceJournal = lines.every((line: any) => line.source_type === "purchase_invoice_issued");
    const isPurchasePaymentJournal = lines.every((line: any) => line.source_type === "purchase_invoice_payment");
    if (isPurchaseInvoiceJournal || isPurchasePaymentJournal) {
      const parsedPurchase = ReceiptEditSchema.extend({ amount: z.coerce.number().positive() }).safeParse(body);
      if (!parsedPurchase.success) return NextResponse.json({ error: "A valid amount, date, and transaction details are required." }, { status: 400 });
      const sourceId = lines.find((line: any) => line.source_id)?.source_id;
      if (!sourceId) return NextResponse.json({ error: "The purchase transaction could not be identified." }, { status: 400 });
      const common = {
        entry_date: parsedPurchase.data.entry_date,
        reference_number: parsedPurchase.data.reference_number?.trim() || null,
        description: (parsedPurchase.data.description?.trim() || (isPurchasePaymentJournal ? "Purchase invoice payment" : "Purchase invoice")).slice(0, 255),
        notes: parsedPurchase.data.notes?.trim() || null,
        attachment_path: parsedPurchase.data.attachment_path?.trim() || null,
        attachment_name: parsedPurchase.data.attachment_name?.trim() || null
      };
      if (isPurchasePaymentJournal) {
        const { data: payment } = await supabase.from("purchase_invoice_payments").select("id,purchase_invoice_id,amount,paid_at").eq("id", sourceId).eq("company_id", companyId).single();
        if (!payment) return NextResponse.json({ error: "The purchase invoice payment could not be found." }, { status: 404 });
        const { data: existingPayments } = await supabase.from("purchase_invoice_payments").select("id,amount").eq("purchase_invoice_id", payment.purchase_invoice_id).eq("company_id", companyId);
        const otherPaid = (existingPayments ?? []).filter((row: any) => row.id !== payment.id).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
        const { data: invoice } = await supabase.from("purchase_invoices").select("total_amount").eq("id", payment.purchase_invoice_id).eq("company_id", companyId).single();
        if (!invoice || otherPaid + parsedPurchase.data.amount > Number(invoice.total_amount) + 0.005) return NextResponse.json({ error: "The revised payment exceeds the purchase invoice balance." }, { status: 400 });
        const { error: updateError } = await supabase.from("ledger_entries").update({ ...common, amount: Number(parsedPurchase.data.amount.toFixed(2)) }).eq("company_id", companyId).eq("journal_id", journalId);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
        const { error: paymentError } = await supabase.from("purchase_invoice_payments").update({ amount: Number(parsedPurchase.data.amount.toFixed(2)), paid_at: parsedPurchase.data.entry_date, reference_number: common.reference_number }).eq("id", payment.id).eq("company_id", companyId);
        if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });
        const paidTotal = otherPaid + Number(parsedPurchase.data.amount);
        await supabase.from("purchase_invoices").update({ status: paidTotal >= Number(invoice.total_amount) - 0.005 ? "paid" : "partially_paid" }).eq("id", payment.purchase_invoice_id).eq("company_id", companyId);
      } else {
        const { data: invoice } = await supabase.from("purchase_invoices").select("id").eq("id", sourceId).eq("company_id", companyId).single();
        if (!invoice) return NextResponse.json({ error: "The purchase invoice could not be found." }, { status: 404 });
        const { error: updateError } = await supabase.from("ledger_entries").update(common).eq("company_id", companyId).eq("journal_id", journalId);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
        const { error: invoiceError } = await supabase.from("purchase_invoices").update({ invoice_date: parsedPurchase.data.entry_date }).eq("id", invoice.id).eq("company_id", companyId);
        if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const isReceiptJournal = lines.every((line: any) => ["invoice_receipt", "customer_advance", "customer_advance_application"].includes(line.source_type));
    if (isReceiptJournal) {
      const parsedReceipt = ReceiptEditSchema.safeParse(body);
      if (!parsedReceipt.success) return NextResponse.json({ error: "A valid date and transaction details are required." }, { status: 400 });
      const common = {
        entry_date: parsedReceipt.data.entry_date,
        reference_number: parsedReceipt.data.reference_number?.trim() || null,
        description: (parsedReceipt.data.description?.trim() || "Invoice payment received").slice(0, 255),
        notes: parsedReceipt.data.notes?.trim() || null,
        attachment_path: parsedReceipt.data.attachment_path?.trim() || null,
        attachment_name: parsedReceipt.data.attachment_name?.trim() || null
      };
      const { error: updateError } = await supabase.from("ledger_entries").update(common).eq("company_id", companyId).eq("journal_id", journalId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      if (lines[0].source_type === "invoice_receipt") {
        const { error: receiptUpdateError } = await supabase.from("receipts").update({
          reference_number: common.reference_number,
          received_at: `${parsedReceipt.data.entry_date}T00:00:00Z`,
          attachment_path: common.attachment_path,
          attachment_name: common.attachment_name
        }).eq("company_id", companyId).eq("journal_id", journalId);
        if (receiptUpdateError) return NextResponse.json({ error: receiptUpdateError.message }, { status: 500 });
      } else if (lines[0].source_type === "customer_advance") {
        const { error: advanceUpdateError } = await supabase.from("customer_advances").update({
          reference_number: common.reference_number,
          received_at: parsedReceipt.data.entry_date
        }).eq("company_id", companyId).eq("journal_id", journalId);
        if (advanceUpdateError) return NextResponse.json({ error: advanceUpdateError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    const parsed = LedgerEntrySchema.safeParse(body);
    if (!parsed.success || lines.some((line: any) => !["adhoc_expense", "adhoc_income", "opening_balance"].includes(line.source_type))) return NextResponse.json({ error: "This journal type cannot be edited here." }, { status: 400 });

    const isOpening = lines[0].source_type === "opening_balance";
    const isExpense = lines[0].source_type === "adhoc_expense";
    const { data: account } = await supabase.from("account_heads").select("id, type, is_party_account, party_type, is_active").eq("id", parsed.data.account_id).eq("company_id", companyId).single();
    if (!account?.is_active || account.is_party_account || (isOpening ? account.type !== "asset" : account.type !== (isExpense ? "expense" : "income"))) return NextResponse.json({ error: "Selected account is not valid for this entry." }, { status: 400 });
    const primary = lines.find((line: any) => isOpening ? line.journal_line === "Opening asset balance" : line.journal_line === (isExpense ? "Expense" : "Income")) || lines.find((line: any) => isOpening ? line.entry_type === "debit" : line.account_head_id === parsed.data.account_id);
    if (!primary) return NextResponse.json({ error: "The journal is missing its main account line." }, { status: 400 });
    const amount = Number(parsed.data.amount.toFixed(2));
    const common = { amount, entry_date: parsed.data.entry_date, reference_number: parsed.data.reference_number?.trim() || null, description: (parsed.data.description?.trim() || parsed.data.notes?.trim() || (isOpening ? "Opening asset balance" : isExpense ? "Ad-hoc expense" : "Ad-hoc income")).slice(0, 255), notes: parsed.data.notes?.trim() || null, is_accountable: parsed.data.is_accountable, payment_mode: isOpening ? null : parsed.data.payment_mode, attachment_path: typeof body.attachment_path === "string" ? body.attachment_path.trim() || null : null, attachment_name: typeof body.attachment_name === "string" ? body.attachment_name.trim() || null : null };
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
      sourceType: isOpeningBalance ? "opening_balance" : isGstPayment ? "gst_payment" : (isExpense ? "adhoc_expense" : "adhoc_income"),
      attachmentPath: parsed.data.attachment_path || null,
      attachmentName: parsed.data.attachment_name || null
    });
    if (result.error || !result.data) return NextResponse.json({ error: result.error?.message ?? "Could not create balanced journal entry." }, { status: 500 });
    return NextResponse.json({ entries: result.data, journalId: result.journalId }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
