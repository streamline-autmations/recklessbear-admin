import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground">
          Manage and track your leads.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Leads List</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Leads list will be displayed here. This will include filters, search, and a responsive table.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
