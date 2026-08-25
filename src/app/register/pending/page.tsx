import Link from "next/link";
import { MailCheck } from "lucide-react";

export default function RegisterPendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="card w-full max-w-md text-center">
        <MailCheck className="mx-auto text-brand-500" size={40} />
        <h1 className="mt-4 text-xl font-bold text-ink-900">
          Thank you for registering!
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Your application is under review. You&apos;ll receive an email once
          it&apos;s approved.
        </p>
        <Link href="/" className="btn-secondary mt-6 inline-flex">
          Back to home
        </Link>
      </div>
    </main>
  );
}
