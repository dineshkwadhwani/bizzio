import { createClient } from "@/lib/supabase/server";

/** Throws if the current request isn't authenticated as the given role(s). */
export async function requireRole(...roles: Array<"superadmin" | "company_admin" | "employee">) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("users")
    .select("role, company_id, status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status === "disabled" || !roles.includes(profile.role)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return { user, profile, supabase };
}
