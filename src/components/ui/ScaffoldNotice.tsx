import { Construction } from "lucide-react";

/**
 * Used on screens that are routed + laid out but not yet wired to real data.
 * Points directly at the spec section that defines exact behavior, so
 * Copilot (or a human) can implement against a precise source of truth.
 */
export function ScaffoldNotice({ specRef, children }: { specRef: string; children?: React.ReactNode }) {
  return (
    <div className="card border-dashed">
      <div className="flex items-start gap-3">
        <Construction className="mt-0.5 shrink-0 text-brand-500" size={20} />
        <div>
          <p className="text-sm font-medium text-ink-800">Scaffolded — not yet wired to data</p>
          <p className="mt-1 text-sm text-ink-500">
            Full behavior is defined in <code className="rounded bg-ink-100 px-1 py-0.5">{specRef}</code>.
            {children}
          </p>
        </div>
      </div>
    </div>
  );
}
