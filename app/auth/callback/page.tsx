"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function readHashParams() {
  const raw = typeof window !== "undefined" ? window.location.hash : "";
  const hash = raw.startsWith("#") ? raw.slice(1) : raw;
  return new URLSearchParams(hash);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const params = readHashParams();

      const errorDescription =
        params.get("error_description") || params.get("error") || params.get("message");
      if (errorDescription) {
        setError(decodeURIComponent(errorDescription));
        return;
      }

      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const type = params.get("type");

      if (!access_token || !refresh_token) {
        setError("Invite link is missing session tokens.");
        return;
      }

      const { error: setSessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (setSessionError) {
        setError(setSessionError.message);
        return;
      }

      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

      router.replace(type === "invite" ? "/auth/set-password" : "/dashboard");
    };

    run();
  }, [router, supabase]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-xl rounded-lg border bg-card p-6 text-card-foreground">
          <div className="text-lg font-semibold">Invite sign-in failed</div>
          <div className="mt-2 text-sm text-muted-foreground">{error}</div>
          <button
            type="button"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            onClick={() => router.replace("/login")}
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-lg border bg-card p-6 text-card-foreground">
        <div className="text-lg font-semibold">Signing you in…</div>
        <div className="mt-2 text-sm text-muted-foreground">Please wait.</div>
      </div>
    </div>
  );
}

