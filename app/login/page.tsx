"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteReady, setInviteReady] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.location.hash : "";
    if (!raw) return;
    const hash = raw.startsWith("#") ? raw.slice(1) : raw;
    const params = new URLSearchParams(hash);
    const errorDescription =
      params.get("error_description") || params.get("error") || params.get("message");
    if (errorDescription) {
      setError(errorDescription);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      return;
    }
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;
    window.location.replace(`/auth/callback${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = new URLSearchParams(window.location.search);
    const mode = search.get("mode");
    const isInvite = mode === "set-password";
    setInviteMode(isInvite);
    if (!isInvite) return;

    const run = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setError("Your invite session is missing or expired. Please request a new invite link.");
        setInviteReady(true);
        return;
      }
      setInviteReady(true);
    };
    run();
  }, [supabase]);

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await loginAction(formData);
      if (result && "error" in result) {
        setError(result.error);
      }
    });
  }

  async function handleInvitePasswordSubmit(formData: FormData) {
    setError(null);
    const password = String(formData.get("password") || "");
    const confirm = String(formData.get("confirm") || "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      window.location.assign("/leads");
    });
  }

  if (inviteMode && !inviteReady) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground">
          <div className="text-lg font-semibold">Preparing your account…</div>
          <div className="mt-2 text-sm text-muted-foreground">Please wait.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{inviteMode ? "Create Password" : "Login"}</CardTitle>
          <CardDescription>
            {inviteMode ? "Finish setting up your account." : "Sign in to RecklessBear Admin"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inviteMode ? (
            <form action={handleInvitePasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  disabled={isPending || !!error}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  placeholder="••••••••"
                  required
                  disabled={isPending || !!error}
                  className="min-h-[44px]"
                />
              </div>
              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full min-h-[44px]" disabled={isPending}>
                {isPending ? "Saving..." : "Set Password"}
              </Button>
              {error && (
                <Button type="button" variant="secondary" className="w-full min-h-[44px]" onClick={() => window.location.assign("/login")}>
                  Go to Login
                </Button>
              )}
            </form>
          ) : (
            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  disabled={isPending}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  disabled={isPending}
                  className="min-h-[44px]"
                />
              </div>
              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full min-h-[44px]" disabled={isPending}>
                {isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
