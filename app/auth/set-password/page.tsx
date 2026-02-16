"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const run = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setError("Your invite session is missing or expired. Please request a new invite.");
        setReady(true);
        return;
      }
      setReady(true);
    };
    run();
  }, [supabase]);

  async function handleSubmit(formData: FormData) {
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
      router.replace("/dashboard");
    });
  }

  if (!ready) {
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
          <CardTitle>Set your password</CardTitle>
          <CardDescription>Finish activating your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
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
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                name="confirm"
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
            <div className="space-y-2">
              <Button type="submit" className="w-full min-h-[44px]" disabled={isPending || !!error}>
                {isPending ? "Saving..." : "Set Password"}
              </Button>
              {!!error && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full min-h-[44px]"
                  onClick={() => router.replace("/login")}
                >
                  Go to Login
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
