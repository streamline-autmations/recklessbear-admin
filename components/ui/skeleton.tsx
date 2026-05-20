"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  style?: { [key: string]: string | number };
}

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      style={style}
    />
  );
}