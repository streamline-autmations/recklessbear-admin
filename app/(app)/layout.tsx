"use server";

import AppShell from "@/components/app-shell";
import { getViewer } from "@/lib/viewer";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userName, userRole } = await getViewer();

  return (
    <AppShell userName={userName} userRole={userRole}>
      {children}
    </AppShell>
  );
}
