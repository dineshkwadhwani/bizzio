"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

export default function ApprovalsPage() {
  const supabase = createClient();
  const [steps, setSteps] = useState<any[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    const { data: me } = await supabase.from("employees").select("id").eq("user_id", auth.user?.id).single();
    if (!me) return;

    const { data } = await supabase
      .from("approval_steps")
      .select("*")
      .eq("approver_employee_id", me.id)
      .eq("status", "pending")
      .order("created_at");

    // Hydrate each step with its underlying entity (only leave_request wired for now).
    const hydrated = await Promise.all(
      (data ?? []).map(async (step) => {
        if (step.entity_type === "leave_request") {
          const { data: lr } = await supabase
            .from("leave_requests")
            .select("*, leave_types(name), employees(name)")
            .eq("id", step.entity_id)
            .single();
          return { ...step, detail: lr };
        }
        return { ...step, detail: null };
      })
    );
    setSteps(hydrated);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(stepId: string, decision: "approved" | "rejected") {
    setLoading(stepId);
    await fetch(`/api/app/approvals/${stepId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment: comments[stepId] })
    });
    setLoading(null);
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Pending Approvals</h1>
      <p className="mt-1 text-sm text-ink-500">
        Unified inbox — Leave is fully wired; Timesheet and Expense approvals plug
        into this same table (Database-Schema-v1.md §3).
      </p>

      <div className="mt-6 space-y-4">
        {steps.map((s) => (
          <div key={s.id} className="card">
            {s.entity_type === "leave_request" && s.detail && (
              <>
                <p className="font-semibold text-ink-900">
                  {s.detail.employees?.name} — {s.detail.leave_types?.name}
                </p>
                <p className="text-sm text-ink-500">
                  {formatDate(s.detail.start_date)} to {formatDate(s.detail.end_date)}
                  {s.level === 2 && " · Level 2 approval"}
                </p>
                <p className="mt-1 text-sm text-ink-600">{s.detail.reason}</p>
              </>
            )}
            <textarea
              className="input mt-3"
              placeholder="Comment (required if rejecting)"
              value={comments[s.id] ?? ""}
              onChange={(e) => setComments((c) => ({ ...c, [s.id]: e.target.value }))}
            />
            <div className="mt-3 flex gap-3">
              <button disabled={loading === s.id} onClick={() => decide(s.id, "approved")} className="btn-primary">Approve</button>
              <button disabled={loading === s.id} onClick={() => decide(s.id, "rejected")} className="btn-secondary text-red-600">Reject</button>
            </div>
          </div>
        ))}
        {!steps.length && <p className="text-ink-400">No pending approvals.</p>}
      </div>
    </div>
  );
}
