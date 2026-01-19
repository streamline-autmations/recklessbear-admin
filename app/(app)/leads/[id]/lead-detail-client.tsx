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
import { addNoteAction, changeStatusAction, assignRepAction } from "./actions";
import StatusBadge from "@/components/status-badge";

interface Lead {
  id: string;
  lead_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
  status: string;
  lead_type: string | null;
  source: string | null;
  question_data: Record<string, unknown> | null;
  quote_data: Record<string, unknown> | null;
  booking_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  assigned_rep_id: string | null;
  assigned_rep_name: string | null;
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
  user_id: string;
  full_name: string | null;
}

interface LeadDetailClientProps {
  leadId: string;
  lead: Lead;
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
  const [selectedRepId, setSelectedRepId] = useState<string>(lead.assigned_rep_id || "");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [repError, setRepError] = useState<string | null>(null);
  const [isNotePending, startNoteTransition] = useTransition();
  const [isStatusPending, startStatusTransition] = useTransition();
  const [isRepPending, startRepTransition] = useTransition();

  function formatDate(dateString: string) {
    try {
      return new Date(dateString).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
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
    formData.set("leadId", leadId);
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
    formData.set("leadId", leadId);
    formData.set("repId", newRepId);
    startRepTransition(async () => {
      const result = await assignRepAction(formData);
      if (result && "error" in result) {
        setRepError(result.error);
        setSelectedRepId(lead.assigned_rep_id || "");
        toast.error(result.error);
      } else {
        toast.success("Rep assigned successfully");
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
                      <SelectItem value="">Unassigned</SelectItem>
                      {reps.map((rep) => (
                        <SelectItem key={rep.user_id} value={rep.user_id}>
                          {rep.full_name || rep.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {repError && (
                    <p className="text-sm text-destructive">{repError}</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-6">
          <TabsTrigger value="overview" className="min-h-[44px] text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="request" className="min-h-[44px] text-xs sm:text-sm">Request</TabsTrigger>
          <TabsTrigger value="activity" className="min-h-[44px] text-xs sm:text-sm">Activity</TabsTrigger>
          <TabsTrigger value="notes" className="min-h-[44px] text-xs sm:text-sm">Notes</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium mb-1">Name</p>
                  <p className="text-sm text-muted-foreground">{lead.name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Email</p>
                  <p className="text-sm text-muted-foreground">{lead.email || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Phone</p>
                  <p className="text-sm text-muted-foreground">{lead.phone || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Organization</p>
                  <p className="text-sm text-muted-foreground">{lead.organization || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Source</p>
                  <p className="text-sm text-muted-foreground">{lead.source || "—"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(lead.created_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Request Tab */}
        <TabsContent value="request" className="space-y-4">
          {lead.question_data || lead.quote_data || lead.booking_data ? (
            <div className="space-y-4">
              {lead.question_data && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-sm font-semibold mb-3">Question</h3>
                    <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words bg-muted p-3 rounded">
                      {formatPayload(lead.question_data)}
                    </pre>
                  </CardContent>
                </Card>
              )}
              {lead.quote_data && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-sm font-semibold mb-3">Quote Request</h3>
                    <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words bg-muted p-3 rounded">
                      {formatPayload(lead.quote_data)}
                    </pre>
                  </CardContent>
                </Card>
              )}
              {lead.booking_data && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="text-sm font-semibold mb-3">Booking Request</h3>
                    <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words bg-muted p-3 rounded">
                      {formatPayload(lead.booking_data)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    No request details captured yet.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          {events.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No activity recorded.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {events.map((event) => (
                    <div key={event.id} className="border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{event.event_type}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(event.created_at)}
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
                </div>
              </CardContent>
            </Card>
          )}
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

          {notes.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-4">No notes yet.</p>
                  <Button
                    onClick={() => {
                      const noteInput = document.getElementById("note");
                      noteInput?.focus();
                    }}
                    variant="outline"
                    className="min-h-[44px]"
                  >
                    Add Note
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {notes.map((note) => (
                    <div key={note.id} className="border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{note.author_user_id.substring(0, 8)}...</span>
                          <span>{formatDate(note.created_at)}</span>
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
