"use client";

import { useMemo } from "react";

export type AccountOption = {
  id: string;
  label: string;
  kind: "head" | "party";
  type: "expense" | "income";
  party_type: "vendor" | "customer" | null;
  group: string;
};

export function AccountPicker({
  options,
  value,
  onChange,
  label = "Account"
}: {
  options: AccountOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const grouped = useMemo(() => {
    const groups = new Map<string, AccountOption[]>();
    options.forEach((option) => {
      const key = option.group || "Accounts";
      const current = groups.get(key) || [];
      groups.set(key, [...current, option]);
    });
    return Array.from(groups.entries());
  }, [options]);

  return (
    <div>
      <label className="label">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required>
        {!options.length && <option value="">No matching accounts available</option>}
        {grouped.map(([groupLabel, groupedOptions]) => (
          <optgroup key={groupLabel} label={groupLabel}>
            {groupedOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
