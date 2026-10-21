export type PayrollSettings = {
  basic_enabled: boolean; hra_enabled: boolean; bonus_enabled: boolean;
  special_allowance_enabled: boolean; other_allowance_enabled: boolean;
  tax_deduction_enabled: boolean; professional_tax_enabled: boolean;
  other_deductions_enabled: boolean; tds_enabled: boolean;
};

export function periodMonth(period: string) {
  if (/^\d{4}-\d{2}(?:-\d{2})?$/.test(period)) return period.slice(0, 7);
  const parsed = new Date(`1 ${period}`);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 7) : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export async function calculatePayroll(supabase: any, companyId: string, employeeId: string, period: string) {
  const month = periodMonth(period); const [year, monthNumber] = month.split("-").map(Number); const first = `${month}-01`; const nextDate = new Date(Date.UTC(year, monthNumber, 1)); const next = nextDate.toISOString().slice(0, 10); const calendarDays = Math.round((nextDate.getTime() - new Date(`${first}T00:00:00Z`).getTime()) / 86400000);
  const [{ data: employee }, { data: settings }, { data: attendance }, { data: leaves }] = await Promise.all([
    supabase.from("employees").select("id, name, employee_code, salary_basic, salary_hra, salary_bonus, salary_special_allowance, salary_other_allowance, salary_tax_deduction, salary_professional_tax, salary_other_deductions, salary_tds").eq("id", employeeId).eq("company_id", companyId).single(),
    supabase.from("company_payroll_settings").select("*").eq("company_id", companyId).maybeSingle(),
    supabase.from("attendance").select("date, status").eq("company_id", companyId).eq("employee_id", employeeId).gte("date", first).lt("date", next),
    supabase.from("leave_requests").select("start_date, end_date, is_half_day, leave_types(is_paid)").eq("company_id", companyId).eq("employee_id", employeeId).eq("status", "approved").lte("start_date", next).gte("end_date", first)
  ]);
  if (!employee) return null;
  const config: PayrollSettings = settings ?? { basic_enabled: true, hra_enabled: true, bonus_enabled: false, special_allowance_enabled: false, other_allowance_enabled: false, tax_deduction_enabled: false, professional_tax_enabled: false, other_deductions_enabled: false, tds_enabled: false };
  const earnings = { Basic: config.basic_enabled ? Number(employee.salary_basic || 0) : 0, HRA: config.hra_enabled ? Number(employee.salary_hra || 0) : 0, Bonus: config.bonus_enabled ? Number(employee.salary_bonus || 0) : 0, "Special Allowance": config.special_allowance_enabled ? Number(employee.salary_special_allowance || 0) : 0, "Other Allowance": config.other_allowance_enabled ? Number(employee.salary_other_allowance || 0) : 0 };
  const deductions = { "Tax Deduction": config.tax_deduction_enabled ? Number(employee.salary_tax_deduction || 0) : 0, "Professional Tax": config.professional_tax_enabled ? Number(employee.salary_professional_tax || 0) : 0, "Other Deductions": config.other_deductions_enabled ? Number(employee.salary_other_deductions || 0) : 0, TDS: config.tds_enabled ? Number(employee.salary_tds || 0) : 0 };
  const grossSalary = Object.values(earnings).reduce((sum, value) => sum + value, 0); const fixedDeductions = deductions["Tax Deduction"] + deductions["Professional Tax"] + deductions["Other Deductions"] + deductions.TDS;
  const presentDays = (attendance ?? []).reduce((sum: number, row: any) => sum + (row.status === "present" ? 1 : row.status === "half_day" ? 0.5 : 0), 0);
  const paidLeaveDays = (leaves ?? []).reduce((sum: number, row: any) => { const type = Array.isArray(row.leave_types) ? row.leave_types[0] : row.leave_types; if (!type?.is_paid) return sum; const startDate = new Date(`${row.start_date}T00:00:00Z`); const endDate = new Date(`${row.end_date}T00:00:00Z`); const from = Math.max(startDate.getTime(), new Date(`${first}T00:00:00Z`).getTime()); const to = Math.min(endDate.getTime(), new Date(`${next}T00:00:00Z`).getTime() - 86400000); return sum + (Math.floor((to - from) / 86400000) + 1) * (row.is_half_day ? 0.5 : 1); }, 0);
  const paidDays = Math.min(calendarDays, presentDays + paidLeaveDays); const calculatedGross = grossSalary * paidDays / calendarDays; const calculatedDeductions = fixedDeductions * paidDays / calendarDays; const calculatedAmount = Math.max(0, calculatedGross - calculatedDeductions); const tdsAmount = deductions.TDS * paidDays / calendarDays;
  return { employee, month, year, monthNumber, first, next, calendarDays, paidDays, grossSalary, deductions, calculatedGross, calculatedDeductions, calculatedAmount, tdsAmount, netMonthlySalary: Math.max(0, grossSalary - fixedDeductions), breakdown: { earnings, deductions } };
}
