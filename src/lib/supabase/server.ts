import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side Supabase client for use in Server Components / Route Handlers. */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component with no request context — safe to ignore,
            // middleware.ts is what actually refreshes the session cookie.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // see note above
          }
        }
      }
    }
  );
}

/**
 * Admin client using the Service Role key — bypasses RLS entirely.
 * ONLY use this in trusted server-side code (invite creation, approval flow,
 * health checks, seed scripts). Never import this into client components.
 */
export function createAdminClient() {
  const { createClient: createRawClient } = require("@supabase/supabase-js");
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
