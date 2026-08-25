import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500 text-xs font-bold text-white">
              B
            </span>
            <span className="text-base font-bold text-ink-900">Bizzio.online</span>
          </div>
          <p className="mt-3 text-sm text-ink-500">
            One platform for attendance, reporting, accounting, and expenses — built for SMEs.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink-900">Quick Links</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            <li><Link href="/" className="hover:text-brand-600">Home</Link></li>
            <li><Link href="/#features" className="hover:text-brand-600">Features</Link></li>
            <li><Link href="/pricing" className="hover:text-brand-600">Pricing</Link></li>
            <li><Link href="/about-us" className="hover:text-brand-600">About Us</Link></li>
            <li><Link href="/contact-us" className="hover:text-brand-600">Contact Us</Link></li>
            <li><Link href="/login" className="hover:text-brand-600">Login</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink-900">Legal</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            <li><Link href="/terms" className="hover:text-brand-600">Terms &amp; Conditions</Link></li>
            <li><Link href="/privacy" className="hover:text-brand-600">Privacy Policy</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-ink-900">Contact</h4>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            <li>Office No. 302, 3rd Floor, Rose Icon Amenity Building, Survey No. 71, Pimple Saudagar, Pune – 411027, India</li>
            <li><a href="tel:+919604188725" className="hover:text-brand-600">+91 9604188725</a></li>
            <li><a href="mailto:contact@bizzio.online" className="hover:text-brand-600">contact@bizzio.online</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-100 py-4 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} Bizzio Online. All rights reserved.
      </div>
    </footer>
  );
}
