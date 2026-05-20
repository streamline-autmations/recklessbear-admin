"use server";

import AppShell from "@/components/app-shell";
import { getViewer } from "@/lib/viewer";

// Cache user session for 60 seconds to reduce redundant auth checks
// This helps when navigating between pages in the same session
let cachedUser: { userId: string; name: string; role: string } | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60 * 1000; // 60 seconds

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if we have a valid cached viewer
  const now = Date.now();
  let userName: string;
  let userRole: string;

  if (cachedUser && now - cacheTimestamp < CACHE_DURATION) {
    userName = cachedUser.name;
    userRole = cachedUser.role;
  } else {
    // Fetch fresh viewer data
    const viewer = await getViewer();
    userName = viewer.name;
    userRole = viewer.role;

    // Cache the result
    cachedUser = {
      userId: viewer.userId,
      name: userName,
      role: userRole
    };
    cacheTimestamp = now;
  }

  return (
    <AppShell userName={userName} userRole={userRole}>
      {children}
    </AppShell>
  );
}
