"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

type Card = {
  id: string; name: string; email: string; phone: string | null; profile_photo_url: string | null;
  departments: { name: string } | null;
  titles: { name: string } | null;
  reporting_manager: { name: string } | null;
};

export default function DirectoryPage() {
  const [people, setPeople] = useState<Card[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/app/directory", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Could not load the team directory.");
        setPeople((result.employees as Card[]) ?? []);
      })
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  const filtered = people.filter((p) =>
    [p.name, p.email, p.phone, p.departments?.name, p.titles?.name].some((v) => v?.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Team Directory</h1>
      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="relative mt-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={16} />
        <input className="input pl-9" placeholder="Search name, department, title…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.id} className="card">
            {p.profile_photo_url ? (
              <img src={p.profile_photo_url} alt={`${p.name}'s profile`} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pastel-sky font-bold text-ink-700">{p.name.slice(0, 1)}</div>
            )}
            <p className="mt-3 font-semibold text-ink-900">{p.name}</p>
            <p className="text-sm text-ink-500">{p.titles?.name ?? "—"} · {p.departments?.name ?? "—"}</p>
            <div className="mt-3 space-y-1 text-sm">
              <a href={`mailto:${p.email}`} className="block break-all text-brand-600 hover:underline">{p.email}</a>
              {p.phone ? <a href={`tel:${p.phone}`} className="block text-brand-600 hover:underline">{p.phone}</a> : <p className="text-ink-400">No phone number</p>}
            </div>
            {p.reporting_manager?.name && <p className="mt-2 text-xs text-ink-400">Reports to: {p.reporting_manager.name}</p>}
          </div>
        ))}
        {!filtered.length && <p className="text-ink-400">No matches.</p>}
      </div>
    </div>
  );
}
