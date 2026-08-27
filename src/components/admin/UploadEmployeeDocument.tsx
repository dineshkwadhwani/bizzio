"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function UploadEmployeeDocument({
  employeeId,
  companyId
}: {
  employeeId: string;
  companyId: string;
}) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState("identity_proof");
  const [message, setMessage] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);

    const path = `${companyId}/${employeeId}/${Date.now()}-${file.name}`;
    const { data: uploaded, error } = await supabase.storage.from("employee-documents").upload(path, file, { upsert: true });

    if (error || !uploaded) {
      setMessage("Upload failed. Please try again.");
      setUploading(false);
      return;
    }

    const { data: publicUrl } = supabase.storage.from("employee-documents").getPublicUrl(uploaded.path);
    const { error: insertError } = await supabase.from("employee_documents").insert({
      employee_id: employeeId,
      company_id: companyId,
      document_type: documentType,
      file_url: publicUrl.publicUrl,
      uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null
    });

    if (insertError) {
      setMessage("Document saved to storage but not linked to employee record.");
    } else {
      setMessage("Document uploaded.");
    }

    setUploading(false);
    e.target.value = "";
    window.location.reload();
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto min-w-[180px]" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
          <option value="identity_proof">Identity Proof</option>
          <option value="address_proof">Address Proof</option>
          <option value="education_certificate">Education Certificate</option>
          <option value="other">Other</option>
        </select>
        <label className="btn-secondary inline-flex cursor-pointer text-xs">
          <Upload size={14} className="mr-1" /> {uploading ? "Uploading…" : "Add Document"}
          <input type="file" className="hidden" onChange={handleUpload} />
        </label>
      </div>
      {message && <p className="text-xs text-ink-500">{message}</p>}
    </div>
  );
}
