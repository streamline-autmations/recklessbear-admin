"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, Users as UsersIcon, Settings, List, ShieldCheck } from "lucide-react";
import { signOutAction } from "@/app/login/actions";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/leads", icon: UsersIcon },
  { name: "Users", href: "/users", icon: ShieldCheck },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface AppShellProps {
  children: React.ReactNode;
  userName: string;
  userRole: string;
}

export function AppShell({ children, userName, userRole }: AppShellProps) {
  const pathname = usePathname();
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const renderNav = (mobile?: boolean) => (
    <nav className={`flex ${mobile ? "flex-col" : "flex-col gap-3"}`}>
      {navigation.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-[rgb(var(--primary)/0.1)] text-[rgb(var(--foreground)/1)]"
                : "text-muted-foreground hover:bg-[rgb(var(--border)/1)] hover:text-[rgb(var(--foreground)/1)]"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[rgb(var(--background)/1)] text-[rgb(var(--foreground)/1)]">
      <div className="hidden md:flex">
        <aside className="w-72 border-r border-border bg-[rgb(var(--card)/1)] p-4">
          <div className="mb-6 text-lg font-semibold text-[rgb(var(--foreground)/1)]">
            RecklessBear
          </div>
          <Separator className="mb-4" />
          {renderNav()}
        </aside>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" className="fixed bottom-6 right-6 z-50 md:hidden">
            <List className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-64 p-4" side="left">
          <SheetHeader>
            <SheetTitle>Navigate</SheetTitle>
          </SheetHeader>
          <Separator className="my-2" />
          {renderNav(true)}
        </SheetContent>
      </Sheet>

      <div className="md:ml-72">
        <header className="flex items-center justify-between border-b border-border bg-[rgb(var(--card)/1)] px-4 py-3">
          <div>
            <p className="text-sm text-muted-foreground">RecklessBear Admin</p>
            <p className="text-xl font-semibold text-[rgb(var(--foreground)/1)]">Light CRM</p>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[rgb(var(--foreground)/1)]">
                  {userName.charAt(0)}
                </div>
                <span className="text-sm font-medium">{userName}</span>
              </Button>
            </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end">
                  <DropdownMenuItem className="text-[rgb(var(--foreground)/1)]">
                    Role: {userRole}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <form action={async () => { try { await signOutAction(); } catch { /* redirect throws */ } }}>
                    <DropdownMenuItem asChild>
                      <button type="submit">Sign Out</button>
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="bg-[rgb(var(--background)/1)] p-4 md:p-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
