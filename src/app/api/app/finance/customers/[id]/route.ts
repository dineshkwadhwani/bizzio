import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

const CustomerUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  gstin: z.string().optional().nullable(),
  billing_address: z.string().optional().nullable(),
  shipping_address: z.string().optional().nullable(),
  contact_person: z.string().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  bank_account_no: z.string().optional().nullable(),
  bank_ifsc: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  is_active: z.boolean().optional()
});

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch (error) {
    return error as Response;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const parsed = CustomerUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([_, value]) => value !== undefined).map(([key, value]) => [key, value === "" ? null : value])
    );

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: "No update fields supplied" }, { status: 400 });
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data });
  } catch (error) {
    return error as Response;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("customers")
      .update({ is_active: false })
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ customer: data, deactivated: true });
  } catch (error) {
    return error as Response;
  }
}
