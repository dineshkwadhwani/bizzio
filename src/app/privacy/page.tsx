import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

const SECTIONS = [
  { title: "1. Information We Collect", body: "Company registration details, employee profile data, attendance, and financial records entered into the platform." },
  { title: "2. How We Use Information", body: "Solely to provide the Bizzio Online service to your company and its employees." },
  { title: "3. Data Storage", body: "Data is stored in Supabase (PostgreSQL) with row-level security isolating each company's data." },
  { title: "4. Data Sharing", body: "We do not sell or share your data with third parties, except service providers required to operate the platform (email delivery, payments)." },
  { title: "5. Your Rights", body: "[Insert data subject rights reviewed by legal counsel.]" }
];

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold text-ink-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink-500">
          Placeholder content — have this reviewed and finalized by legal counsel before launch.
        </p>
        <div className="mt-8 space-y-6">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h2 className="text-lg font-semibold text-ink-900">{s.title}</h2>
              <p className="mt-1 text-ink-600">{s.body}</p>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
