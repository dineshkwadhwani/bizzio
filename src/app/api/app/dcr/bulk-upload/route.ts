import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth-guard";
import { effectiveToggles, moduleEnabled } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const statuses = new Set(["new", "contacted", "interested", "negotiation", "converted", "lost"]);

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashDate = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slashDate) return `${slashDate[3]}-${slashDate[2].padStart(2, "0")}-${slashDate[1].padStart(2, "0")}`;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const parsed = XLSX.SSF.parse_date_code(Number(raw));
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function getDcrEmployee(userId: string) {
  const supabase = createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_sales, permission_overrides, permission_templates(toggles)")
    .eq("user_id", userId)
    .single();
  if (!employee) return { supabase, employee: null, error: "Employee record not found" };

  const toggles = effectiveToggles(
    Array.isArray((employee as any).permission_templates) ? (employee as any).permission_templates[0]?.toggles : (employee as any).permission_templates?.toggles,
    (employee as any).permission_overrides
  );
  const { data: company } = await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id
    ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle()
    : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan.feature_bundle ?? {}) as Record<string, any>, "dcr") || !employee.is_sales || !toggles.submit_dcr) {
    return { supabase, employee: null, error: "DCR access is not enabled for this employee" };
  }
  return { supabase, employee, error: null };
}

export async function GET() {
  try {
    const guard = await requireRole("employee");
    const access = await getDcrEmployee(guard.user.id);
    if (!access.employee) return NextResponse.json({ error: access.error }, { status: 403 });
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["customer_name", "contact_person", "contact_phone", "status", "next_followup_date"]
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "DCR Leads");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Column", "Instructions"],
      ["customer_name", "Required: customer or prospect name"],
      ["contact_person", "Optional contact person"],
      ["contact_phone", "Optional contact phone number"],
      ["status", "Optional: new, contacted, interested, negotiation, converted, or lost"],
      ["next_followup_date", "Optional date in YYYY-MM-DD format"]
    ]), "Instructions");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=DCR-leads-template.xlsx"
      }
    });
  } catch (error) {
    return error as Response;
  }
}

export async function POST(request: Request) {
  let guard;
  try {
    guard = await requireRole("employee");
  } catch (error) {
    return error as Response;
  }

  const access = await getDcrEmployee(guard.user.id);
  if (!access.employee) return NextResponse.json({ error: access.error }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Please select an Excel file." }, { status: 400 });
  if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "Only .xlsx or .xls files are supported." }, { status: 400 });

  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return NextResponse.json({ error: "The Excel file has no worksheet." }, { status: 400 });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  if (!rows.length) return NextResponse.json({ error: "The Excel file has no data rows." }, { status: 400 });
  if (rows.length > 1000) return NextResponse.json({ error: "You can upload a maximum of 1,000 leads at a time." }, { status: 400 });

  const headers = Object.keys(rows[0]).reduce<Record<string, string>>((result, key) => {
    result[normalizeHeader(key)] = key;
    return result;
  }, {});
  if (!headers.customer_name) return NextResponse.json({ error: "The required customer_name column is missing." }, { status: 400 });

  const errors: string[] = [];
  const leads = rows.map((row, index) => {
    const rowNumber = index + 2;
    const customerName = String(row[headers.customer_name] ?? "").trim();
    const contactPerson = headers.contact_person ? String(row[headers.contact_person] ?? "").trim() : "";
    const contactPhone = headers.contact_phone ? String(row[headers.contact_phone] ?? "").trim() : "";
    const status = headers.status ? String(row[headers.status] ?? "").trim().toLowerCase() || "new" : "new";
    const followup = headers.next_followup_date ? parseDate(row[headers.next_followup_date]) : null;
    if (!customerName) errors.push(`Row ${rowNumber}: customer_name is required.`);
    if (!statuses.has(status)) errors.push(`Row ${rowNumber}: invalid status "${status}".`);
    if (headers.next_followup_date && String(row[headers.next_followup_date] ?? "").trim() && !followup) errors.push(`Row ${rowNumber}: next_followup_date is invalid.`);
    return {
      company_id: access.employee!.company_id,
      employee_id: access.employee!.id,
      customer_name: customerName,
      contact_person: contactPerson || null,
      contact_phone: contactPhone || null,
      status,
      next_followup_date: followup
    };
  });
  if (errors.length) return NextResponse.json({ error: "The upload contains invalid rows.", details: errors.slice(0, 50) }, { status: 400 });

  const { data, error } = await access.supabase.from("dcr_leads").insert(leads).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ created: data?.length ?? leads.length });
}
