import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 0;

export default async function ManageAsAdminPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "superadmin") {
    redirect("/superadmin/companies");
  }

  const { data: company } = await supabase.from("companies").select("id, name").eq("id", params.id).single();
  if (!company) redirect("/superadmin/companies");

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900">Manage as Admin</h1>
      <p className="mt-1 text-sm text-ink-500">Company: {company.name}</p>
      <div className="mt-6 card p-6 text-sm text-ink-600">
        This is the support-mode entrypoint for the company admin experience. The live admin screens remain under the standard /admin/* route tree and are scoped by the company context in this environment.
      </div>
    </div>
  );
}
