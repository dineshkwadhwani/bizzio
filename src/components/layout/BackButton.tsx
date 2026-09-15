"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackButton({ href, label = "Back" }: { href: string; label?: string }) {
  return <Link href={href} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-ink-500 hover:text-ink-900"><ArrowLeft size={16} /> {label}</Link>;
}
