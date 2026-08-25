import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

// Razorpay redirects here after a successful Payment Link payment
// (callback_url set in lib/razorpay.ts). The actual account activation
// happens via the /api/webhooks/razorpay handler, independent of this page —
// this is just a friendly confirmation screen for the user's browser.
export default function PaymentSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="card w-full max-w-md text-center">
        <CheckCircle2 className="mx-auto text-green-500" size={40} />
        <h1 className="mt-4 text-xl font-bold text-ink-900">Payment received!</h1>
        <p className="mt-2 text-sm text-ink-600">
          Your account is being activated. You&apos;ll receive an email
          shortly with a link to set your password and log in.
        </p>
        <Link href="/login" className="btn-secondary mt-6 inline-flex">
          Go to Login
        </Link>
      </div>
    </main>
  );
}
