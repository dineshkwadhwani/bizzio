import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const VendorSchema = z.object({
  name: z.string().min(2),
  gstin: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  contact_person: z.string().optional().or(z.literal("")),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_phone: z.string().optional().or(z.literal("")),
  bank_account_no: z.string().optional().or(z.literal("")),
  bank_ifsc: z.string().optional().or(z.literal("")),
  bank_name: z.string().optional().or(z.literal(""))
});

export async function GET() {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("company_id, is_finance")
    .eq("user_id", guard.user.id)
    .single();

  if (!employee || !employee.is_finance) {
    return NextResponse.json({ error: "Finance access required" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("company_id", employee.company_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (res) {
    return res as Response;
  }

  const parsed = VendorSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("company_id, is_finance")
    .eq("user_id", guard.user.id)
    .single();

  if (!employee || !employee.is_finance) {
    return NextResponse.json({ error: "Finance access required" }, { status: 403 });
  }

  const { data: vendor, error } = await supabase
    .from("vendors")
    .insert({
      company_id: employee.company_id,
      name: parsed.data.name.trim(),
      gstin: parsed.data.gstin?.trim() || null,
      address: parsed.data.address?.trim() || null,
      state: parsed.data.state?.trim() || null,
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
  return NextResponse.json({ vendor }, { status: 201 });
}
