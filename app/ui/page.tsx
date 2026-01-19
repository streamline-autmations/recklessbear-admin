"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge, { LeadStatus } from "@/components/status-badge";

const statuses: LeadStatus[] = [
  "new",
  "assigned",
  "contacted",
  "quote_sent",
  "quote_approved",
  "in_production",
  "completed",
  "lost",
];

export default function KitchenSinkPage() {
  return (
    <div className="min-h-screen bg-background py-8">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Badges + Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <StatusBadge status={status} key={status} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-border px-3 py-[2px] text-xs font-semibold uppercase tracking-[0.2em] bg-muted">
                Primary
              </span>
              <span className="rounded-full border border-border px-3 py-[2px] text-xs font-semibold uppercase tracking-[0.2em] bg-green-50 text-green-900">
                Success
              </span>
              <span className="rounded-full border border-border px-3 py-[2px] text-xs font-semibold uppercase tracking-[0.2em] bg-amber-50 text-amber-900">
                Warning
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Forms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input placeholder="Enter full name" />
              </div>
              <div>
                <Label>Email</Label>
                <Input placeholder="name@example.com" />
              </div>
            </div>
            <div>
              <Label>Lead Type</Label>
              <Select>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="quote_request">Quote Request</SelectItem>
                  <SelectItem value="booking_request">Booking Request</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea placeholder="Add internal notes..." />
              <p className="text-xs text-muted-foreground">Example helper text</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Table Example</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-background uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Lead ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {["new", "quote_approved", "lost"].map((status) => (
                    <tr key={status} className="border-t border-border hover:bg-card">
                      <td className="px-4 py-3">RB-000{status.length}</td>
                      <td className="px-4 py-3">Lead {status}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status as LeadStatus} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">Rep Team</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dialog / Toast Previews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-sm font-semibold text-foreground">Dialog Preview</p>
              <p className="text-muted-foreground">
                Confirm deletion (modal would overlay this area). Buttons could hook into server actions.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-sm font-medium text-foreground">Toast preview:</p>
              <p className="text-sm text-muted-foreground">
                Lead saved successfully. (Toast would slide in from bottom right.)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
