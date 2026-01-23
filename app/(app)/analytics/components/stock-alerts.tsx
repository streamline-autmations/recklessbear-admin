"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StockAlertData } from "../actions";
import { AlertTriangle } from "lucide-react";

interface StockAlertsProps {
  data: StockAlertData[];
}

export function StockAlerts({ data }: StockAlertsProps) {
  return (
    <Card className="border-red-200 dark:border-red-900/50 bg-red-50/10 dark:bg-red-900/10">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <CardTitle>Stock Alerts</CardTitle>
        </div>
        <CardDescription>Items below minimum level</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((item) => (
            <div key={item.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0 border-red-100 dark:border-red-900/30">
              <div>
                <p className="font-medium text-sm">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.supplier || "No supplier"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-red-600">
                  {item.qty_on_hand} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                </p>
                <p className="text-xs text-muted-foreground">Min: {item.minimum_level}</p>
              </div>
            </div>
          ))}

          {data.length === 0 && (
            <div className="text-center py-4 text-muted-foreground text-sm">
              All stock levels healthy
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
