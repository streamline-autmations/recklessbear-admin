import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-40" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Kanban Board Layout */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto">
            {/* Quote Approved Column */}
            <div className="space-y-3 min-w-[280px]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full bg-yellow-500" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-6 rounded-full bg-muted" />
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border bg-card space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>

            {/* In Production Column */}
            <div className="space-y-3 min-w-[280px]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full bg-blue-500" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-6 rounded-full bg-muted" />
              </div>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border bg-card space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>

            {/* Ready to Deliver Column */}
            <div className="space-y-3 min-w-[280px]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full bg-green-500" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-6 rounded-full bg-muted" />
              </div>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border bg-card space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>

            {/* Completed Column */}
            <div className="space-y-3 min-w-[280px]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full bg-gray-500" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-6 rounded-full bg-muted" />
              </div>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="p-3 rounded-lg border bg-card space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}