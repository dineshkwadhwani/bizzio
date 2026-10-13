"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

type SearchTopic = {
  match: string;
  title: string;
  content: string;
};

export function HelpSearch({ topics, embedded }: { topics: SearchTopic[]; embedded: boolean }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return topics.filter((topic) => `${topic.title} ${topic.content}`.toLowerCase().includes(normalizedQuery)).slice(0, 8);
  }, [normalizedQuery, topics]);

  function hrefFor(match: string) {
    return `/help/finance?path=${encodeURIComponent(match)}${embedded ? "&embedded=true" : ""}`;
  }

  return (
    <div className="relative mt-5 max-w-2xl">
      <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
        <Search size={19} className="shrink-0 text-ink-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search help topics, fields, buttons or workflows…"
          aria-label="Search help topics"
          className="w-full bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
        />
      </div>
      {normalizedQuery ? (
        <div className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xl">
          {results.length ? results.map((result) => (
            <Link key={result.match} href={hrefFor(result.match)} onClick={() => setQuery("")} className="block border-b border-ink-100 px-4 py-3 last:border-0 hover:bg-brand-50">
              <p className="text-sm font-semibold text-ink-900">{result.title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-500">{result.content}</p>
            </Link>
          )) : <p className="px-4 py-4 text-sm text-ink-500">No help topics found for “{query}”.</p>}
        </div>
      ) : null}
    </div>
  );
}
