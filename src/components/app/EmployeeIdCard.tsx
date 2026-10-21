"use client";

import { Download, UserCircle } from "lucide-react";

type EmployeeIdCardProps = {
  employee: {
    name: string;
    employee_code?: string | null;
    profile_photo_url?: string | null;
  };
  company: {
    name: string;
    logo_url?: string | null;
    branding_color?: string | null;
    branding_font_color?: string | null;
  };
};

export function EmployeeIdCard({ employee, company }: EmployeeIdCardProps) {
  const accentColor = /^#[0-9a-f]{6}$/i.test(company.branding_color ?? "") ? company.branding_color! : "#f97316";
  const fontColor = /^#[0-9a-f]{6}$/i.test(company.branding_font_color ?? "") ? company.branding_font_color! : "#ffffff";

  function downloadPdf() {
    document.body.classList.add("printing-employee-id-card");
    window.addEventListener(
      "afterprint",
      () => document.body.classList.remove("printing-employee-id-card"),
      { once: true },
    );
    window.print();
  }

  return (
    <section className="card mt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-ink-900">My ID Card</h2>
          <p className="mt-1 text-sm text-ink-500">Download a credit-card-sized PDF copy of your employee ID.</p>
        </div>
        <button type="button" onClick={downloadPdf} className="btn-secondary shrink-0 text-xs">
          <Download size={15} className="mr-1.5" /> Download PDF
        </button>
      </div>

      <div className="mt-5 flex justify-center rounded-xl bg-ink-50 p-5">
        <div className="employee-id-card-printable flex h-[86mm] w-[54mm] flex-col overflow-hidden rounded-[14px] border bg-white shadow-card" style={{ borderColor: accentColor }}>
          <div className="flex min-h-[22mm] flex-col items-center justify-center px-3 py-2 text-center" style={{ backgroundColor: accentColor, color: fontColor }}>
            {company.logo_url ? <img src={company.logo_url} alt="" className="mb-1 max-h-7 max-w-[35mm] object-contain" /> : null}
            <p className="text-[11px] font-bold leading-tight">{company.name}</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-3 py-3">
            <div className="flex h-[34mm] w-[27mm] items-center justify-center overflow-hidden rounded-lg border-2 bg-ink-50" style={{ borderColor: accentColor }}>
              {employee.profile_photo_url ? <img src={employee.profile_photo_url} alt={`${employee.name}'s ID photo`} className="h-full w-full object-cover" /> : <UserCircle className="h-16 w-16 text-ink-300" />}
            </div>
            <p className="mt-3 text-center text-[11px] font-bold leading-tight text-ink-900">{employee.name}</p>
            {employee.employee_code ? <p className="mt-1 text-center text-[8px] text-ink-500">{employee.employee_code}</p> : null}
          </div>
          <div className="h-1.5" style={{ backgroundColor: accentColor }} />
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-400">Your browser will open the print dialog. Choose “Save as PDF”.</p>
    </section>
  );
}
