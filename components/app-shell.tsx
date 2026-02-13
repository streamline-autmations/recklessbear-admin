"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
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
import { LayoutDashboard, Users as UsersIcon, Settings, Menu, ShieldCheck, MessageSquare, BarChart3, Briefcase, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "next-themes";
import { OnboardingTour } from "@/components/onboarding-tour";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Leads", href: "/leads", icon: UsersIcon },
  { name: "Jobs", href: "/jobs", icon: Briefcase },
  { name: "Stock", href: "/stock", icon: Package },
  { name: "RecklessBear WhatsApp", href: "/inbox", icon: MessageSquare },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const themeForRender = mounted ? resolvedTheme : "light";
  const isLight = themeForRender === "light";
  const isDesktopCollapsed = isSidebarCollapsed;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("rb-admin.sidebarCollapsed");
      if (stored === "1") setIsSidebarCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  function toggleSidebar() {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("rb-admin.sidebarCollapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const logos = useMemo(() => {
    const isDark = themeForRender !== "light";
    return {
      icon: isDark
        ? "https://res.cloudinary.com/dzhwylkfr/image/upload/v1769410062/RB_LOGO_NEW_btabo8.png"
        : "https://res.cloudinary.com/dzhwylkfr/image/upload/v1769410062/Logo-Black_tl2hbv.png",
      word: isDark
        ? "https://res.cloudinary.com/dzhwylkfr/image/upload/v1769410712/rb_text_dltvkg.png"
        : "https://res.cloudinary.com/dzhwylkfr/image/upload/v1769410543/Word-Logo-Black_oh6by7.png",
    };
  }, [themeForRender]);

  // Get page title from current route
  const getPageTitle = () => {
    const activeNav = navigation.find(
      (item) => pathname === item.href || pathname?.startsWith(`${item.href}/`)
    );
    
    if (pathname?.startsWith("/leads/")) {
      return "Lead Details";
    }
    
    return activeNav?.name || "Dashboard";
  };

  const renderNav = (mobile?: boolean) => {
    const isCeoOrAdmin = userRole === "ceo" || userRole === "admin";
    const visibleNav = navigation.filter((item) => {
      if (item.href === "/users" || item.href === "/settings" || item.href === "/analytics") {
        return isCeoOrAdmin;
      }
      return true;
    });

    const collapsed = !mobile && isDesktopCollapsed;

    return (
      <nav id={!mobile ? "rb-sidebar-nav" : undefined} className={`flex ${mobile ? "flex-col" : "flex-col gap-3"}`}>
        {visibleNav.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => {
                if (mobile) setIsSheetOpen(false);
              }}
              data-tour={
                item.href === "/leads"
                  ? "sidebar-leads"
                  : item.href === "/jobs"
                    ? "sidebar-jobs"
                    : undefined
              }
              title={collapsed ? item.name : undefined}
              aria-label={collapsed ? item.name : undefined}
              aria-current={isActive ? "page" : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))] before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-primary"
                  : "text-muted-foreground hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-foreground))]"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--sidebar))] ${
                collapsed ? "justify-center px-2" : ""
              }`}
            >
              <item.icon
                className={`h-4 w-4 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-[hsl(var(--sidebar-foreground))]"
                }`}
              />
              {!collapsed && item.name}
            </Link>
          );
        })}
      </nav>
    );
  };

  return (
    <div className="min-h-screen text-foreground flex">
      <OnboardingTour />
      <aside
        className={`hidden md:flex border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] p-4 flex-shrink-0 transition-[width] duration-200 ${
          isDesktopCollapsed ? "w-[92px] p-3" : "w-64 p-4"
        }`}
      >
        <div className="w-full">
          {isDesktopCollapsed ? (
            <div className="mb-4 flex flex-col items-center gap-2 rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))] px-2 py-3">
              <Image src={logos.icon} alt="RecklessBear" width={32} height={32} className="h-8 w-8" />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-[hsl(var(--sidebar-foreground))]"
                aria-label="Expand sidebar"
                aria-expanded={false}
                aria-controls="rb-sidebar-nav"
                title="Expand"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-accent))] px-3 py-3">
              <div className="flex items-center gap-3">
                <Image src={logos.icon} alt="RecklessBear" width={32} height={32} className="h-8 w-8" />
                <Image
                  src={logos.word}
                  alt="RecklessBear Admin"
                  width={isLight ? 132 : 150}
                  height={isLight ? 20 : 24}
                  className={isLight ? "h-5 w-[132px] object-contain" : "h-6 w-[150px] object-contain"}
                  priority
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-[hsl(var(--sidebar-foreground))]"
                aria-label="Collapse sidebar"
                aria-expanded
                aria-controls="rb-sidebar-nav"
                title="Collapse"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Separator className="mb-4 bg-[hsl(var(--sidebar-border))]" />
          {renderNav()}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between border-b border-border bg-background/70 backdrop-blur px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden min-h-[44px] min-w-[44px]">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent className="w-72 p-4 bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]" side="left">
                <SheetHeader>
                  <SheetTitle className="text-[hsl(var(--sidebar-foreground))]">
                    <div className="flex items-center gap-3">
                      <Image src={logos.icon} alt="RecklessBear" width={32} height={32} className="h-8 w-8" />
                      <Image
                        src={logos.word}
                        alt="RecklessBear Admin"
                        width={isLight ? 132 : 150}
                        height={isLight ? 20 : 24}
                        className={isLight ? "h-5 w-[132px] object-contain" : "h-6 w-[150px] object-contain"}
                        priority
                      />
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <Separator className="my-3 bg-[hsl(var(--sidebar-border))]" />
                {renderNav(true)}
              </SheetContent>
            </Sheet>
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/40">
              <Image src={logos.icon} alt="RecklessBear" width={20} height={20} className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground">RecklessBear Admin</p>
              <p className="text-lg md:text-xl font-semibold text-foreground">{getPageTitle()}</p>
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

        <main className="p-4 md:p-6 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
