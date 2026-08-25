"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ApprovalSettingsPage() {
  const supabase = createClient();
  const [depth, setDepth] = useState(1);
  const [subteam, setSubteam] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
      if (!userRow?.company_id) return;
      setCompanyId(userRow.company_id);
      const { data: company } = await supabase
        .from("companies")
        .select("approval_hierarchy_depth, subteam_feature_enabled")
        .eq("id", userRow.company_id)
        .single();
      if (company) {
        setDepth(company.approval_hierarchy_depth);
        setSubteam(company.subteam_feature_enabled);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(newDepth: number) {
    setDepth(newDepth);
    if (companyId) await supabase.from("companies").update({ approval_hierarchy_depth: newDepth }).eq("id", companyId);
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-ink-900">Approval Settings</h1>
      <div className="card mt-6">
        <label className="label">Approval Hierarchy Depth (Leave &amp; Timesheet)</label>
        <p className="mb-3 text-sm text-ink-500">
          Expense Reimbursement uses its own per-category depth instead — see Expense Categories.
        </p>
        <div className="flex gap-3">
          <button onClick={() => save(1)} className={depth === 1 ? "btn-primary" : "btn-secondary"}>
            1 — Manager only
          </button>
          <button onClick={() => save(2)} className={depth === 2 ? "btn-primary" : "btn-secondary"}>
            2 — Manager + Manager&apos;s Manager
          </button>
        </div>
      </div>

      <div className="card mt-6">
        <p className="text-sm text-ink-600">
          Sub-team / 2nd department level is a SuperAdmin-controlled feature flag.
          Current status: <strong>{subteam ? "Enabled" : "Disabled"}</strong> for your company.
        </p>
      </div>
    </div>
  );
}
