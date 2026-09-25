import { createClient } from "@/lib/supabase/server";
import { effectiveToggles, hasPermission, moduleEnabled } from "@/lib/permissions";
import type { ModuleKey } from "@/lib/permissions";

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

  if (profile.role === "employee") {
    const { data: employee } = await supabase
      .from("employees")
      .select("status, left_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!employee || employee.status !== "active" || employee.left_at) {
      throw new Response("Forbidden", { status: 403 });
    }
  }

  return { user, profile, supabase };
}

/** Authenticates an employee and verifies that the company's package includes a module. */
export async function requireModule(module: ModuleKey) {
  const guard = await requireRole("employee");
  const { data: employee } = await guard.supabase
    .from("employees")
    .select("id, company_id, status, left_at")
    .eq("user_id", guard.user.id)
    .single();
  if (!employee || employee.status !== "active" || employee.left_at) throw new Response("Forbidden", { status: 403 });
  const { data: company } = await guard.supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id
    ? await guard.supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle()
    : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, module)) {
    throw new Response(`This company does not have access to the ${module} module.`, { status: 403 });
  }
  return { ...guard, employee };
}

/** Throws if the caller is not an active finance employee for this company. */
export async function requireFinance(permission?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });

  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_finance, finance_scope, status, left_at, permission_overrides, permission_templates(toggles)")
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

  const { data: company } = await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id
    ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle()
    : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, "finance")) {
    throw new Response("This company does not have access to the Finance module.", { status: 403 });
  }
  const template = Array.isArray((employee as any).permission_templates) ? (employee as any).permission_templates[0] : (employee as any).permission_templates;
  if (permission && !hasPermission(effectiveToggles(template?.toggles, employee.permission_overrides), permission)) {
    throw new Response("The required Finance permission is not enabled.", { status: 403 });
  }

  return { user, employee, supabase, finance_scope: employee.finance_scope };
}

/** Allows employees who are explicitly Operations users. */
export async function requireOperations(permission?: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_operations, is_finance, finance_scope, status, left_at, permission_overrides, permission_templates(toggles)")
    .eq("user_id", user.id)
    .single();
  if (!employee || employee.status !== "active" || employee.left_at || !employee.is_operations) {
    throw new Response("Forbidden", { status: 403 });
  }
  const { data: company } = await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id
    ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle()
    : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, "finance")) throw new Response("This company does not have access to the Operations module.", { status: 403 });
  const template = Array.isArray((employee as any).permission_templates) ? (employee as any).permission_templates[0] : (employee as any).permission_templates;
  if (permission && !hasPermission(effectiveToggles(template?.toggles, employee.permission_overrides), permission)) throw new Response("The required Operations permission is not enabled.", { status: 403 });
  return { user, employee, supabase, finance_scope: employee.finance_scope };
}

/** Sales capability is used for the Sales workspace, including quotations. */
export async function requireSales(permission = "sales_quotations") {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  const { data: employee } = await supabase
    .from("employees")
    .select("id, company_id, is_finance, is_sales, finance_scope, status, left_at, permission_overrides, permission_templates(toggles)")
    .eq("user_id", user.id)
    .single();
  const template = Array.isArray((employee as any)?.permission_templates)
    ? (employee as any).permission_templates[0]
    : (employee as any)?.permission_templates;
  const toggles = effectiveToggles(template?.toggles, employee?.permission_overrides);
  if (!employee || employee.status !== "active" || employee.left_at || !employee.is_sales || toggles[permission] !== true) {
    throw new Response("Forbidden", { status: 403 });
  }
  const { data: company } = await supabase.from("companies").select("plan_id").eq("id", employee.company_id).maybeSingle();
  const { data: plan } = company?.plan_id
    ? await supabase.from("subscription_plans").select("feature_bundle, is_active").eq("id", company.plan_id).maybeSingle()
    : { data: null };
  if (!plan?.is_active || !moduleEnabled((plan?.feature_bundle ?? {}) as Record<string, any>, "finance")) throw new Response("This company does not have access to the Sales module.", { status: 403 });
  return { user, employee, supabase, finance_scope: employee.finance_scope };
}
