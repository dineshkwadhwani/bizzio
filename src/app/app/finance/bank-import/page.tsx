import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BankImportBatchList } from "@/components/finance/BankImportBatchList";

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

      <BankImportBatchList initialImports={imports ?? []} />
    </div>
  );
}
