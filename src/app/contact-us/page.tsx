import { MapPin, Phone, Mail, Globe } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold text-ink-900">Contact</h1>
        <div className="card mt-8 space-y-5">
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 shrink-0 text-brand-500" size={20} />
            <p className="text-ink-700">
              Office No. 302, 3rd Floor, Rose Icon Amenity Building,
              <br />Survey No. 71, Pimple Saudagar, Pune – 411027, India
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Phone className="shrink-0 text-brand-500" size={20} />
            <p className="text-ink-700">
              <a href="tel:+919604188725" className="hover:text-brand-600">+91 9604188725</a>
              {" / "}
              <a href="tel:+919604188726" className="hover:text-brand-600">9604188726</a>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="shrink-0 text-brand-500" size={20} />
            <a href="mailto:contact@bizzio.online" className="text-ink-700 hover:text-brand-600">
              contact@bizzio.online
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Globe className="shrink-0 text-brand-500" size={20} />
            <a href="https://www.bizzio.online" className="text-ink-700 hover:text-brand-600">
              www.bizzio.online
            </a>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
