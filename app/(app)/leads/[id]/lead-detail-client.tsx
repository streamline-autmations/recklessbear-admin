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
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { addNoteAction, changeStatusAction, assignRepAction } from "./actions";

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
  initialStatus: string;
  notes: Note[];
  events: Event[];
  isCeoOrAdmin: boolean;
  reps: Rep[];
}

export function LeadDetailClient({
  leadId,
  initialStatus,
  notes,
  events,
  isCeoOrAdmin,
  reps,
}: LeadDetailClientProps) {
  const router = useRouter();
  const [noteText, setNoteText] = useState("");
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [selectedRepId, setSelectedRepId] = useState<string>("");
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
      const str = JSON.stringify(payload);
      return str.length > 100 ? str.substring(0, 100) + "..." : str;
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

  function handleAssignRep(formData: FormData) {
    setRepError(null);
    formData.set("leadId", leadId);
    formData.set("repId", selectedRepId);
    startRepTransition(async () => {
      const result = await assignRepAction(formData);
      if (result && "error" in result) {
        setRepError(result.error);
        toast.error(result.error);
      } else {
        setSelectedRepId("");
        toast.success("Rep assigned successfully");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Assign Rep - Only for CEO/Admin */}
      {isCeoOrAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Assign Rep</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleAssignRep} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rep">Rep</Label>
                <Select
                  value={selectedRepId}
                  onValueChange={setSelectedRepId}
                  disabled={isRepPending}
                >
                  <SelectTrigger id="rep" className="min-h-[44px]">
                    <SelectValue placeholder="Select a rep..." />
                  </SelectTrigger>
                  <SelectContent>
                    {reps.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No reps available
                      </SelectItem>
                    ) : (
                      reps.map((rep) => (
                        <SelectItem key={rep.user_id} value={rep.user_id}>
                          {rep.full_name || rep.user_id}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {repError && (
                  <p className="text-sm text-destructive">{repError}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={isRepPending || !selectedRepId}
                className="min-h-[44px]"
              >
                {isRepPending ? "Assigning..." : "Assign Rep"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Change Status */}
      <Card>
        <CardHeader>
          <CardTitle>Change Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={selectedStatus}
              onValueChange={handleStatusChange}
              disabled={isStatusPending}
            >
              <SelectTrigger id="status" className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Assigned">Assigned</SelectItem>
                <SelectItem value="Contacted">Contacted</SelectItem>
                <SelectItem value="Quote Sent">Quote Sent</SelectItem>
                <SelectItem value="Quote Approved">Quote Approved</SelectItem>
              </SelectContent>
            </Select>
            {statusError && (
              <p className="text-sm text-destructive">{statusError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Note */}
      <Card>
        <CardHeader>
          <CardTitle>Add Note</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleAddNote} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
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
            <Button type="submit" disabled={isNotePending || !noteText.trim()} className="min-h-[44px]">
              {isNotePending ? "Adding..." : "Add Note"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Notes List */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <div className="space-y-4">
              {notes.map((note) => (
                <div key={note.id} className="border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{note.author_user_id.substring(0, 8)}...</span>
                      <span>{formatDate(note.created_at)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{note.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events List */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className="border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{event.event_type}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(event.created_at)}</span>
                    </div>
                    {Object.keys(event.payload).length > 0 && (
                      <p className="text-xs text-muted-foreground font-mono break-words">
                        {formatPayload(event.payload)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
