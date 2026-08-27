import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";

function parseExcelDate(value: unknown): string | null {
  if (!value && value !== 0) return null;

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    return raw;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }

  return null;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number(value.toFixed(2));
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/[^0-9.\-]/g, "");
    if (!trimmed || trimmed === "-") return 0;
    return Number(Number(trimmed).toFixed(2));
  }
  return 0;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function detectPossibleDuplicates(supabase: ReturnType<typeof createClient>, companyId: string, importId: string) {
  const { data: rows } = await supabase
    .from("bank_statement_rows")
    .select("row_date, ref_no, withdrawal, deposit")
    .eq("company_id", companyId)
    .eq("status", "posted");

  const existing = (rows ?? []).map((row: any) => {
    const amount = Number((Number(row.deposit || 0) || Number(row.withdrawal || 0)).toFixed(2));
    return {
      row_date: row.row_date,
      ref_no: (row.ref_no || "").trim(),
      amount
    };
  });

  const { data: pendingRows } = await supabase
    .from("bank_statement_rows")
    .select("id, row_date, ref_no, withdrawal, deposit")
    .eq("company_id", companyId)
    .eq("import_id", importId)
    .in("status", ["pending", "possible_duplicate"]);

  for (const row of pendingRows ?? []) {
    const amount = Number((Number(row.deposit || 0) || Number(row.withdrawal || 0)).toFixed(2));
    const refNo = (row.ref_no || "").trim();
    if (!row.row_date || !refNo || !amount) continue;

    const isDuplicate = existing.some((entry) => {
      return entry.row_date === row.row_date && entry.ref_no === refNo && entry.amount === amount;
    });

    if (isDuplicate) {
      await supabase
        .from("bank_statement_rows")
        .update({ status: "possible_duplicate", notes: "Possible duplicate of an already-posted import row." })
        .eq("id", row.id);
    }
  }
}

export async function GET() {
  try {
    const guard = await requireFinance();
    const supabase = createClient();

    const { data, error } = await supabase
      .from("bank_statement_imports")
      .select("*")
      .eq("company_id", guard.employee.company_id)
      .order("uploaded_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ imports: data ?? [] });
  } catch (error) {
    return error as Response;
  }
}

export async function POST(request: Request) {
  try {
    const guard = await requireFinance();
    const formData = await request.formData();
    const file = formData.get("file");
    const batchName = String(formData.get("batch_name") || "Statement Import");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A valid .xlsx file is required." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
      return NextResponse.json({ error: "Only Excel files are supported (.xlsx, .xls)." }, { status: 400 });
    }

    const supabase = createClient();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }) as Record<string, string>[];

    if (!rows.length) {
      return NextResponse.json({ error: "The uploaded Excel file is empty or does not contain data rows." }, { status: 400 });
    }

    const normalizedHeaders = Object.keys(rows[0]).reduce<Record<string, string>>((acc, key) => {
      acc[normalizeHeader(key)] = key;
      return acc;
    }, {});

    const requiredKeys = ["date", "particulars", "ref_no", "chq_no", "withdrawal", "deposit", "balance"];
    const missingKeys = requiredKeys.filter((key) => !normalizedHeaders[key]);
    if (missingKeys.length) {
      return NextResponse.json({ error: `Missing required columns: ${missingKeys.join(", ")}.` }, { status: 400 });
    }

    const { data: importRecord, error: importError } = await supabase
      .from("bank_statement_imports")
      .insert({
        company_id: guard.employee.company_id,
        batch_name: batchName || `Statement Import — ${new Date().toISOString().slice(0, 10)}`,
        uploaded_by: guard.employee.id,
        file_url: null
      })
      .select("*")
      .single();

    if (importError || !importRecord) {
      return NextResponse.json({ error: importError?.message || "Unable to create the import batch." }, { status: 500 });
    }

    const stagedRows = rows.map((row) => {
      const dateValue = row[normalizedHeaders.date];
      const particulars = String(row[normalizedHeaders.particulars] || "").trim();
      const refNo = String(row[normalizedHeaders.ref_no] || "").trim();
      const chqNo = String(row[normalizedHeaders.chq_no] || "").trim();
      const withdrawal = parseAmount(row[normalizedHeaders.withdrawal]);
      const deposit = parseAmount(row[normalizedHeaders.deposit]);
      const balanceDisplay = parseAmount(row[normalizedHeaders.balance]);

      return {
        import_id: importRecord.id,
        company_id: guard.employee.company_id,
        row_date: parseExcelDate(dateValue),
        particulars,
        ref_no: refNo,
        chq_no: chqNo,
        withdrawal: Number(withdrawal.toFixed(2)),
        deposit: Number(deposit.toFixed(2)),
        balance_display: Number(balanceDisplay.toFixed(2)),
        status: "pending",
        assigned_account_head_id: null,
        ledger_entry_id: null,
        notes: null
      };
    });

    const { error: rowsError } = await supabase.from("bank_statement_rows").insert(stagedRows);
    if (rowsError) {
      await supabase.from("bank_statement_imports").delete().eq("id", importRecord.id);
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    await detectPossibleDuplicates(supabase, guard.employee.company_id, importRecord.id);

    return NextResponse.json({ importRecord, rows: stagedRows.length }, { status: 201 });
  } catch (error) {
    return error as Response;
  }
}
