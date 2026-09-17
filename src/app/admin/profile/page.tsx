import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/layout/BackButton";

export const revalidate = 0;

export default async function CompanyAdminProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <p className="text-ink-400">Please sign in to view your profile.</p>;

  const { data: profile } = await supabase.from("users").select("email, role, company_id").eq("id", user.id).single();
  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle()
    : { data: null };
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? "Company Admin";
  const role = profile?.role?.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase()) ?? "Company Admin";

  return (
    <div className="max-w-xl">
      <BackButton href="/admin/dashboard" label="Back to Dashboard" />
      <h1 className="text-2xl font-bold text-ink-900">My Profile</h1>
      <div className="card mt-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">{name.slice(0, 1).toUpperCase()}</div>
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-lg font-bold text-ink-900">{name}</p>
          <p className="break-all text-ink-600">{profile?.email ?? user.email}</p>
          <p className="text-ink-600">{role}</p>
          {company?.name && <p className="text-ink-600">{company.name}</p>}
        </div>
      </div>
    </div>
  );
}
