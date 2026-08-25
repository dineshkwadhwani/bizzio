"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TitlesPage() {
  const supabase = createClient();
  const [titles, setTitles] = useState<any[]>([]);
  const [newName, setNewName] = useState("");

  async function load() {
    const { data } = await supabase.from("titles").select("id, name, is_active").order("name");
    setTitles(data ?? []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    await supabase.from("titles").insert({ name: newName, company_id: userRow?.company_id });
    setNewName("");
    load();
  }

  async function toggle(t: any) {
    await supabase.from("titles").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Titles / Designations</h1>
      <form onSubmit={add} className="mt-4 flex gap-3">
        <input className="input max-w-xs" placeholder="e.g. Software Engineer" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn-primary">Add</button>
      </form>
      <div className="card mt-6 divide-y divide-ink-50 p-0">
        {titles.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-3">
            <span>{t.name}</span>
            <button onClick={() => toggle(t)} className="btn-secondary">{t.is_active ? "Deactivate" : "Activate"}</button>
          </div>
        ))}
        {!titles.length && <p className="px-4 py-8 text-center text-ink-400">No titles yet.</p>}
      </div>
    </div>
  );
}
