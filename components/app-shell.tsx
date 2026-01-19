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
import { LayoutDashboard, Users as UsersIcon, Settings, Menu, ShieldCheck } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";

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

  const renderNav = (mobile?: boolean) => {
    const isCeoOrAdmin = userRole === "ceo" || userRole === "admin";
    const visibleNav = navigation.filter((item) => {
      if (item.href === "/users" || item.href === "/settings") {
        return isCeoOrAdmin;
      }
      return true;
    });

    return (
      <nav className={`flex ${mobile ? "flex-col" : "flex-col gap-3"}`}>
        {visibleNav.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => {
                if (mobile) setIsSheetOpen(false);
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-border hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="hidden md:flex w-64 border-r border-border bg-card p-4 flex-shrink-0">
        <div className="w-full">
          <div className="mb-4 text-lg font-semibold text-foreground">
            RecklessBear
          </div>
          <Separator className="mb-4" />
          {renderNav()}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden min-h-[44px] min-w-[44px]">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
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
            <div>
              <p className="text-sm text-muted-foreground">RecklessBear Admin</p>
              <p className="text-xl font-semibold text-foreground">Light CRM</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2 px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
                  {userName.charAt(0)}
                </div>
                <span className="text-sm font-medium">{userName}</span>
              </Button>
            </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="end">
                  <DropdownMenuItem className="text-foreground">
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

        <main className="bg-background p-4 md:p-6 flex-1 overflow-auto">
          <div className="w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
