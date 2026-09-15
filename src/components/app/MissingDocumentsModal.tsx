"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MissingDocumentsModal({ missing }: { missing: string[] }) {
  const pathname = usePathname();
  if (!missing.length || pathname === "/app/profile") return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-md">
        <h2 className="text-xl font-bold text-ink-900">Documents required</h2>
        <p className="mt-3 text-sm text-ink-600">Please submit the following mandatory documents before continuing:</p>
        <ul className="mt-3 list-disc pl-5 text-sm text-red-700">
          {missing.map((document) => <li key={document}>{document}</li>)}
        </ul>
        <Link href="/app/profile" className="btn-primary mt-6 inline-flex w-full justify-center">Go to My Profile</Link>
      </div>
    </div>
  );
}
