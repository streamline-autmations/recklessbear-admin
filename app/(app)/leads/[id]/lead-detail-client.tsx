"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { addNoteAction, changeStatusAction, assignRepAction, updateDesignNotesAction } from "./actions";
import StatusBadge from "@/components/status-badge";
import { TrelloCreateButton } from "./trello-create-button";
import type { Lead } from "@/types/leads";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";

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

  return (
    <div className="space-y-6">
      {/* Header Actions: Status and Rep Assignment */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-4 w-full md:w-auto">
              <div className="space-y-2 w-full sm:w-auto">
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
              
              <div className="space-y-2 w-full sm:w-auto">
                <Label htmlFor="rep">Assigned Rep</Label>
                {isCeoOrAdmin ? (
                  <>
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
                    {repError && (
                      <p className="text-sm text-destructive">{repError}</p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center h-[44px] px-3 border rounded-md bg-muted text-muted-foreground text-sm">
                    {lead.assigned_rep_name || "Unassigned"}
                  </div>
                )}
              </div>
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
              {lead.production_stage && (
                <span className="inline-flex items-center rounded-md bg-secondary text-secondary-foreground px-2 py-1 text-xs font-medium border border-border">
                  {lead.production_stage}
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Contact Information */}
            <Card className="md:col-span-2 lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  <p className="text-sm font-medium mb-1">Company</p>
                  <p className="text-sm text-muted-foreground">{lead.organization || "—"}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-1">Date Submitted</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateSafe(lead.submission_date || lead.created_at)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Sales Summary */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Sales Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Sales Status</p>
                  <p className="text-sm text-muted-foreground">{lead.sales_status || lead.status || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Payment Status</p>
                  <p className="text-sm text-muted-foreground">{lead.payment_status || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Assigned Rep</p>
                  <p className="text-sm text-muted-foreground">{lead.assigned_rep_name || "Unassigned"}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium mb-1">Last Modified</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateSafe(lead.last_modified || lead.updated_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">By</p>
                  <p className="text-sm text-muted-foreground">{lead.last_modified_by || "—"}</p>
                </div>
              </CardContent>
            </Card>

            {/* Production / Job Summary */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Production Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {lead.sales_status === "Quote Approved" || lead.card_id ? (
                  <>
                     <div>
                      <p className="text-sm font-medium mb-1">Production Stage</p>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                        <p className="text-sm text-foreground">{lead.production_stage || "Ready for Production"}</p>
                      </div>
                    </div>
                    {lead.card_id ? (
                      <div>
                         <p className="text-sm font-medium mb-1">Trello Card</p>
                         <Button variant="outline" size="sm" asChild className="h-8 gap-2 w-full justify-start">
                           <a href={`https://trello.com/c/${lead.card_id}`} target="_blank" rel="noopener noreferrer">
                             <ExternalLink className="h-3 w-3" />
                             Open Card
                           </a>
                         </Button>
                      </div>
                    ) : (
                      <div className="p-3 bg-muted/50 rounded-lg border border-dashed">
                        <p className="text-xs text-muted-foreground mb-2">Job approved but no Trello card.</p>
                        <TrelloCreateButton leadId={leadId} leadName={lead.customer_name || lead.name || null} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[160px] text-center p-4 bg-muted/20 rounded-lg border border-dashed">
                    <p className="text-sm font-medium text-muted-foreground">Not in Production</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Approve Quote to start job.
                    </p>
                  </div>
                )}
                
                {(lead.delivery_date || lead.date_completed) && (
                  <>
                    <Separator />
                    {lead.delivery_date && (
                      <div>
                        <p className="text-sm font-medium mb-1">Delivery Due</p>
                        <p className="text-sm text-muted-foreground">{formatDateSafe(lead.delivery_date)}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* Convert to Job Section (Phase 3 Prep) */}
          <Card className="mt-6 border-l-4 border-l-primary/20">
             <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      Job Status
                      {lead.sales_status === "Quote Approved" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {lead.sales_status === "Quote Approved" 
                        ? "This lead has been approved and is ready for production tracking."
                        : "Update status to 'Quote Approved' to convert this lead into a production job."}
                    </p>
                  </div>
                  {lead.sales_status !== "Quote Approved" && (
                     <Button 
                       onClick={() => handleStatusChange("Quote Approved")}
                       disabled={isStatusPending}
                     >
                       Approve Quote & Create Job
                     </Button>
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
              <div className="space-y-6 relative pl-4 border-l-2 border-muted ml-2">
                {/* Date-based timeline entries - Merged into a single sorted list with events if possible, but for now stack them */}
                
                <div className="relative">
                  <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-primary/20 border-2 border-primary"></div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-xs text-muted-foreground">{formatDateSafe(lead.submission_date)}</p>
                </div>

                {events.map((event) => (
                  <div key={event.id} className="relative">
                    <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-muted-foreground/20 border-2 border-muted-foreground"></div>
                    <p className="text-sm font-medium">{event.event_type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{formatDateSafe(event.created_at)}</p>
                    {Object.keys(event.payload).length > 0 && (
                       <div className="mt-1 text-xs bg-muted p-2 rounded">
                         <pre className="whitespace-pre-wrap font-mono">{formatPayload(event.payload)}</pre>
                       </div>
                    )}
                  </div>
                ))}
                
                {lead.updated_at && (
                   <div className="relative">
                    <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-muted border-2 border-muted-foreground/50"></div>
                    <p className="text-sm font-medium">Last Updated</p>
                    <p className="text-xs text-muted-foreground">{formatDateSafe(lead.updated_at)}</p>
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
