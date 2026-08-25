"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckResult = {
  name: string;
  ok: boolean;
  message: string;
  latencyMs: number | null;
};

type HealthResponse = {
  status: "ok" | "degraded";
  checks: CheckResult[];
  timestamp: string;
};

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/health", { cache: "no-store" });
    setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-16">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">System Health</h1>
          <p className="text-sm text-ink-500">
            Live status of Bizzio Online&apos;s integrations.
          </p>
        </div>
        <button onClick={load} className="btn-secondary" disabled={loading}>
          <RefreshCw size={16} className={cn("mr-2", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {data && (
        <div
          className={cn(
            "mb-6 rounded-xl px-4 py-3 text-sm font-medium",
            data.status === "ok"
              ? "bg-green-50 text-green-700"
              : "bg-amber-50 text-amber-700"
          )}
        >
          Overall status:{" "}
          {data.status === "ok" ? "All systems operational" : "Some integrations need attention"}
          <span className="ml-2 text-xs font-normal opacity-70">
            (checked {new Date(data.timestamp).toLocaleTimeString()})
          </span>
        </div>
      )}

      <div className="space-y-3">
        {data?.checks.map((check) => (
          <div key={check.name} className="card flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              {check.ok ? (
                <CheckCircle2 className="text-green-500" size={22} />
              ) : (
                <XCircle className="text-red-500" size={22} />
              )}
              <div>
                <p className="font-semibold text-ink-900">{check.name}</p>
                <p className="text-sm text-ink-500">{check.message}</p>
              </div>
            </div>
            {check.latencyMs !== null && (
              <span className="text-xs text-ink-400">{check.latencyMs}ms</span>
            )}
          </div>
        ))}
        {!data && loading && <p className="text-sm text-ink-500">Checking integrations…</p>}
      </div>
    </main>
  );
}
