import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const ReceiptSchema = z.object({
  invoice_id: z.string().min(1),
  payment_mode: z.enum(["cash", "cheque", "bank_transfer"]),
  reference_number: z.string().optional().or(z.literal(""))
});

export async function POST(request: Request) {
  try {
    const guard = await requireFinance();
    const body = await request.json();
    const parsed = ReceiptSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", parsed.data.invoice_id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Invoice not found in this company" }, { status: 404 });
    }

    const { data: existingReceipt, error: receiptCheckError } = await supabase
      .from("receipts")
      .select("id")
      .eq("invoice_id", invoice.id)
      .eq("company_id", guard.employee.company_id)
      .maybeSingle();

    if (receiptCheckError) {
      return NextResponse.json({ error: receiptCheckError.message }, { status: 500 });
    }

    if (existingReceipt) {
      return NextResponse.json({ error: "A receipt already exists for this invoice" }, { status: 400 });
    }

    const { data: result, error: rpcError } = await supabase.rpc("create_invoice_receipt_posting", {
      p_invoice_id: invoice.id,
      p_company_id: guard.employee.company_id,
      p_payment_mode: parsed.data.payment_mode,
      p_reference_number: parsed.data.reference_number?.trim() || null,
      p_received_by: guard.employee.id
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const { data: receipt, error: receiptFetchError } = await supabase
      .from("receipts")
      .select("*")
      .eq("invoice_id", invoice.id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (receiptFetchError || !receipt) {
      return NextResponse.json({ error: "Receipt created but could not be loaded" }, { status: 500 });
    }

    return NextResponse.json({ receipt, result }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
