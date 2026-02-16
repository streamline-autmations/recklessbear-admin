"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UsersTableEdit } from "./users-table-edit";

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

interface UsersTableClientProps {
  initialUsers: Profile[];
  currentUserRole: string | null;
}

export function UsersTableClient({ initialUsers, currentUserRole }: UsersTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return initialUsers;
    const query = searchQuery.toLowerCase();
    return initialUsers.filter((user) => {
      const name = user.full_name?.toLowerCase() || "";
      const email = user.email?.toLowerCase() || "";
      return name.includes(query) || email.includes(query);
    });
  }, [initialUsers, searchQuery]);

  return (
    <div className="space-y-4">
      <Input
        type="search"
        placeholder="Search by name or email..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="min-h-[44px]"
      />
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <div className="inline-block min-w-full align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No users found." : "No users yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <UsersTableEdit key={user.user_id} user={user} canDelete={currentUserRole === "ceo"} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
