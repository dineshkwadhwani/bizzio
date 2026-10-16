import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

// Razorpay redirects here after payment verification. Payment does not bypass
// the platform approval workflow; the account is activated after approval.
export default function PaymentSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="card w-full max-w-md text-center">
        <CheckCircle2 className="mx-auto text-green-500" size={40} />
        <h1 className="mt-4 text-xl font-bold text-ink-900">Payment received!</h1>
        <p className="mt-2 text-sm text-ink-600">
          Your payment was received. Your registration is now awaiting platform
          approval. You&apos;ll receive an email after approval with a link to set
          your password and log in.
        </p>
        <Link href="/login" className="btn-secondary mt-6 inline-flex">
          Go to Login
        </Link>
      </div>
    </main>
  );
}
