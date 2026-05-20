import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight middleware: uses cookie-based session check for routing
 * decisions only. Real authorization is enforced by RLS + server components
 * calling supabase.auth.getUser(). Avoiding the network round-trip to
 * Supabase Auth on every navigation is a significant perf win.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Cookie-only session check — no network round-trip to Supabase Auth
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const hasSession = !!session;

  const pathname = request.nextUrl.pathname;
  const isRoot = pathname === "/";
  const isLoginPage = pathname === "/login";
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/leads") ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/stock") ||
    pathname.startsWith("/inbox") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/settings");

  if (isRoot) {
    return NextResponse.redirect(new URL(hasSession ? "/leads" : "/login", request.url));
  }

  if (hasSession && isLoginPage) {
    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "set-password") {
      return response;
    }
    return NextResponse.redirect(new URL("/leads", request.url));
  }

  if (!hasSession && isProtectedRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/leads/:path*",
    "/jobs/:path*",
    "/stock/:path*",
    "/inbox/:path*",
    "/analytics/:path*",
    "/users/:path*",
    "/settings/:path*",
  ],
};
