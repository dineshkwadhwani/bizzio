import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Bizzio Online — Attendance, DCR, Accounting & Expenses for SMEs",
  description:
    "One platform for attendance tracking, daily call reporting, simple accounting, and expense reimbursement — built for Indian SMEs.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://bizzio.online")
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
