"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductionPipelineData } from "../actions";

interface ProductionPipelineProps {
  data: ProductionPipelineData[];
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function ProductionPipeline({ data }: ProductionPipelineProps) {
  const sortedData = [...data].sort((a, b) => b.currentCount - a.currentCount);
  const maxCount = Math.max(...data.map((d) => d.currentCount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Pipeline</CardTitle>
        <CardDescription>Active jobs by stage, with time-in-stage guardrails</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedData.map((item) => {
          const percentage = Math.round((item.currentCount / maxCount) * 100);
          
          return (
            <div key={item.stage} className="space-y-1">
              <div className="flex justify-between text-sm font-medium">
                <span className="truncate pr-4">{item.stage}</span>
                <span className="text-muted-foreground">{item.currentCount}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Still in stage: {item.stillInStageCount}</span>
                <span>Avg: {formatDuration(item.avgSecondsCompletedTransitions)}</span>
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
