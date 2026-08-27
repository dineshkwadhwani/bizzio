import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createLedgerEntry } from "@/lib/finance-ledger";

const SalaryPaymentSchema = z.object({
  employee_id: z.string().min(1),
  paid_for_period: z.string().min(1),
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().optional().or(z.literal("")),
  amount: z.coerce.number().min(0).optional()
});

export async function GET(request: Request) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    if (mode === "employees") {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name, email, payable_salary, status")
        .eq("company_id", guard.employee.company_id)
        .eq("status", "active")
        .order("name", { ascending: true });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ employees: data ?? [] });
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
    const guard = await requireFinance();
    const raw = await parsePayload(request);
    const parsed = SalaryPaymentSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const companyId = guard.employee.company_id;

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, company_id, name, payable_salary, status")
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

    const { data: ledgerEntry, error: ledgerError } = await createLedgerEntry(supabase, {
      companyId,
      accountHeadId: salariesHead.id,
      amount,
      paymentMode: parsed.data.payment_mode,
      referenceNumber: parsed.data.reference_number?.trim() || null,
      description: `Salary paid for ${employee.name} — ${parsed.data.paid_for_period}`,
      entryDate: new Date().toISOString().slice(0, 10),
      createdBy: guard.employee.id,
      sourceType: "salary_paid",
      sourceId: null
    });

    if (ledgerError) {
      return NextResponse.json({ error: ledgerError.message }, { status: 500 });
    }

    const { data: salaryPayment, error: paymentError } = await supabase
      .from("salary_payments")
      .insert({
        company_id: companyId,
        employee_id: employee.id,
        ledger_entry_id: ledgerEntry.id,
        amount,
        payment_mode: parsed.data.payment_mode,
        reference_number: parsed.data.reference_number?.trim() || null,
        paid_for_period: parsed.data.paid_for_period,
        paid_by: guard.employee.id
      })
      .select("*")
      .single();

    if (paymentError) {
      return NextResponse.json({ error: paymentError.message }, { status: 500 });
    }

    return NextResponse.json({ salaryPayment, ledgerEntry }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
