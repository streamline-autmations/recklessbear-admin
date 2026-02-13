"use client";

import { Button } from "@/components/ui/button";

export function PrintReportClient() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      Download PDF
    </Button>
  );
}
