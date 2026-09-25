import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { findPaymentAccount } from "@/lib/finance-ledger";

const SalaryPaymentSchema = z.object({
  employee_id: z.string().min(1),
  paid_for_period: z.string().min(1),
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().optional().or(z.literal("")),
  attachment_path: z.string().trim().nullable().optional(),
  attachment_name: z.string().trim().nullable().optional(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().min(0).optional()
});

function signedChange(entryType: string, accountType: string, amount: number) {
  const debitNormal = accountType === "asset" || accountType === "expense";
  return debitNormal ? (entryType === "debit" ? amount : -amount) : (entryType === "credit" ? amount : -amount);
}

export async function GET(request: Request) {
  try {
    const guard = await requireFinance("finance_salary");
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    if (mode === "account") {
      const employeeId = searchParams.get("employee_id");
      const asOf = searchParams.get("asOf");
      if (!employeeId) return NextResponse.json({ error: "Employee is required." }, { status: 400 });
      const asOfDate = asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : new Date().toISOString().slice(0, 10);

      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .select("id, salary_payable_account_head_id")
        .eq("id", employeeId)
        .eq("company_id", guard.employee.company_id)
        .eq("status", "active")
        .single();
      if (employeeError || !employee?.salary_payable_account_head_id) {
        return NextResponse.json({ error: "Employee salary account not found." }, { status: 404 });
      }

      const { data: account, error: accountError } = await supabase
        .from("account_heads")
        .select("id, name, type, is_active")
        .eq("id", employee.salary_payable_account_head_id)
        .eq("company_id", guard.employee.company_id)
        .single();
      if (accountError || !account) return NextResponse.json({ error: "Employee salary account not found." }, { status: 404 });

      const { data: entries, error: entriesError } = await supabase
        .from("ledger_entries")
        .select("id, entry_date, reference_number, description, notes, entry_type, amount, journal_line")
        .eq("company_id", guard.employee.company_id)
        .eq("account_head_id", account.id)
        .lte("entry_date", asOfDate)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 });

      let balance = 0;
      let debits = 0;
      let credits = 0;
      const transactions = (entries ?? []).map((entry) => {
        const amount = Number(entry.amount || 0);
        if (entry.entry_type === "debit") debits += amount; else credits += amount;
        balance += signedChange(entry.entry_type, account.type, amount);
        return { ...entry, balance };
      });

      return NextResponse.json({ account, asOf: asOfDate, transactions, debits, credits, balance });
    }

    if (mode === "employees") {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, email, employee_code, payable_salary, status, salary_payable_account_head_id")
        .eq("company_id", guard.employee.company_id)
        .eq("status", "active")
        .order("employee_code", { ascending: true });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const accountIds = (data ?? [])
        .map((employee) => employee.salary_payable_account_head_id)
        .filter((id): id is string => Boolean(id));
      const { data: accounts, error: accountsError } = accountIds.length
        ? await supabase
            .from("account_heads")
            .select("id, name, type, is_active")
            .eq("company_id", guard.employee.company_id)
            .in("id", accountIds)
        : { data: [], error: null };

      if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 });

      const accountById = new Map((accounts ?? []).map((account) => [account.id, account]));
      return NextResponse.json({
        employees: (data ?? []).map((employee) => ({
          ...employee,
          salary_account: employee.salary_payable_account_head_id
            ? accountById.get(employee.salary_payable_account_head_id) ?? null
            : null
        }))
      });
    }

    if (mode === "payments") {
      const { data, error } = await supabase
        .from("salary_payments")
        .select("employee_id, paid_for_period, amount, payment_mode, reference_number, paid_at")
        .eq("company_id", guard.employee.company_id)
        .order("paid_at", { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ payments: data ?? [] });
    }

    return NextResponse.json({ error: "Unsupported mode." }, { status: 400 });
  } catch (error) {
    return error as Response;
  }
}

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return request.json();
  }

  const formData = await request.formData();
  const raw: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    raw[key] = String(value);
  }
  return raw;
}

