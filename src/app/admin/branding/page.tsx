"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Upload } from "lucide-react";
import { BackButton } from "@/components/layout/BackButton";

export default function BrandingPage() {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandingColor, setBrandingColor] = useState("#f97316");
  const [brandingFontColor, setBrandingFontColor] = useState("#ffffff");
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadLogo() {
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (!userRow?.company_id) return;
    const { data: company } = await supabase.from("companies").select("logo_url, branding_color, branding_font_color").eq("id", userRow.company_id).single();
    setLogoUrl(company?.logo_url ?? null);
    setBrandingColor(company?.branding_color ?? "#f97316");
    setBrandingFontColor(company?.branding_font_color ?? "#ffffff");
  }

  useEffect(() => { void loadLogo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage(null);

    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (!userRow?.company_id) return;

    const path = `${userRow.company_id}/logo.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
    if (!error) {
      const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      setPendingPath(path);
      setMessage("Logo uploaded. Click Save Logo to apply it.");
    } else {
      setMessage("Logo upload failed. Please try again.");
    }
    setUploading(false);
  }

  async function saveLogo() {
    if (!pendingPath) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (userRow?.company_id) {
      const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(pendingPath);
      const { error } = await supabase.from("companies").update({ logo_url: pub.publicUrl }).eq("id", userRow.company_id);
      setMessage(error ? "Could not save logo." : "Logo saved.");
      if (!error) setPendingPath(null);
    }
    setSaving(false);
  }

  async function saveColors() {
    const normalizedBackground = brandingColor.trim().toLowerCase();
    const normalizedFont = brandingFontColor.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(normalizedBackground) || !/^#[0-9a-f]{6}$/.test(normalizedFont)) {
      setMessage("Enter valid six-digit hex colors, for example #f97316 and #ffffff.");
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data: userRow } = await supabase.from("users").select("company_id").eq("id", auth.user?.id).single();
    if (userRow?.company_id) {
      const { error } = await supabase.from("companies").update({ branding_color: normalizedBackground, branding_font_color: normalizedFont }).eq("id", userRow.company_id);
      setMessage(error ? "Could not save branding colors." : "Branding colors saved.");
      if (!error) {
        setBrandingColor(normalizedBackground);
        setBrandingFontColor(normalizedFont);
      }
    }
    setSaving(false);
  }

  return (
    <div className="max-w-lg">
      <BackButton href="/admin/employees" label="Back to Employees" />
      <h1 className="text-2xl font-bold text-ink-900">Branding</h1>
      <p className="mt-1 text-sm text-ink-500">
        Set the logo and accent color used on company-branded documents and employee ID cards.
      </p>
      <div className="card mt-6">
        {logoUrl && <img src={logoUrl} alt="Company logo" className="mb-4 h-16" />}
        <label className="btn-secondary inline-flex cursor-pointer">
          <Upload size={16} className="mr-2" /> {uploading ? "Uploading…" : "Upload Logo"}
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </label>
        {pendingPath && <button type="button" onClick={saveLogo} disabled={saving} className="btn-primary ml-2">{saving ? "Saving…" : "Save Logo"}</button>}
        <div className="mt-6 border-t border-ink-100 pt-6">
          <label className="label" htmlFor="branding-color">Branding color</label>
          <div className="flex items-center gap-3">
            <input id="branding-color" type="color" value={brandingColor} onChange={(event) => setBrandingColor(event.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
            <input aria-label="Branding background color hex value" className="input max-w-40 font-mono uppercase" value={brandingColor} onChange={(event) => setBrandingColor(event.target.value)} placeholder="#F97316" maxLength={7} />
            <span className="text-sm text-ink-500">Background</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input id="branding-font-color" type="color" value={brandingFontColor} onChange={(event) => setBrandingFontColor(event.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
            <input aria-label="Branding font color hex value" className="input max-w-40 font-mono uppercase" value={brandingFontColor} onChange={(event) => setBrandingFontColor(event.target.value)} placeholder="#FFFFFF" maxLength={7} />
            <span className="text-sm text-ink-500">Font</span>
          </div>
          <div className="mt-3">
            <button type="button" onClick={saveColors} disabled={saving} className="btn-secondary">{saving ? "Saving…" : "Save Colors"}</button>
          </div>
          <p className="mt-2 text-xs text-ink-500">Background defaults to Bizzio orange (#F97316); font defaults to white (#FFFFFF).</p>
        </div>
        {message && <p className="mt-3 text-sm text-ink-600">{message}</p>}
      </div>
    </div>
  );
}
