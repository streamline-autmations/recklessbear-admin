"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createUserAction } from "../actions";

export function CreateUserForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setInviteLink(null);
    startTransition(async () => {
      const result = await createUserAction(formData);
      if (result && "error" in result) {
        setError(result.error);
        toast.error(result.error);
      } else {
        const link =
          result && typeof result === "object" && "inviteLink" in result
            ? (result as { inviteLink?: string }).inviteLink
            : undefined;
        if (link) {
          setInviteLink(link);
          toast.success("User created. Invite email failed — copy the link below.");
          return;
        }
        toast.success("User created successfully");
        router.push("/users");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New User</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              name="fullName"
              required
              placeholder="John Doe"
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+1234567890"
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select name="role" required>
              <SelectTrigger id="role" className="min-h-[44px]">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rep">Rep</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="ceo">CEO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {inviteLink && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">Invite link</div>
              <div className="text-xs text-muted-foreground">Copy and send this link to the user to set their password.</div>
              <div className="flex gap-2">
                <Input value={inviteLink} readOnly className="min-h-[44px]" />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteLink);
                      toast.success("Invite link copied");
                    } catch {
                      toast.error("Could not copy link");
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isPending}
              className="min-h-[44px]"
            >
              {isPending ? "Creating..." : "Create User"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/users")}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
