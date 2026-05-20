import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <TabsList className="w-auto">
              <TabsTrigger value="inventory" disabled>
                <Skeleton className="h-4 w-16" />
              </TabsTrigger>
              <TabsTrigger value="orders" disabled>
                <Skeleton className="h-4 w-12" />
              </TabsTrigger>
              <TabsTrigger value="movements" disabled>
                <Skeleton className="h-4 w-20" />
              </TabsTrigger>
              <TabsTrigger value="bom" disabled>
                <Skeleton className="h-4 w-20" />
              </TabsTrigger>
            </TabsList>
            <Skeleton className="h-10 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Table Header */}
          <div className="grid grid-cols-6 gap-4 pb-4 border-b">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
          
          {/* Table Rows */}
          <div className="divide-y">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="grid grid-cols-6 items-center gap-4 py-4">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-16 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}