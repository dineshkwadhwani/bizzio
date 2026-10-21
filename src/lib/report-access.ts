import { effectiveToggles, type Toggles } from "@/lib/permissions";

export type ReportEmployee = {
  id: string;
  company_id: string;
  name: string;
  employee_code: string | null;
  hierarchy_role: string | null;
  reporting_manager_id: string | null;
  is_manager: boolean;
  is_director: boolean;
  permission_overrides: Toggles | null;
  permission_templates?: { toggles?: Toggles | null } | { toggles?: Toggles | null }[] | null;
  titles?: { default_permission_template_id: string | null } | { default_permission_template_id: string | null }[] | null;
};

export async function getReportEmployee(supabase: any, userId: string) {
  const { data: employee, error } = await supabase
    .from("employees")
    .select("id, company_id, name, employee_code, hierarchy_role, reporting_manager_id, is_manager, is_director, permission_overrides, permission_templates(toggles), titles(default_permission_template_id)")
    .eq("user_id", userId)
    .single();
  if (error || !employee) return { employee: null, toggles: {}, error };

  const assignedTemplate = Array.isArray(employee.permission_templates) ? employee.permission_templates[0] : employee.permission_templates;
  const title = Array.isArray(employee.titles) ? employee.titles[0] : employee.titles;
  const { data: titleTemplate } = title?.default_permission_template_id
    ? await supabase.from("permission_templates").select("toggles").eq("id", title.default_permission_template_id).maybeSingle()
    : { data: null };
  const toggles = effectiveToggles(titleTemplate?.toggles ?? assignedTemplate?.toggles, employee.permission_overrides);
  return { employee: employee as ReportEmployee, toggles, error: null };
}

export async function getReportScope(supabase: any, employee: ReportEmployee) {
  const role = employee.hierarchy_role ?? (employee.is_manager || employee.is_director ? "manager" : "employee");
  const { data: employees } = await supabase
    .from("employees")
    .select("id, company_id, name, employee_code, hierarchy_role, reporting_manager_id, is_manager, is_director")
    .eq("company_id", employee.company_id)
    .eq("status", "active")
    .order("name");
  const activeEmployees = employees ?? [];
  if (role === "employee") return { employees: activeEmployees.filter((row: any) => row.id === employee.id), ids: [employee.id] };
  if (role === "director" || role === "ceo") return { employees: activeEmployees, ids: activeEmployees.map((row: any) => row.id) };

  const subordinateIds = new Set<string>();
  for (const row of activeEmployees) {
    const { data: subordinate, error } = await supabase.rpc("is_subordinate_of", { target: row.id, manager: employee.id });
    if (!error && subordinate) subordinateIds.add(row.id);
  }
  const visible = activeEmployees.filter((row: any) => row.id === employee.id || subordinateIds.has(row.id));
  return { employees: visible, ids: visible.map((row: any) => row.id) };
}

export function employeeDisplayName(employee: { name: string; employee_code?: string | null }) {
  return employee.employee_code ? `${employee.name} (${employee.employee_code})` : employee.name;
}

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = monthNumber === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
  return { first: `${month}-01`, next: nextMonth };
}
