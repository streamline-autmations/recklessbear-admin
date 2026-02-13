"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductionPipelineData } from "../actions";

interface ProductionPipelineProps {
  data: ProductionPipelineData[];
}

export function ProductionPipeline({ data }: ProductionPipelineProps) {
  // Sort by count desc
  const sortedData = [...data].sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Pipeline</CardTitle>
        <CardDescription>Active jobs by production stage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedData.map((item) => {
          const percentage = Math.round((item.count / maxCount) * 100);
          
          return (
            <div key={item.stage} className="space-y-1">
              <div className="flex justify-between text-sm font-medium">
                <span className="truncate pr-4">{item.stage}</span>
                <span className="text-muted-foreground">{item.count}</span>
              </div>
              <div className="h-3 w-full rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}

        {data.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No active jobs in production
          </div>
        )}
      </CardContent>
    </Card>
  );
}
