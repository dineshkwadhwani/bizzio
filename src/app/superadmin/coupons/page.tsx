import { CouponManager } from "@/components/superadmin/CouponManager";

export const revalidate = 0;

export default function CouponsPage() {
  return <div><p className="text-sm uppercase tracking-[0.24em] text-ink-500">Configuration Manager</p><h1 className="mt-2 text-3xl font-bold text-ink-900">Coupons</h1><p className="mt-1 text-ink-500">Create, edit and expire discount codes used during registration.</p><div className="mt-6"><CouponManager /></div></div>;
}
