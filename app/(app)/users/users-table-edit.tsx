"use client";

import { useState, useTransition } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteUserAction, updateUserAction } from "./actions";

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

interface UsersTableEditProps {
  user: Profile;
  canDelete?: boolean;
}

export function UsersTableEdit({ user: initialUser, canDelete = false }: UsersTableEditProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(initialUser.full_name || "");
  const [phone, setPhone] = useState(initialUser.phone || "");
  const [role, setRole] = useState(initialUser.role);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    const formData = new FormData();
    formData.set("userId", initialUser.user_id);
    formData.set("fullName", fullName);
    formData.set("phone", phone);
    formData.set("role", role);

    startTransition(async () => {
      const result = await updateUserAction(formData);
      if (result && "error" in result) {
        setError(result.error);
        toast.error(result.error);
      } else {
        setIsEditing(false);
        toast.success("User updated successfully");
        router.refresh();
      }
    });
  }

  function handleCancel() {
    setFullName(initialUser.full_name || "");
    setPhone(initialUser.phone || "");
    setRole(initialUser.role);
    setError(null);
    setIsEditing(false);
  }

  function handleDelete() {
    const label = initialUser.email || initialUser.full_name || "this user";
    const confirmed = window.confirm(`Delete ${label}? This cannot be undone.`);
    if (!confirmed) return;

    setError(null);
    const formData = new FormData();
    formData.set("userId", initialUser.user_id);

    startTransition(async () => {
      const result = await deleteUserAction(formData);
      if (result && "error" in result) {
        setError(result.error);
        toast.error(result.error);
      } else {
        toast.success("User deleted successfully");
        router.refresh();
      }
    });
  }

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className="min-h-[44px]"
          />
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          <span className="text-muted-foreground">{initialUser.email || "—"}</span>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="min-h-[44px]"
          />
        </TableCell>
        <TableCell>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ceo">CEO</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="rep">Rep</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{initialUser.full_name || "—"}</TableCell>
      <TableCell className="hidden sm:table-cell">{initialUser.email || "—"}</TableCell>
      <TableCell className="hidden md:table-cell">{initialUser.phone || "—"}</TableCell>
      <TableCell>
        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium uppercase">
          {initialUser.role}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            disabled={isPending}
            className="min-h-[44px]"
          >
            Edit
          </Button>
          {canDelete ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isPending}
              className="min-h-[44px]"
            >
              Delete
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
