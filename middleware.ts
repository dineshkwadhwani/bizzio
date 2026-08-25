import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Public routes that never require auth.
const PUBLIC_PREFIXES = [
  "/", "/pricing", "/about-us", "/contact-us", "/terms", "/privacy",
  "/login", "/forgot-password", "/reset-password", "/register", "/health",
  "/api/health", "/api/webhooks"
];

function isPublic(pathname: string) {
  if (PUBLIC_PREFIXES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some(
    (p) => p !== "/" && (pathname === p || pathname.startsWith(p + "/"))
  );
}

export async function middleware(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return response;

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based section guards (Page-Route-Inventory-v1.md §6)
  const { data: profile } = await supabase
    .from("users")
    .select("role, status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status === "disabled") {
    return NextResponse.redirect(new URL("/login?disabled=1", request.url));
  }

  if (pathname.startsWith("/superadmin") && profile.role !== "superadmin") {
    return NextResponse.redirect(new URL("/app/dashboard", request.url));
  }
  if (
    pathname.startsWith("/admin") &&
    !["company_admin", "superadmin"].includes(profile.role) &&
    // HR-flagged employees are additionally allowed into /admin/*; the page
    // itself re-checks hr_screens for which specific screens they can see.
    profile.role !== "employee"
  ) {
    return NextResponse.redirect(new URL("/app/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
