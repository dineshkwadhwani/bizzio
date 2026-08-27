import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase/server";
import { createLedgerEntry } from "@/lib/finance-ledger";

const BulkAssignSchema = z.object({
  row_ids: z.array(z.string()).min(1),
  account_head_id: z.string().min(1)
});

const PostRowsSchema = z.object({
  row_ids: z.array(z.string()).min(1),
  force: z.boolean().optional().default(false)
});

const IgnoreRowsSchema = z.object({
  row_ids: z.array(z.string()).min(1),
  notes: z.string().optional().or(z.literal(""))
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();

    const { data: importRecord, error: importError } = await supabase
      .from("bank_statement_imports")
      .select("*")
      .eq("id", params.id)
      .eq("company_id", guard.employee.company_id)
      .single();

    if (importError || !importRecord) {
      return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
    }

    const { data: rows, error: rowsError } = await supabase
      .from("bank_statement_rows")
      .select("*")
      .eq("import_id", params.id)
      .eq("company_id", guard.employee.company_id)
      .order("created_at", { ascending: true });

    if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
    return NextResponse.json({ importRecord, rows: rows ?? [] });
  } catch (error) {
    return error as Response;
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const body = await request.json();
    const parsed = BulkAssignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("bank_statement_rows")
      .update({ assigned_account_head_id: parsed.data.account_head_id })
      .in("id", parsed.data.row_ids)
      .eq("company_id", guard.employee.company_id)
      .eq("import_id", params.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return error as Response;
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const body = await request.json();
    const action = body.action;
    const supabase = createClient();

    if (action === "post") {
      const parsed = PostRowsSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

      const { data: rows, error: rowsError } = await supabase
        .from("bank_statement_rows")
        .select("*")
        .eq("company_id", guard.employee.company_id)
        .eq("import_id", params.id)
        .in("id", parsed.data.row_ids);

      if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

      const posted: any[] = [];
      for (const row of rows ?? []) {
        if (row.status === "possible_duplicate" && !parsed.data.force) {
          continue;
        }

        if (!row.assigned_account_head_id) {
          continue;
        }

        const amount = Number((Number(row.deposit || 0) || Number(row.withdrawal || 0)).toFixed(2));
        if (!amount) continue;

        const isExpense = Number(row.withdrawal || 0) > 0;
        const { data: accountHead, error: accountError } = await supabase
          .from("account_heads")
          .select("id, type, name, is_party_account, party_type")
          .eq("id", row.assigned_account_head_id)
          .eq("company_id", guard.employee.company_id)
          .single();

        if (accountError || !accountHead) continue;

        const { data: ledgerEntry, error: ledgerError } = await createLedgerEntry(supabase, {
          companyId: guard.employee.company_id,
          accountHeadId: accountHead.id,
          amount,
          paymentMode: "bank_transfer",
          referenceNumber: row.ref_no || null,
          description: row.particulars || `Bank statement import row ${row.id}`,
          entryDate: row.row_date || new Date().toISOString().slice(0, 10),
          createdBy: guard.employee.id,
          sourceType: "bank_import_row",
          sourceId: row.id,
          entryType: isExpense ? "debit" : "credit"
        });

        if (ledgerError) {
          continue;
        }

        const { error: updateRowError } = await supabase
          .from("bank_statement_rows")
          .update({
            status: "posted",
            ledger_entry_id: ledgerEntry.id,
            notes: row.notes || (isExpense ? "Posted as expense from bank import." : "Posted as income from bank import.")
          })
          .eq("id", row.id);

        if (!updateRowError) {
          posted.push({ rowId: row.id, ledgerEntryId: ledgerEntry.id });
        }
      }

      return NextResponse.json({ ok: true, posted });
    }

    if (action === "ignore") {
      const parsed = IgnoreRowsSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

      const { error } = await supabase
        .from("bank_statement_rows")
        .update({ status: "ignored", notes: parsed.data.notes || "Ignored by finance user." })
        .in("id", parsed.data.row_ids)
        .eq("company_id", guard.employee.company_id)
        .eq("import_id", params.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    return error as Response;
  }
}
