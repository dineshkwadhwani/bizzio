import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFinance } from "@/lib/auth-guard";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { createBalancedJournal, findPaymentAccount } from "@/lib/finance-ledger";

const BulkAssignSchema = z.object({
  row_ids: z.array(z.string()).min(1),
  account_head_id: z.string().min(1).optional(),
  notes: z.string().optional().nullable()
}).refine((value) => value.account_head_id || value.notes !== undefined, { message: "An account or notes value is required." });

const PostRowsSchema = z.object({
  row_ids: z.array(z.string()).min(1),
  force: z.boolean().optional().default(false),
  account_head_ids: z.record(z.string()).optional()
});

const IgnoreRowsSchema = z.object({
  row_ids: z.array(z.string()).min(1),
  notes: z.string().optional().or(z.literal(""))
});

const ReconcileRowsSchema = z.object({ row_ids: z.array(z.string()).min(1) });

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
      .order("row_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
    return NextResponse.json({ importRecord, rows: rows ?? [] });
  } catch (error) {
    return error as Response;
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const guard = await requireFinance();
    const supabase = createClient();
    const { data: rows, error: rowsError } = await supabase
      .from("bank_statement_rows")
      .select("status")
      .eq("import_id", params.id)
      .eq("company_id", guard.employee.company_id)
      .in("status", ["posted", "reconciled"]);
    if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
    if (rows?.length) return NextResponse.json({ error: "This batch cannot be deleted because it contains posted or reconciled transactions." }, { status: 409 });
    const { error } = await supabase.from("bank_statement_imports").delete().eq("id", params.id).eq("company_id", guard.employee.company_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) { return error as Response; }
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
    const update: { assigned_account_head_id?: string; notes?: string | null } = {};
    if (parsed.data.account_head_id) update.assigned_account_head_id = parsed.data.account_head_id;
    if (parsed.data.notes !== undefined) update.notes = parsed.data.notes || null;
    const { error } = await supabase
      .from("bank_statement_rows")
      .update(update)
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

    if (action === "reconcile") {
      const parsed = ReconcileRowsSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
      const { data: rows, error: rowsError } = await supabase.from("bank_statement_rows").select("*").eq("company_id", guard.employee.company_id).eq("import_id", params.id).in("id", parsed.data.row_ids);
      if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
      let reconciled = 0;
      for (const row of rows ?? []) {
        const amount = Number((Number(row.deposit || 0) || Number(row.withdrawal || 0)).toFixed(2));
        if (!row.row_date || !amount) continue;
        const { data: payment } = await supabase
          .from("expense_payments")
          .select("claim_id, reference_number, paid_at, ledger_entry_ids")
          .eq("company_id", guard.employee.company_id)
          .eq("paid_at", `${row.row_date}T00:00:00+00:00`)
          .limit(20);
        const matchingPayment = (payment ?? []).find((candidate: any) => {
          const referenceMatches = !candidate.reference_number || !row.ref_no || candidate.reference_number.trim() === row.ref_no.trim();
          return referenceMatches;
        });
        if (matchingPayment) {
          const { data: claim } = await supabase.from("expense_claims").select("total_amount").eq("id", matchingPayment.claim_id).single();
          if (claim && Number(claim.total_amount) === amount) {
            const firstLedgerId = Array.isArray(matchingPayment.ledger_entry_ids) ? matchingPayment.ledger_entry_ids[0] : null;
            const { error } = await supabase.from("bank_statement_rows").update({ status: "reconciled", ledger_entry_id: firstLedgerId, matched_expense_claim_id: matchingPayment.claim_id, notes: row.notes || "Reconciled to a paid expense claim." }).eq("id", row.id);
            if (!error) {
              await supabase.from("expense_payments").update({ bank_statement_row_id: row.id }).eq("claim_id", matchingPayment.claim_id);
              reconciled += 1;
              continue;
            }
          }
        }
        let query = supabase.from("ledger_entries").select("id, source_id, reference_number").eq("company_id", guard.employee.company_id).eq("source_type", "expense_claim").eq("entry_type", "debit").eq("entry_date", row.row_date).eq("amount", amount).limit(1);
        if (row.ref_no) query = query.eq("reference_number", row.ref_no);
        const { data: entry } = await query.maybeSingle();
        if (!entry?.source_id) continue;
        const { error } = await supabase.from("bank_statement_rows").update({ status: "reconciled", ledger_entry_id: entry.id, matched_expense_claim_id: entry.source_id, notes: row.notes || "Reconciled to a paid expense claim." }).eq("id", row.id);
        if (!error) {
          await supabase.from("expense_payments").update({ bank_statement_row_id: row.id }).eq("claim_id", entry.source_id);
          reconciled += 1;
        }
      }
      return NextResponse.json({ ok: true, reconciled });
    }

    if (action === "post") {
      const parsed = PostRowsSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

      const writeClient = createAdminClient();
      const { data: rows, error: rowsError } = await writeClient
        .from("bank_statement_rows")
        .select("*")
        .eq("company_id", guard.employee.company_id)
        .eq("import_id", params.id)
        .in("id", parsed.data.row_ids);

      if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

      const posted: any[] = [];
      const skipped: Array<{ rowId: string; reason: string }> = [];
      const { data: bankAccount, error: bankAccountError } = await findPaymentAccount(writeClient, guard.employee.company_id, "bank_transfer");
      if (bankAccountError || !bankAccount) {
        return NextResponse.json({ error: "Bank Account asset is missing. Create or activate the Bank Account account head before posting imports." }, { status: 400 });
      }
      for (const row of rows ?? []) {
        if (row.status === "posted" || row.status === "reconciled" || row.status === "ignored") {
          skipped.push({ rowId: row.id, reason: `${row.status}_row` });
          continue;
        }
        if (row.status === "possible_duplicate" && !parsed.data.force) {
          skipped.push({ rowId: row.id, reason: "possible_duplicate" });
          continue;
        }

        const accountHeadId = parsed.data.account_head_ids?.[row.id] || row.assigned_account_head_id;
        if (!accountHeadId) {
          skipped.push({ rowId: row.id, reason: "missing_category" });
          continue;
        }

        const amount = Number((Number(row.deposit || 0) || Number(row.withdrawal || 0)).toFixed(2));
        if (!amount) {
          skipped.push({ rowId: row.id, reason: "missing_amount" });
          continue;
        }

        const isExpense = Number(row.withdrawal || 0) > 0;
        const { data: accountHead, error: accountError } = await writeClient
          .from("account_heads")
          .select("id, type, name, is_party_account, party_type")
          .eq("id", accountHeadId)
          .eq("company_id", guard.employee.company_id)
          .single();

        if (accountError || !accountHead) {
          skipped.push({ rowId: row.id, reason: "invalid_category" });
          continue;
        }

        const lines = isExpense
          ? [
              { accountHeadId, amount, entryType: "debit" as const, label: "Expense/category" },
              { accountHeadId: bankAccount.id, amount, entryType: "credit" as const, label: "Bank" }
            ]
          : [
              { accountHeadId: bankAccount.id, amount, entryType: "debit" as const, label: "Bank" },
              { accountHeadId, amount, entryType: "credit" as const, label: "Income/category" }
            ];
        const { data: ledgerEntries, error: ledgerError, journalId } = await createBalancedJournal(writeClient, {
          companyId: guard.employee.company_id,
          lines,
          paymentMode: "bank_transfer",
          referenceNumber: row.ref_no || null,
          description: [row.particulars, row.notes].filter(Boolean).join(" — ") || `Bank statement import row ${row.id}`,
          notes: row.notes || null,
          entryDate: row.row_date || new Date().toISOString().slice(0, 10),
          createdBy: guard.employee.id,
          sourceType: "bank_import_row",
          sourceId: row.id
        });

        if (ledgerError || !ledgerEntries?.length) {
          skipped.push({ rowId: row.id, reason: ledgerError?.message || "ledger_error" });
          continue;
        }

        await writeClient
          .from("bank_statement_rows")
          .update({ assigned_account_head_id: accountHeadId, journal_id: journalId, ledger_entry_id: ledgerEntries[0].id })
          .eq("id", row.id)
          .eq("company_id", guard.employee.company_id)
          .eq("import_id", params.id);

        const { error: updateRowError } = await writeClient
          .from("bank_statement_rows")
          .update({
            status: "posted",
            ledger_entry_id: ledgerEntries[0].id,
            journal_id: journalId,
            notes: row.notes || (isExpense ? "Posted as expense from bank import." : "Posted as income from bank import.")
          })
          .eq("id", row.id);

        if (!updateRowError) {
          posted.push({ rowId: row.id, journalId, ledgerEntryIds: ledgerEntries.map((entry: any) => entry.id) });
        } else {
          skipped.push({ rowId: row.id, reason: updateRowError.message });
        }
      }

      return NextResponse.json({ ok: true, posted, skipped });
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
