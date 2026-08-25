"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload } from "lucide-react";

export default function BrandingPage() {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (!userRow?.company_id) return;

    const path = `${userRow.company_id}/logo.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
    if (!error) {
      const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path);
      await supabase.from("companies").update({ logo_url: pub.publicUrl }).eq("id", userRow.company_id);
      setLogoUrl(pub.publicUrl);
    }
    setUploading(false);
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-ink-900">Branding</h1>
      <p className="mt-1 text-sm text-ink-500">
        Logo only for v1 — no custom color theming (keeps the orange + pastel theme consistent platform-wide).
      </p>
      <div className="card mt-6">
        {logoUrl && <img src={logoUrl} alt="Company logo" className="mb-4 h-16" />}
        <label className="btn-secondary inline-flex cursor-pointer">
          <Upload size={16} className="mr-2" /> {uploading ? "Uploading…" : "Upload Logo"}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </label>
      </div>
    </div>
  );
}
