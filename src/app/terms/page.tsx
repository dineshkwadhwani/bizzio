import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

const SECTIONS = [
  { title: "1. Acceptance of Terms", body: "By registering for or using Bizzio Online, you agree to be bound by these Terms & Conditions." },
  { title: "2. Description of Service", body: "Bizzio Online provides attendance, reporting, accounting, and expense-reimbursement tools for registered companies and their employees." },
  { title: "3. User Obligations", body: "You are responsible for the accuracy of data entered and for maintaining the confidentiality of your login credentials." },
  { title: "4. Data & Privacy", body: "See our Privacy Policy for details on how company and employee data is stored and used." },
  { title: "5. Limitation of Liability", body: "Bizzio Online is provided on an as-is basis. [Insert liability terms reviewed by legal counsel.]" },
  { title: "6. Termination", body: "[Insert termination conditions reviewed by legal counsel.]" },
  { title: "7. Governing Law", body: "[Insert governing jurisdiction reviewed by legal counsel.]" }
];

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold text-ink-900">Terms &amp; Conditions</h1>
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
