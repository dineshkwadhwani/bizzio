"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "employee-documents";
const PUBLIC_PATH = `/storage/v1/object/public/${BUCKET}/`;

function storagePath(fileUrl: string) {
  if (!fileUrl.startsWith("http")) return fileUrl;

  try {
    const pathname = new URL(fileUrl).pathname;
    const markerIndex = pathname.indexOf(PUBLIC_PATH);
    return markerIndex === -1 ? fileUrl : decodeURIComponent(pathname.slice(markerIndex + PUBLIC_PATH.length));
  } catch {
    return fileUrl;
  }
}

export function EmployeeDocumentLink({ fileUrl }: { fileUrl: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const path = storagePath(fileUrl);

    createClient()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error: signedUrlError }) => {
        if (!active) return;
        if (signedUrlError || !data?.signedUrl) setError(true);
        else setUrl(data.signedUrl);
      });

    return () => {
      active = false;
    };
  }, [fileUrl]);

  if (error) return <span className="text-xs text-red-600">Unavailable</span>;
  if (!url) return <span className="text-xs text-ink-400">Preparing…</span>;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
      View
    </a>
  );
}
