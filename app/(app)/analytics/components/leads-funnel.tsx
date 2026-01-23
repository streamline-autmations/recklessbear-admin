"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FunnelData } from "../actions";

interface LeadsFunnelProps {
  data: FunnelData[];
}

const FUNNEL_ORDER = ["New", "Contacted", "Quote Sent", "Quote Approved", "In Production", "Completed", "Lost"];

export function LeadsFunnel({ data }: LeadsFunnelProps) {
  // Sort data based on FUNNEL_ORDER
  const sortedData = [...data].sort((a, b) => {
    const indexA = FUNNEL_ORDER.indexOf(a.status);
    const indexB = FUNNEL_ORDER.indexOf(b.status);
    
    // If both are in the list, sort by index
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    
    // If one is not in the list, put it at the end
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    
    return 0;
  });

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Funnel</CardTitle>
        <CardDescription>Lead distribution by status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedData.map((item) => {
          const percentage = Math.round((item.count / maxCount) * 100);
          const isSuccess = ["Quote Approved", "In Production", "Completed"].includes(item.status);
          const isLost = item.status === "Lost";
          
          let barColor = "bg-primary/20"; // Default
          let barFill = "bg-primary";
          
          if (isSuccess) {
            barColor = "bg-green-100 dark:bg-green-900/30";
            barFill = "bg-green-600";
          } else if (isLost) {
            barColor = "bg-gray-100 dark:bg-gray-800";
            barFill = "bg-gray-500";
          }

          return (
            <div key={item.status} className="space-y-1">
              <div className="flex justify-between text-sm font-medium">
                <span>{item.status}</span>
                <span className="text-muted-foreground">{item.count}</span>
              </div>
              <div className={`h-3 w-full rounded-full overflow-hidden ${barColor}`}>
                <div
                  className={`h-full rounded-full ${barFill} transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
        
        {data.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
