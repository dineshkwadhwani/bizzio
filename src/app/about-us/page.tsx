import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-bold text-ink-900">About Bizzio Online</h1>
        <div className="prose prose-ink mt-6 max-w-none text-ink-600">
          <p>
            Bizzio Online is a self-service SaaS platform built for small and
            medium enterprises, bringing attendance tracking, daily sales
            reporting, simple accounting, and expense reimbursement into a
            single, mobile-friendly application.
          </p>
          <p>
            Replace this placeholder with your company&apos;s actual story,
            mission, and team information before launch.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
