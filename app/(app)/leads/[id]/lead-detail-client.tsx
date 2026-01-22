"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { addNoteAction, changeStatusAction, assignRepAction, updateDesignNotesAction, autoAssignLeadAction } from "./actions";
import StatusBadge from "@/components/status-badge";
import { TrelloCreateButton } from "./trello-create-button";
import type { Lead } from "@/types/leads";

interface DisplayLead extends Lead {
  id?: string;
  lead_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  organization?: string | null;
  status?: string | null;
  lead_type?: string | null;
  source?: string | null;
  question_data?: Record<string, unknown> | null;
  quote_data?: Record<string, unknown> | null;
  booking_data?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
  submission_date?: string | null;
  assigned_rep_id?: string | null;
  assigned_rep_name?: string | null;
}

interface Note {
  id: string;
  lead_db_id: string;
  author_user_id: string;
  note: string;
  created_at: string;
}

interface Event {
  id: string;
  lead_db_id: string;
  actor_user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

interface Rep {
  id: string;
  name: string | null;
  email?: string | null;
}

interface LeadDetailClientProps {
  leadId: string;
  lead: DisplayLead;
  initialStatus: string;
  notes: Note[];
  events: Event[];
  isCeoOrAdmin: boolean;
  reps: Rep[];
}

export function LeadDetailClient({
  leadId,
  lead,
  initialStatus,
  notes,
  events,
  isCeoOrAdmin,
  reps,
}: LeadDetailClientProps) {
  const router = useRouter();
  const [noteText, setNoteText] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [selectedRepId, setSelectedRepId] = useState<string>(lead.assigned_rep_id || "__unassigned__");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [repError, setRepError] = useState<string | null>(null);
  const [designNotes, setDesignNotes] = useState(lead.design_notes || "");
  const [isNotePending, startNoteTransition] = useTransition();
  const [isStatusPending, startStatusTransition] = useTransition();
  const [isRepPending, startRepTransition] = useTransition();
  const [isDesignNotesPending, startDesignNotesTransition] = useTransition();

  function formatDateSafe(dateString: string | null | undefined): string {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "—";
      return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }


  function formatPayload(payload: Record<string, unknown>): string {
    try {
      const str = JSON.stringify(payload, null, 2);
      return str.length > 200 ? str.substring(0, 200) + "..." : str;
    } catch {
      return String(payload);
    }
  }

  function handleAddNote(formData: FormData) {
    setNoteError(null);
    formData.set("leadId", leadId);
    startNoteTransition(async () => {
      const result = await addNoteAction(formData);
      if (result && "error" in result) {
        setNoteError(result.error);
        toast.error(result.error);
      } else {
        setNoteText("");
        toast.success("Note added successfully");
        router.refresh();
      }
    });
  }

  function handleStatusChange(newStatus: string) {
    setSelectedStatus(newStatus);
    setStatusError(null);
    const formData = new FormData();
    formData.set("leadId", lead.id || leadId);
    formData.set("status", newStatus);
    startStatusTransition(async () => {
      const result = await changeStatusAction(formData);
      if (result && "error" in result) {
        setStatusError(result.error);
        setSelectedStatus(initialStatus);
        toast.error(result.error);
      } else {
        toast.success("Status updated successfully");
        router.refresh();
      }
    });
  }

  function handleAssignRep(newRepId: string) {
    setSelectedRepId(newRepId);
    setRepError(null);
    const formData = new FormData();
    formData.set("leadId", lead.id || leadId);
    // Convert "__unassigned__" back to empty string for server
    formData.set("repId", newRepId === "__unassigned__" ? "" : newRepId);
    startRepTransition(async () => {
      const result = await assignRepAction(formData);
      if (result && "error" in result) {
        setRepError(result.error);
        setSelectedRepId(lead.assigned_rep_id || "__unassigned__");
        toast.error(result.error);
      } else {
        toast.success(newRepId === "__unassigned__" ? "Rep unassigned successfully" : "Rep assigned successfully");
        router.refresh();
      }
    });
  }

  const [isAutoAssignPending, startAutoAssignTransition] = useTransition();

  function handleAutoAssign() {
    startAutoAssignTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", lead.id || leadId);

      const result = await autoAssignLeadAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
      } else if (result && "repId" in result) {
        router.refresh();
        toast.success("Lead auto-assigned successfully");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header Actions: Status and Rep Assignment */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4">
              <div className="space-y-2 flex-1">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={selectedStatus}
                  onValueChange={handleStatusChange}
                  disabled={isStatusPending}
                >
                  <SelectTrigger id="status" className="min-h-[44px] w-full sm:w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New">New</SelectItem>
                    <SelectItem value="Assigned">Assigned</SelectItem>
                    <SelectItem value="Contacted">Contacted</SelectItem>
                    <SelectItem value="Quote Sent">Quote Sent</SelectItem>
                    <SelectItem value="Quote Approved">Quote Approved</SelectItem>
                    <SelectItem value="In Production">In Production</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
                {statusError && (
                  <p className="text-sm text-destructive">{statusError}</p>
                )}
              </div>
              {isCeoOrAdmin && (
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <Label htmlFor="rep">Assigned Rep</Label>
                      <Select
                        value={selectedRepId}
                        onValueChange={handleAssignRep}
                        disabled={isRepPending}
                      >
                        <SelectTrigger id="rep" className="min-h-[44px] w-full sm:w-[200px]">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                            {reps.map((rep) => (
                              <SelectItem key={rep.id} value={rep.id}>
                                {rep.name || rep.email || rep.id}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {!lead.assigned_rep_id && (
                      <div className="flex items-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAutoAssign}
                          disabled={isAutoAssignPending || isRepPending}
                          className="min-h-[44px] whitespace-nowrap"
                        >
                          {isAutoAssignPending ? "Assigning..." : "Auto-Assign"}
                        </Button>
                      </div>
                    )}
                  </div>
                  {repError && (
                    <p className="text-sm text-destructive">{repError}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge
                status={
                  (selectedStatus?.toLowerCase().replace(/\s+/g, "_") || "new") as
                    | "new"
                    | "assigned"
                    | "contacted"
                    | "quote_sent"
                    | "quote_approved"
                    | "in_production"
                    | "completed"
                    | "lost"
                }
              />
              {lead.sales_status && (
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                  Sales: {lead.sales_status}
                </span>
              )}
              {lead.payment_status && (
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                  Payment: {lead.payment_status}
                </span>
              )}
              {lead.production_stage && (
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                  Production: {lead.production_stage}
                </span>
              )}
              {lead.card_created && (
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                  Card Created
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-6">
          <TabsTrigger value="overview" className="min-h-[44px] text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="quote" className="min-h-[44px] text-xs sm:text-sm">Quote</TabsTrigger>
          <TabsTrigger value="booking" className="min-h-[44px] text-xs sm:text-sm">Booking</TabsTrigger>
          <TabsTrigger value="question" className="min-h-[44px] text-xs sm:text-sm">Question</TabsTrigger>
          <TabsTrigger value="timeline" className="min-h-[44px] text-xs sm:text-sm">Timeline</TabsTrigger>
          <TabsTrigger value="notes" className="min-h-[44px] text-xs sm:text-sm">Notes</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Contact Information */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium mb-1">Name</p>
                  <p className="text-sm text-muted-foreground">{lead.customer_name || lead.name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Email</p>
                  <p className="text-sm text-muted-foreground">
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                        {lead.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Phone</p>
                  <p className="text-sm text-muted-foreground">
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                        {lead.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Company/Organization</p>
                  <p className="text-sm text-muted-foreground">{lead.organization || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Date Submitted</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateSafe(lead.submission_date || lead.created_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lead Information */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Lead Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium mb-1">Status</p>
                  <p className="text-sm text-muted-foreground">{lead.status || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Assigned Rep</p>
                  <p className="text-sm text-muted-foreground">{lead.assigned_rep_name || "Unassigned"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Sales Status</p>
                  <p className="text-sm text-muted-foreground">{lead.sales_status || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Payment Status</p>
                  <p className="text-sm text-muted-foreground">{lead.payment_status || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Production Stage</p>
                  <p className="text-sm text-muted-foreground">{lead.production_stage || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateSafe(lead.submission_date || lead.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Last Modified</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateSafe(lead.last_modified || lead.updated_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Last Modified By</p>
                  <p className="text-sm text-muted-foreground">{lead.last_modified_by || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Trello Section */}
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Trello</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium mb-1">Card Created</p>
                  <p className="text-sm text-muted-foreground">{lead.card_created ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Card ID</p>
                  <p className="text-sm text-muted-foreground font-mono">{lead.card_id || "—"}</p>
                </div>
                {lead.card_id && (
                  <div className="col-span-2">
                    <Button variant="outline" size="sm" asChild className="min-h-[44px] gap-2">
                      <a href={`https://trello.com/c/${lead.card_id}`} target="_blank" rel="noopener noreferrer">
                        Open Trello Card
                      </a>
                    </Button>
                  </div>
                )}
                {!lead.card_id && (
                  <div className="col-span-2">
                    <TrelloCreateButton leadId={leadId} leadName={lead.customer_name || lead.name || null} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quote / Products Tab */}
        <TabsContent value="quote" className="space-y-4">
          {(lead.has_requested_quote || lead.quote_data || lead.category || lead.product_type) ? (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Quote / Products</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {lead.category && (
                    <div>
                      <p className="text-sm font-medium mb-1">Category</p>
                      <p className="text-sm text-muted-foreground">{lead.category}</p>
                    </div>
                  )}
                  {lead.product_type && (
                    <div>
                      <p className="text-sm font-medium mb-1">Product Type</p>
                      <p className="text-sm text-muted-foreground">{lead.product_type}</p>
                    </div>
                  )}
                  {lead.accessories_selected && (
                    <div>
                      <p className="text-sm font-medium mb-1">Accessories Selected</p>
                      <p className="text-sm text-muted-foreground">{lead.accessories_selected}</p>
                    </div>
                  )}
                  {lead.include_warmups && (
                    <div>
                      <p className="text-sm font-medium mb-1">Include Warmups</p>
                      <p className="text-sm text-muted-foreground">{lead.include_warmups}</p>
                    </div>
                  )}
                  {lead.quantity_range && (
                    <div>
                      <p className="text-sm font-medium mb-1">Quantity Range</p>
                      <p className="text-sm text-muted-foreground">{lead.quantity_range}</p>
                    </div>
                  )}
                  {lead.has_deadline && (
                    <div>
                      <p className="text-sm font-medium mb-1">Has Deadline</p>
                      <p className="text-sm text-muted-foreground">{lead.has_deadline}</p>
                    </div>
                  )}
                  {lead.message && (
                    <div className="md:col-span-2">
                      <p className="text-sm font-medium mb-1">Message</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.message}</p>
                    </div>
                  )}
                  {lead.design_notes && (
                    <div className="md:col-span-2">
                      <p className="text-sm font-medium mb-1">Design Notes</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.design_notes}</p>
                    </div>
                  )}
                  {lead.trello_product_list && (
                    <div>
                      <p className="text-sm font-medium mb-1">Trello Product List</p>
                      <p className="text-sm text-muted-foreground">{lead.trello_product_list}</p>
                    </div>
                  )}
                  {lead.attachments && (
                    <div className="md:col-span-2">
                      <p className="text-sm font-medium mb-1">Attachments</p>
                      {Array.isArray(lead.attachments) ? (
                        <div className="space-y-2">
                          {lead.attachments.map((url, idx) => (
                            <a key={idx} href={String(url)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block">
                              {String(url)}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <a href={String(lead.attachments)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                          {String(lead.attachments)}
                        </a>
                      )}
                    </div>
                  )}
                  {lead.quote_data && Object.keys(lead.quote_data).length > 0 && (
                    <div className="md:col-span-2">
                      <details className="mt-4">
                        <summary className="text-sm font-medium cursor-pointer">View Raw Quote Data</summary>
                        <pre className="text-xs text-muted-foreground font-mono mt-2 p-3 bg-muted rounded overflow-auto">
                          {JSON.stringify(lead.quote_data, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No quote request data available.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Booking Tab */}
        <TabsContent value="booking" className="space-y-4">
          {(lead.has_booked_call || lead.booking_data || lead.booking_time) ? (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Booking</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {lead.booking_approved && (
                    <div>
                      <p className="text-sm font-medium mb-1">Booking Approved</p>
                      <p className="text-sm text-muted-foreground">{lead.booking_approved}</p>
                    </div>
                  )}
                  {lead.booking_time && (
                    <div>
                      <p className="text-sm font-medium mb-1">Booking Time</p>
                      <p className="text-sm text-muted-foreground">{formatDateSafe(lead.booking_time)}</p>
                    </div>
                  )}
                  {lead.pre_call_notes && (
                    <div className="md:col-span-2">
                      <p className="text-sm font-medium mb-1">Pre-call Notes</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.pre_call_notes}</p>
                    </div>
                  )}
                  {lead.booking_data && Object.keys(lead.booking_data).length > 0 && (
                    <div className="md:col-span-2">
                      <details className="mt-4">
                        <summary className="text-sm font-medium cursor-pointer">View Raw Booking Data</summary>
                        <pre className="text-xs text-muted-foreground font-mono mt-2 p-3 bg-muted rounded overflow-auto">
                          {JSON.stringify(lead.booking_data, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No booking data available.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Question Tab */}
        <TabsContent value="question" className="space-y-4">
          {(lead.has_asked_question || lead.question_data || lead.question) ? (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Question</h3>
                <div className="space-y-4">
                  {lead.question && (
                    <div>
                      <p className="text-sm font-medium mb-1">Question</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded">
                        {lead.question}
                      </p>
                    </div>
                  )}
                  {lead.question_data && Object.keys(lead.question_data).length > 0 && (
                    <div>
                      <details>
                        <summary className="text-sm font-medium cursor-pointer">View Raw Question Data</summary>
                        <pre className="text-xs text-muted-foreground font-mono mt-2 p-3 bg-muted rounded overflow-auto">
                          {JSON.stringify(lead.question_data, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No question submitted.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Timeline</h3>
              <div className="space-y-3">
                {/* Date-based timeline entries */}
                {lead.submission_date && (
                  <div className="border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Created</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateSafe(lead.submission_date)}
                      </span>
                    </div>
                  </div>
                )}
                {lead.updated_at && lead.updated_at !== lead.submission_date && (
                  <div className="border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Updated</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateSafe(lead.updated_at)}
                      </span>
                    </div>
                  </div>
                )}
                {lead.last_modified && lead.last_modified !== lead.updated_at && (
                  <div className="border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Last Modified</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateSafe(lead.last_modified)}
                      </span>
                    </div>
                  </div>
                )}
                {lead.date_approved && (
                  <div className="border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Date Approved</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateSafe(lead.date_approved)}
                      </span>
                    </div>
                  </div>
                )}
                {lead.delivery_date && (
                  <div className="border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Delivery Date</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateSafe(lead.delivery_date)}
                      </span>
                    </div>
                  </div>
                )}
                {lead.date_delivered_collected && (
                  <div className="border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Delivered/Collected</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateSafe(lead.date_delivered_collected)}
                      </span>
                    </div>
                  </div>
                )}
                {lead.date_completed && (
                  <div className="border-b pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Date Completed</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateSafe(lead.date_completed)}
                      </span>
                    </div>
                  </div>
                )}
                {/* Events timeline */}
                {events.length > 0 && (
                  <>
                    {events.map((event) => (
                      <div key={event.id} className="border-b pb-3 last:border-0">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{event.event_type}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateSafe(event.created_at)}
                            </span>
                          </div>
                          {Object.keys(event.payload).length > 0 && (
                            <pre className="text-xs text-muted-foreground font-mono break-words mt-1">
                              {formatPayload(event.payload)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {events.length === 0 && !lead.submission_date && !lead.updated_at && !lead.last_modified && (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No timeline entries.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <form action={handleAddNote} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="note">Add Note</Label>
                  <Textarea
                    id="note"
                    name="note"
                    placeholder="Enter a note..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    disabled={isNotePending}
                    className="min-h-[100px]"
                    required
                  />
                </div>
                {noteError && (
                  <p className="text-sm text-destructive">{noteError}</p>
                )}
                <Button
                  type="submit"
                  disabled={isNotePending || !noteText.trim()}
                  className="min-h-[44px]"
                >
                  {isNotePending ? "Adding..." : "Add Note"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label htmlFor="design_notes">Design Notes</Label>
                <Textarea
                  id="design_notes"
                  name="design_notes"
                  placeholder="Enter design notes..."
                  value={designNotes}
                  onChange={(e) => setDesignNotes(e.target.value)}
                  disabled={isDesignNotesPending}
                  className="min-h-[150px]"
                />
                <Button
                  type="button"
                  onClick={() => {
                    const formData = new FormData();
                    formData.set("leadId", lead.id || leadId);
                    formData.set("designNotes", designNotes);
                    startDesignNotesTransition(async () => {
                      const result = await updateDesignNotesAction(formData);
                      if (result && "error" in result) {
                        toast.error(result.error);
                      } else {
                        toast.success("Design notes updated successfully");
                        router.refresh();
                      }
                    });
                  }}
                  disabled={isDesignNotesPending}
                  className="min-h-[44px]"
                >
                  {isDesignNotesPending ? "Saving..." : "Save Design Notes"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {notes.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Notes History</h3>
                <div className="space-y-4">
                  {notes.map((note) => (
                    <div key={note.id} className="border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{note.author_user_id.substring(0, 8)}...</span>
                          <span>{formatDateSafe(note.created_at)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {note.note}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
