"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const DOCUMENT_TYPES = [
  ["aadhar", "Aadhaar Card", true],
  ["pan", "PAN Card", true],
  ["address_proof", "Address Proof", false],
  ["education_document", "Education Documents", false],
  ["employment_document", "Employment Documents", false]
] as const;

export function EmployeeDocumentUpload({ employeeId, companyId, documents }: {
  employeeId: string;
  companyId: string;
  documents: { document_type: string; file_url: string }[];
}) {
  const supabase = createClient();
  const [documentType, setDocumentType] = useState("aadhar");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(type: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);
    const path = `${companyId}/${employeeId}/${Date.now()}-${file.name}`;
    const { data, error } = await supabase.storage.from("employee-documents").upload(path, file, { upsert: false });
    if (error || !data) {
      setMessage("Upload failed. Please try again.");
      setUploading(false);
      return;
    }
    const { error: saveError } = await supabase.from("employee_documents").insert({
      employee_id: employeeId,
      company_id: companyId,
      document_type: type,
      file_url: data.path,
      uploaded_by: employeeId
    });
    setMessage(saveError ? "The file uploaded but could not be saved." : "Document uploaded.");
    setUploading(false);
    event.target.value = "";
    if (!saveError) window.location.reload();
  }

  return (
    <div className="card mt-6">
      <h2 className="font-semibold text-ink-900">Required Documents</h2>
      <p className="mt-1 text-sm text-ink-500">Aadhaar and PAN are mandatory. Please upload clear, readable copies.</p>
      <div className="mt-4 space-y-3">
        {DOCUMENT_TYPES.map(([type, label, required]) => {
          const uploaded = documents.some((document) => document.document_type === type);
          return (
            <div key={type} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-100 p-3">
              <div>
                <p className="text-sm font-medium text-ink-800">{label} {required && <span className="text-red-600">*</span>}</p>
                <p className={`text-xs ${uploaded ? "text-green-600" : required ? "text-red-600" : "text-ink-400"}`}>
                  {uploaded ? "Uploaded" : required ? "Required" : "Not uploaded"}
                </p>
              </div>
              <label className="btn-secondary inline-flex cursor-pointer text-xs">
                <Upload size={14} className="mr-1" /> {uploading && documentType === type ? "Uploading…" : "Upload"}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploading} onChange={(event) => { setDocumentType(type); void upload(type, event); }} />
              </label>
            </div>
          );
        })}
      </div>
      {message && <p className="mt-3 text-sm text-ink-600">{message}</p>}
    </div>
  );
}
