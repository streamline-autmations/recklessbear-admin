"use client";

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
  return (
    <div className="space-y-4">
      <div className="sm:hidden text-xs text-muted-foreground">Swipe left/right to see more</div>
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
              {initialUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No users yet.
                  </TableCell>
                </TableRow>
              ) : (
                initialUsers.map((user) => (
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
