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

/** Throws if the caller is not an active finance employee for this company. */
export async function requireFinance() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });

  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_finance, finance_scope, status, left_at")
    .eq("user_id", user.id)
    .single();

  if (
    !employee ||
    employee.status !== "active" ||
    employee.left_at ||
    !employee.is_finance
  ) {
    throw new Response("Forbidden", { status: 403 });
  }

  return { user, employee, supabase, finance_scope: employee.finance_scope };
} 
