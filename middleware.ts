import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "middleware.ts:4",
      message: "incoming request",
      data: { path: request.nextUrl.pathname },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "hyp-01",
      hypothesisId: "B",
    }),
  }).catch(() => {});
  // #endregion agent log

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
  
  // #region agent log
  console.log("[MIDDLEWARE] Processing request", { pathname, timestamp: Date.now() });
  fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "middleware.ts:56",
      message: "Processing request in middleware",
      data: { pathname },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "users-debug-01",
      hypothesisId: "B",
    }),
  }).catch(() => {});
  // #endregion agent log
  
  const isRoot = pathname === "/";
  const isLoginPage = pathname === "/login";
  // Route group (app) doesn't appear in URL, so check actual routes
  const isProtectedRoute = pathname.startsWith("/dashboard") || 
                           pathname.startsWith("/leads") ||
                           pathname.startsWith("/users") ||
                           pathname.startsWith("/settings");
  
  // #region agent log
  if (pathname.startsWith("/users")) {
    console.log("[MIDDLEWARE] /users route detected", { isProtectedRoute, hasUser: !!user, timestamp: Date.now() });
    fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "middleware.ts:63",
        message: "/users route detected in middleware",
        data: { isProtectedRoute, hasUser: !!user },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "users-debug-01",
        hypothesisId: "B",
      }),
    }).catch(() => {});
  }
  // #endregion agent log

  // Handle root route: redirect to /dashboard if logged in, else /login
  if (isRoot) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "middleware.ts:59",
        message: "root route redirect",
        data: { hasUser: !!user },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "hyp-02",
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion agent log
    return NextResponse.redirect(new URL(user ? "/dashboard" : "/login", request.url));
  }

  // If logged in and visiting /login, redirect to dashboard
  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // If not logged in and trying to access protected route, redirect to login
  if (!user && isProtectedRoute) {
    // #region agent log
    console.log("[MIDDLEWARE] Redirecting unauthenticated user", { pathname, timestamp: Date.now() });
    fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "middleware.ts:91",
        message: "Redirecting unauthenticated user to login",
        data: { pathname },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "users-debug-01",
        hypothesisId: "B",
      }),
    }).catch(() => {});
    // #endregion agent log
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // #region agent log
  if (pathname.startsWith("/users")) {
    console.log("[MIDDLEWARE] /users route allowed through", { hasUser: !!user, timestamp: Date.now() });
    fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "middleware.ts:107",
        message: "/users route allowed through middleware",
        data: { hasUser: !!user },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "users-debug-01",
        hypothesisId: "B",
      }),
    }).catch(() => {});
  }
  // #endregion agent log

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
