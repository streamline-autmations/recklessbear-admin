"use client";

import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onMenuClick}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="text-lg font-semibold">RecklessBear Admin</h1>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-sm text-muted-foreground">User</span>
      </div>
    </header>
  );
}
