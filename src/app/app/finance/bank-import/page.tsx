import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function BankImportPage() {
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
        <h1 className="text-2xl font-bold text-ink-900">Bank Statement Import</h1>
        <p className="mt-2 text-sm text-red-600">Finance access is required to review bank imports.</p>
      </div>
    );
  }

  const { data: imports } = await supabase
    .from("bank_statement_imports")
    .select("*")
    .eq("company_id", employee.company_id)
    .order("uploaded_at", { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink-900">Bank Statement Import</h1>
        <Link href="/app/finance/bank-import/new" className="btn-primary">
          <Plus size={16} className="mr-2" /> Upload Statement
        </Link>
      </div>

      <div className="card mt-6 p-0">
        <div className="divide-y divide-ink-50">
          {imports?.map((item: any) => (
            <Link key={item.id} href={`/app/finance/bank-import/${item.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-50">
              <div>
                <p className="font-medium text-ink-800">{item.batch_name}</p>
                <p className="text-ink-400">{new Date(item.uploaded_at).toLocaleString()}</p>
              </div>
              <span className="badge bg-ink-100 text-ink-600">Open batch</span>
            </Link>
          ))}
          {!imports?.length && <p className="px-4 py-8 text-center text-ink-400">No imports uploaded yet.</p>}
        </div>
      </div>
    </div>
  );
}
