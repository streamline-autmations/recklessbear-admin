import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lead Detail</h1>
        <p className="text-muted-foreground">
          View and manage lead information.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lead #{id}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Lead ID</p>
            <p className="text-sm text-muted-foreground">{id}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Status</p>
            <p className="text-sm text-muted-foreground">Placeholder</p>
          </div>
          <div>
            <p className="text-sm font-medium">Assigned To</p>
            <p className="text-sm text-muted-foreground">Placeholder</p>
          </div>
          <div className="pt-4">
            <p className="text-sm text-muted-foreground">
              Lead detail view with status changes, assignment, and notes will be implemented here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
