"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search } from "lucide-react";

type Card = {
  id: string; name: string; email: string;
  departments: { name: string } | null;
  titles: { name: string } | null;
  reporting_manager: { name: string } | null;
};

export default function DirectoryPage() {
  const supabase = createClient();
  const [people, setPeople] = useState<Card[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase
      .from("employees")
      .select("id, name, email, departments(name), titles(name), reporting_manager:reporting_manager_id(name)")
      .eq("status", "active")
      .order("name")
      .then(({ data }) => setPeople((data as any) ?? []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = people.filter((p) =>
    [p.name, p.departments?.name, p.titles?.name].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Team Directory</h1>
      <div className="relative mt-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
        <input className="input pl-9" placeholder="Search name, department, title…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.id} className="card">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pastel-sky font-bold text-ink-700">
              {p.name.slice(0, 1)}
            </div>
            <p className="mt-3 font-semibold text-ink-900">{p.name}</p>
            <p className="text-sm text-ink-500">{p.titles?.name ?? "—"} · {p.departments?.name ?? "—"}</p>
            <p className="mt-2 text-xs text-ink-400">Reports to: {p.reporting_manager?.name ?? "— (root)"}</p>
          </div>
        ))}
        {!filtered.length && <p className="text-ink-400">No matches.</p>}
      </div>
    </div>
  );
}
