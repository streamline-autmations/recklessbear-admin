import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
          cookiesToSet.forEach(({ name, value, options }) =>
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isRoot = pathname === "/";
  const isLoginPage = pathname === "/login";
  // Route group (app) doesn't appear in URL, so check actual routes
  const isProtectedRoute = pathname.startsWith("/dashboard") || 
                           pathname.startsWith("/leads") ||
                           pathname.startsWith("/users") ||
                           pathname.startsWith("/settings");

  // Handle root route: redirect to /dashboard if logged in, else /login
  if (isRoot) {
    return NextResponse.redirect(new URL(user ? "/dashboard" : "/login", request.url));
  }

  // If logged in and visiting /login, redirect to dashboard
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // If not logged in and trying to access protected route, redirect to login
  if (!user && isProtectedRoute) {
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
