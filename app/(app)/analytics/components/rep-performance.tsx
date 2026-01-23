"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RepPerformanceData } from "../actions";

interface RepPerformanceProps {
  data: RepPerformanceData[];
}

export function RepPerformance({ data }: RepPerformanceProps) {
  // Sort by Quote Approved count desc
  const sortedData = [...data].sort((a, b) => b.quoteApproved - a.quoteApproved);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rep Performance</CardTitle>
        <CardDescription>Metrics by assigned representative</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep Name</TableHead>
                <TableHead className="text-right">Total Assigned</TableHead>
                <TableHead className="text-right">Contacted</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((rep) => {
                const conversionRate = rep.totalLeads > 0 
                  ? Math.round((rep.quoteApproved / rep.totalLeads) * 100) 
                  : 0;

                return (
                  <TableRow key={rep.repId || "unassigned"}>
                    <TableCell className="font-medium">{rep.repName}</TableCell>
                    <TableCell className="text-right">{rep.totalLeads}</TableCell>
                    <TableCell className="text-right">{rep.contacted}</TableCell>
                    <TableCell className="text-right text-primary font-bold">{rep.quoteApproved}</TableCell>
                    <TableCell className="text-right">{conversionRate}%</TableCell>
                  </TableRow>
                );
              })}
              
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    No performance data found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
