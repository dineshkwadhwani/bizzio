"use client";

import { useState } from "react";
import { Upload, UserCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ProfilePhotoUpload({
  employeeId,
  companyId,
  currentUrl
}: {
  employeeId: string;
  companyId: string;
  currentUrl?: string | null;
}) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const path = `${companyId}/${employeeId}/photo.${file.name.split(".").pop()}`;
    const { data: uploaded, error } = await supabase.storage.from("employee-photos").upload(path, file, { upsert: true });
    if (error || !uploaded) {
      setUploading(false);
      return;
    }

    const { data: pub } = supabase.storage.from("employee-photos").getPublicUrl(uploaded.path);
    await supabase.from("employees").update({ profile_photo_url: pub.publicUrl }).eq("id", employeeId);
    setUploading(false);
    window.location.reload();
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-ink-200 bg-ink-50">
        {currentUrl ? (
          <img src={currentUrl} alt="Profile" className="h-full w-full object-cover" />
        ) : (
          <UserCircle className="h-10 w-10 text-ink-400" />
        )}
      </div>
      <label className="btn-secondary inline-flex cursor-pointer text-xs">
        <Upload size={14} className="mr-1" /> {uploading ? "Uploading…" : "Upload Photo"}
        <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      </label>
    </div>
  );
}
