import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function VendorsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: employee } = await supabase
    .from("employees")
    .select("company_id, is_finance")
    .eq("user_id", user?.id)
    .single();

  if (!employee || !employee.is_finance) {
    return (
      <div className="card">
        <h1 className="text-2xl font-bold text-ink-900">Vendor Master</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to manage vendors.</p>
      </div>
    );
  }

  const { data: vendors } = await supabase
    .from("vendors")
    .select("*")
    .eq("company_id", employee.company_id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Vendor Master</h1>
        <Link href="/app/finance/vendors/new" className="btn-primary">
          <Plus size={16} className="mr-2" /> Add Vendor
        </Link>
      </div>

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {vendors?.map((vendor: any) => (
            <div key={vendor.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-ink-800">{vendor.name}</p>
                <p className="text-ink-400">{vendor.contact_person || "No contact person"} · {vendor.contact_phone || "No phone"}</p>
              </div>
              <span className={`badge ${vendor.is_active ? "bg-green-50 text-green-700" : "bg-ink-100 text-ink-500"}`}>
                {vendor.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          ))}
          {!vendors?.length && <p className="px-4 py-8 text-center text-ink-400">No vendors added yet.</p>}
        </div>
      </div>
    </div>
  );
}
