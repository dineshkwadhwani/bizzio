"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV_ITEMS = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about-us", label: "About Us" },
  { href: "/contact-us", label: "Contact Us" }
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            B
          </span>
          <span className="text-lg font-bold tracking-tight text-ink-900">
            Bizzio<span className="text-brand-500">.online</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-ink-600 transition hover:text-ink-900"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/login" className="btn-primary">
            Login
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="rounded-lg p-2 text-ink-700 md:hidden"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile slide-out panel */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-ink-900/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col bg-white p-6 shadow-xl">
            <div className="mb-8 flex items-center justify-between">
              <span className="text-lg font-bold text-ink-900">Menu</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={22} />
              </button>
            </div>
            <Link href="/" onClick={() => setOpen(false)} className="py-3 text-ink-700">
              Home
            </Link>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-3 text-ink-700"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="btn-primary mt-6 w-full"
            >
              Login
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
