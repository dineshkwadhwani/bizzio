import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const CustomerSchema = z.object({
  name: z.string().min(2),
  gstin: z.string().optional().or(z.literal("")),
  billing_address: z.string().optional().or(z.literal("")),
  shipping_address: z.string().optional().or(z.literal("")),
  contact_person: z.string().optional().or(z.literal("")),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional().or(z.literal("")),
  bank_account_no: z.string().optional().or(z.literal("")),
  bank_ifsc: z.string().optional().or(z.literal("")),
  bank_name: z.string().optional().or(z.literal(""))
});

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("company_id", guard.employee.company_id)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) {
    return error as Response;
  }
}

export async function POST(request: Request) {
  try {
    await requireFinance();
  } catch (error) {
    return error as Response;
  }

  const body = await request.json();
  const parsed = CustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const guard = await requireFinance();
  const supabase = createClient();

  // The DB trigger on customers creates the party account head automatically.
  const { data: customer, error } = await supabase
    .from("customers")
    .insert({
      company_id: guard.employee.company_id,
      name: parsed.data.name.trim(),
      gstin: parsed.data.gstin?.trim() || null,
      billing_address: parsed.data.billing_address?.trim() || null,
      shipping_address: parsed.data.shipping_address?.trim() || null,
      contact_person: parsed.data.contact_person?.trim() || null,
      contact_email: parsed.data.contact_email?.trim() || null,
      contact_phone: parsed.data.contact_phone?.trim() || null,
      bank_account_no: parsed.data.bank_account_no?.trim() || null,
      bank_ifsc: parsed.data.bank_ifsc?.trim() || null,
      bank_name: parsed.data.bank_name?.trim() || null,
      is_active: true
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer }, { status: 201 });
}