export async function POST(request: Request) {
  try {
    const guard = await requireFinance("finance_salary");
    const raw = await parsePayload(request);
    const parsed = SalaryPaymentSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const companyId = guard.employee.company_id;

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, company_id, name, payable_salary, salary_payable_account_head_id, status")
      .eq("id", parsed.data.employee_id)
      .eq("company_id", companyId)
      .eq("status", "active")
      .single();

    if (employeeError || !employee) {
      return NextResponse.json({ error: "Employee not found in this company." }, { status: 404 });
    }

    const amount = Number(parsed.data.amount ?? employee.payable_salary ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Salary amount must be greater than zero." }, { status: 400 });
    }

    const { data: existingPayment } = await supabase
      .from("salary_payments")
      .select("id, paid_for_period")
      .eq("company_id", companyId)
      .eq("employee_id", employee.id)
      .eq("paid_for_period", parsed.data.paid_for_period)
      .maybeSingle();

    if (existingPayment) {
      return NextResponse.json(
        { error: `Salary for ${parsed.data.paid_for_period} has already been recorded for this employee. Review before paying again.` },
        { status: 409 }
      );
    }

    const { data: salariesHead, error: headError } = await supabase
      .from("account_heads")
      .select("id, name, type")
      .eq("company_id", companyId)
      .eq("name", "Salaries")
      .eq("type", "expense")
      .eq("is_active", true)
      .maybeSingle();

    if (headError) {
      return NextResponse.json({ error: headError.message }, { status: 500 });
    }

    if (!salariesHead) {
      return NextResponse.json({ error: "Salaries account head is missing for this company." }, { status: 400 });
    }

    if (!employee.salary_payable_account_head_id) {
      return NextResponse.json({ error: "The employee's Salary Payable account is missing. Run the employee salary account migration." }, { status: 400 });
    }

    const { data: paymentAccount, error: paymentAccountError } = await findPaymentAccount(supabase, companyId, parsed.data.payment_mode);
    if (paymentAccountError || !paymentAccount) return NextResponse.json({ error: "The selected payment account is missing or inactive." }, { status: 400 });
    const description = `Salary paid for ${employee.name} — ${parsed.data.paid_for_period}`;
    const accrualJournalId = crypto.randomUUID();
    const paymentJournalId = crypto.randomUUID();
    const { data: atomicResult, error: atomicError } = await supabase.rpc("post_atomic_finance_operation", {
      p_operation: "salary_payment",
      p_company_id: companyId,
      p_actor_employee_id: guard.employee.id,
      p_event_type: "salary_payment",
      p_event_date: parsed.data.payment_date,
      p_description: description,
      p_reference_number: parsed.data.reference_number?.trim() || null,
      p_payment_mode: parsed.data.payment_mode,
      p_source_id: employee.id,
      p_payload: {
        employee_id: employee.id,
        amount,
        paid_for_period: parsed.data.paid_for_period,
        paid_at: `${parsed.data.payment_date}T00:00:00.000Z`,
        accrual_journal_id: accrualJournalId,
        payment_journal_id: paymentJournalId
      },
      p_postings: [
        { journal_id: accrualJournalId, payment_mode: null, source_type: "salary_paid", source_id: employee.id, lines: [
          { account_head_id: salariesHead.id, amount, entry_type: "debit", label: "Salary expense" },
          { account_head_id: employee.salary_payable_account_head_id, amount, entry_type: "credit", label: "Salary payable — employee" }
        ]},
        { journal_id: paymentJournalId, source_type: "salary_paid", source_id: employee.id, lines: [
          { account_head_id: employee.salary_payable_account_head_id, amount, entry_type: "debit", label: "Salary payable — employee" },
          { account_head_id: paymentAccount.id, amount, entry_type: "credit", label: parsed.data.payment_mode === "cash" ? "Cash" : "Bank" }
        ]}
      ],
      p_attachment_path: parsed.data.attachment_path?.trim() || null,
      p_attachment_name: parsed.data.attachment_name?.trim() || null
    });
    if (atomicError || !atomicResult?.ok) return NextResponse.json({ error: atomicError?.message ?? "Could not post salary payment." }, { status: 500 });

    const [{ data: salaryPayment }, { data: ledgerEntries }] = await Promise.all([
      supabase.from("salary_payments").select("*").eq("company_id", companyId).eq("transaction_event_id", atomicResult.transaction_event_id).single(),
      supabase.from("ledger_entries").select("*").eq("company_id", companyId).eq("transaction_event_id", atomicResult.transaction_event_id).order("created_at")
    ]);
    return NextResponse.json({ salaryPayment, ledgerEntries: ledgerEntries ?? [] }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
