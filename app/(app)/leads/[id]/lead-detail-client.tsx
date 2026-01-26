"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { addNoteAction, changeStatusAction, assignRepAction, updateDesignNotesAction, updateLeadFieldsAction } from "./actions";
import StatusBadge from "@/components/status-badge";
import { TrelloCreateButton } from "./trello-create-button";
import type { Lead } from "@/types/leads";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, AlertCircle, CheckCircle2, Pencil, Trash2, Plus } from "lucide-react";

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

  function normalizeStringArray(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return [];
      if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map(String).map((s) => s.trim()).filter(Boolean);
          }
        } catch {
          // ignore
        }
      }
      return trimmed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  function normalizeBoolean(value: unknown): boolean | null {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      if (!v) return null;
      if (["true", "yes", "y", "checked", "1"].includes(v)) return true;
      if (["false", "no", "n", "0"].includes(v)) return false;
    }
    return null;
  }

  function getQuoteValueFallback<T>(primary: T | null | undefined, ...fallbacks: Array<T | null | undefined>): T | null {
    if (primary !== null && primary !== undefined && String(primary).trim() !== "") return primary;
    for (const v of fallbacks) {
      if (v !== null && v !== undefined && String(v).trim() !== "") return v;
    }
    return null;
  }

  const selectedItemGroups = (() => {
    const explicit = normalizeStringArray(lead.selected_apparel_items);
    if (explicit.length > 0) {
      return [{ label: "Selected Items", items: explicit }];
    }

    const sources: Array<{ key: keyof DisplayLead; label: string }> = [
      { key: "corporate_items", label: "Corporate" },
      { key: "schoolwear_items", label: "Schoolwear" },
      { key: "gym_items", label: "Gym" },
      { key: "sports_kits_selected", label: "Sports Kits" },
      { key: "rugby_items", label: "Rugby" },
      { key: "soccer_items", label: "Soccer" },
      { key: "cricket_items", label: "Cricket" },
      { key: "netball_items", label: "Netball" },
      { key: "hockey_items", label: "Hockey" },
      { key: "athletics_items", label: "Athletics" },
      { key: "golf_items", label: "Golf" },
      { key: "fishing_items", label: "Fishing" },
    ];

    const groups = sources
      .map((s) => ({ label: s.label, items: normalizeStringArray(lead[s.key]) }))
      .filter((g) => g.items.length > 0);

    if (groups.length > 0) return groups;

    const legacyQuote = lead.quote_data || {};
    const legacyItems = normalizeStringArray((legacyQuote as Record<string, unknown>)["selected_apparel_items"]);
    if (legacyItems.length > 0) return [{ label: "Selected Items", items: legacyItems }];

    return [];
  })();

  const apparelInterest = getQuoteValueFallback(
    lead.apparel_interest,
    (lead.quote_data as Record<string, unknown> | null)?.["apparel_interest"] as string | null,
    lead.product_type,
    lead.category
  );

  const warmupsValue = normalizeBoolean(
    getQuoteValueFallback(lead.warmup_kit, (lead.quote_data as Record<string, unknown> | null)?.["warmup_kit"])
  );

  const quantityValue = getQuoteValueFallback(
    lead.quantity_value,
    lead.quantity_rough,
    (lead.quote_data as Record<string, unknown> | null)?.["quantity_value"] as string | null,
    (lead.quote_data as Record<string, unknown> | null)?.["quantity_rough"] as string | null,
    lead.quantity_range
  );

  const hasDeadlineValue = normalizeBoolean(
    getQuoteValueFallback(lead.has_deadline, (lead.quote_data as Record<string, unknown> | null)?.["has_deadline"])
  );

  const preferredDeadlineDateValue = getQuoteValueFallback(
    lead.preferred_deadline_date,
    (lead.quote_data as Record<string, unknown> | null)?.["preferred_deadline_date"] as string | null,
    lead.delivery_date
  );

  const attachmentUrls = (() => {
    const direct = normalizeStringArray(lead.attachments);
    if (direct.length > 0) return direct;
    const legacy = normalizeStringArray((lead.quote_data as Record<string, unknown> | null)?.["attachments"]);
    return legacy;
  })();

  const isDev = process.env.NODE_ENV !== "production";

  const isDbLead = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead.id || "");
  const canEditQuote = isCeoOrAdmin && isDbLead;

  type QuoteEditMode =
    | "apparel_interest"
    | "selected_items"
    | "warmup_kit"
    | "quantity"
    | "deadline"
    | "message"
    | "design_notes"
    | "attachments";

  const [quoteEditOpen, setQuoteEditOpen] = useState(false);
  const [quoteEditMode, setQuoteEditMode] = useState<QuoteEditMode | null>(null);
  const [editTextValue, setEditTextValue] = useState("");
  const [editListValue, setEditListValue] = useState("");
  const [editBoolValue, setEditBoolValue] = useState<"true" | "false" | "unset">("unset");
  const [editQuantityValue, setEditQuantityValue] = useState("");
  const [editQuantityRough, setEditQuantityRough] = useState("");
  const [editHasDeadline, setEditHasDeadline] = useState<"true" | "false" | "unset">("unset");
  const [editPreferredDeadline, setEditPreferredDeadline] = useState("");
  const [isQuoteEditPending, startQuoteEditTransition] = useTransition();

  function openQuoteEdit(mode: QuoteEditMode) {
    setQuoteEditMode(mode);
    if (mode === "apparel_interest") {
      setEditTextValue(String(lead.apparel_interest || ""));
    } else if (mode === "selected_items") {
      const current = normalizeStringArray(lead.selected_apparel_items);
      setEditListValue(current.join("\n"));
    } else if (mode === "warmup_kit") {
      const b = normalizeBoolean(lead.warmup_kit);
      setEditBoolValue(b === null ? "unset" : b ? "true" : "false");
    } else if (mode === "quantity") {
      setEditQuantityValue(lead.quantity_value === null || lead.quantity_value === undefined ? "" : String(lead.quantity_value));
      setEditQuantityRough(String(lead.quantity_rough || ""));
    } else if (mode === "deadline") {
      const b = normalizeBoolean(lead.has_deadline);
      setEditHasDeadline(b === null ? "unset" : b ? "true" : "false");
      setEditPreferredDeadline(String(lead.preferred_deadline_date || ""));
    } else if (mode === "message") {
      setEditTextValue(String(lead.message || ""));
    } else if (mode === "design_notes") {
      setEditTextValue(String(lead.design_notes || ""));
    } else if (mode === "attachments") {
      const urls = normalizeStringArray(lead.attachments);
      setEditListValue(urls.join("\n"));
    }
    setQuoteEditOpen(true);
  }

  function clearQuoteField(mode: QuoteEditMode) {
    if (!canEditQuote) return;
    const idToUse = lead.id || leadId;
    const formData = new FormData();
    formData.set("leadId", idToUse);

    const updates: Record<string, unknown> = {};
    if (mode === "apparel_interest") updates.apparel_interest = null;
    if (mode === "selected_items") updates.selected_apparel_items = null;
    if (mode === "warmup_kit") updates.warmup_kit = null;
    if (mode === "quantity") {
      updates.quantity_value = null;
      updates.quantity_rough = null;
    }
    if (mode === "deadline") {
      updates.has_deadline = null;
      updates.preferred_deadline_date = null;
    }
    if (mode === "message") updates.message = null;
    if (mode === "design_notes") updates.design_notes = null;
    if (mode === "attachments") updates.attachments = null;

    formData.set("updates", JSON.stringify(updates));

    startQuoteEditTransition(async () => {
      const result = await updateLeadFieldsAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Field cleared");
      router.refresh();
    });
  }

  function saveQuoteEdits() {
    if (!canEditQuote || !quoteEditMode) return;
    const idToUse = lead.id || leadId;
    const formData = new FormData();
    formData.set("leadId", idToUse);

    const updates: Record<string, unknown> = {};

    if (quoteEditMode === "apparel_interest") {
      updates.apparel_interest = editTextValue.trim() ? editTextValue.trim() : null;
    } else if (quoteEditMode === "selected_items") {
      const items = editListValue
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      updates.selected_apparel_items = items.length > 0 ? items : null;
    } else if (quoteEditMode === "warmup_kit") {
      updates.warmup_kit = editBoolValue === "unset" ? null : editBoolValue === "true";
    } else if (quoteEditMode === "quantity") {
      updates.quantity_value = editQuantityValue.trim() ? editQuantityValue.trim() : null;
      updates.quantity_rough = editQuantityRough.trim() ? editQuantityRough.trim() : null;
    } else if (quoteEditMode === "deadline") {
      updates.has_deadline = editHasDeadline === "unset" ? null : editHasDeadline === "true";
      updates.preferred_deadline_date = editPreferredDeadline.trim() ? editPreferredDeadline.trim() : null;
    } else if (quoteEditMode === "message") {
      updates.message = editTextValue.trim() ? editTextValue.trim() : null;
    } else if (quoteEditMode === "design_notes") {
      updates.design_notes = editTextValue.trim() ? editTextValue.trim() : null;
    } else if (quoteEditMode === "attachments") {
      const urls = editListValue
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      updates.attachments = urls.length > 0 ? urls : null;
    }

    formData.set("updates", JSON.stringify(updates));

    startQuoteEditTransition(async () => {
      const result = await updateLeadFieldsAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Quote updated");
      setQuoteEditOpen(false);
      router.refresh();
    });
  }

  function quoteEditTitle(mode: QuoteEditMode | null) {
    if (!mode) return "Edit";
    if (mode === "apparel_interest") return "Edit Apparel Interest";
    if (mode === "selected_items") return "Edit Selected Items";
    if (mode === "warmup_kit") return "Edit Warmups";
    if (mode === "quantity") return "Edit Quantity";
    if (mode === "deadline") return "Edit Deadline";
    if (mode === "message") return "Edit Message";
    if (mode === "design_notes") return "Edit Design Notes";
    if (mode === "attachments") return "Edit Attachments";
    return "Edit";
  }

  function QuoteField({
    label,
    value,
    empty,
    onEdit,
    onClear,
  }: {
    label: string;
    value: ReactNode;
    empty: boolean;
    onEdit: () => void;
    onClear: () => void;
  }) {
    return (
      <div className="group relative pr-12">
        <p className="text-sm font-medium mb-1">{label}</p>
        <div className="text-sm text-muted-foreground">{value}</div>
        {canEditQuote && (
          <div className="absolute right-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.preventDefault();
                onEdit();
              }}
              aria-label={empty ? `Add ${label}` : `Edit ${label}`}
              title={empty ? "Add" : "Edit"}
              disabled={isQuoteEditPending}
            >
              {empty ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
            {!empty && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.preventDefault();
                  onClear();
                }}
                aria-label={`Clear ${label}`}
                title="Clear"
                disabled={isQuoteEditPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  function formatSelectedItemsValue() {
    if (selectedItemGroups.length === 0) return "Not provided";
    return (
      <div className="space-y-3">
        {selectedItemGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            {selectedItemGroups.length > 1 && (
              <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <span
                  key={`${group.label}-${item}`}
                  className="inline-flex items-center rounded-md border border-border bg-background/40 px-2.5 py-1 text-xs font-medium"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function formatAttachmentsValue() {
    if (attachmentUrls.length === 0) return "Not provided";
    return (
      <div className="space-y-2">
        {attachmentUrls.map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline block break-all"
          >
            {url}
          </a>
        ))}
      </div>
    );
  }

  function formatDeadlineValue() {
    if (hasDeadlineValue === null) return "Not provided";
    if (!hasDeadlineValue) return "No";
    if (preferredDeadlineDateValue) return `Yes • ${formatDateSafe(preferredDeadlineDateValue)}`;
    return "Yes";
  }

  function formatWarmupsValue() {
    if (warmupsValue === null) return "Not provided";
    return warmupsValue ? "Yes" : "No";
  }

  function formatQuantityValue() {
    if (quantityValue === null) return "Not provided";
    return String(quantityValue);
  }

  function formatMessageValue() {
    return lead.message ? <span className="whitespace-pre-wrap">{lead.message}</span> : "Not provided";
  }

  function formatDesignNotesValue() {
    return lead.design_notes ? <span className="whitespace-pre-wrap">{lead.design_notes}</span> : "Not provided";
  }

  function formatApparelInterestValue() {
    return apparelInterest || "Not provided";
  }

  function isEmptyValue(val: unknown) {
    if (val === null || val === undefined) return true;
    if (typeof val === "string") return val.trim().length === 0;
    if (Array.isArray(val)) return val.length === 0;
    return false;
  }

  function quoteFieldEmpty(mode: QuoteEditMode) {
    if (mode === "apparel_interest") return isEmptyValue(lead.apparel_interest);
    if (mode === "selected_items") return normalizeStringArray(lead.selected_apparel_items).length === 0;
    if (mode === "warmup_kit") return normalizeBoolean(lead.warmup_kit) === null;
    if (mode === "quantity") return isEmptyValue(lead.quantity_value) && isEmptyValue(lead.quantity_rough);
    if (mode === "deadline") return normalizeBoolean(lead.has_deadline) === null && isEmptyValue(lead.preferred_deadline_date);
    if (mode === "message") return isEmptyValue(lead.message);
    if (mode === "design_notes") return isEmptyValue(lead.design_notes);
    if (mode === "attachments") return normalizeStringArray(lead.attachments).length === 0;
    return true;
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
          <Dialog open={quoteEditOpen} onOpenChange={setQuoteEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{quoteEditTitle(quoteEditMode)}</DialogTitle>
              </DialogHeader>

              {quoteEditMode === "apparel_interest" && (
                <div className="space-y-2">
                  <Label>Apparel Interest</Label>
                  <Input value={editTextValue} onChange={(e) => setEditTextValue(e.target.value)} />
                </div>
              )}

              {quoteEditMode === "selected_items" && (
                <div className="space-y-2">
                  <Label>Selected Items (one per line)</Label>
                  <Textarea
                    value={editListValue}
                    onChange={(e) => setEditListValue(e.target.value)}
                    className="min-h-[160px]"
                    placeholder="e.g.\nPolo Shirts\nHoodies\nCaps"
                  />
                </div>
              )}

              {quoteEditMode === "warmup_kit" && (
                <div className="space-y-2">
                  <Label>Warmups</Label>
                  <Select value={editBoolValue} onValueChange={(v: "true" | "false" | "unset") => setEditBoolValue(v)}>
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">Not provided</SelectItem>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {quoteEditMode === "quantity" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Quantity Value</Label>
                    <Input value={editQuantityValue} onChange={(e) => setEditQuantityValue(e.target.value)} placeholder="e.g. 50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantity Rough</Label>
                    <Input value={editQuantityRough} onChange={(e) => setEditQuantityRough(e.target.value)} placeholder="e.g. 30-50" />
                  </div>
                </div>
              )}

              {quoteEditMode === "deadline" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Has Deadline</Label>
                    <Select
                      value={editHasDeadline}
                      onValueChange={(v: "true" | "false" | "unset") => setEditHasDeadline(v)}
                    >
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">Not provided</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Preferred Deadline Date</Label>
                    <Input
                      value={editPreferredDeadline}
                      onChange={(e) => setEditPreferredDeadline(e.target.value)}
                      placeholder="YYYY-MM-DD or any date string"
                    />
                  </div>
                </div>
              )}

              {quoteEditMode === "message" && (
                <div className="space-y-2">
                  <Label>Message</Label>
                  <Textarea value={editTextValue} onChange={(e) => setEditTextValue(e.target.value)} className="min-h-[160px]" />
                </div>
              )}

              {quoteEditMode === "design_notes" && (
                <div className="space-y-2">
                  <Label>Design Notes</Label>
                  <Textarea value={editTextValue} onChange={(e) => setEditTextValue(e.target.value)} className="min-h-[160px]" />
                </div>
              )}

              {quoteEditMode === "attachments" && (
                <div className="space-y-2">
                  <Label>Attachments (one URL per line)</Label>
                  <Textarea
                    value={editListValue}
                    onChange={(e) => setEditListValue(e.target.value)}
                    className="min-h-[160px]"
                    placeholder="https://...\nhttps://..."
                  />
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setQuoteEditOpen(false)} disabled={isQuoteEditPending}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveQuoteEdits} disabled={isQuoteEditPending || !canEditQuote}>
                  {isQuoteEditPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card>
            <CardContent className="pt-6">
              <h3 className="text-lg font-semibold mb-4">Quote / Products</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <QuoteField
                  label="Apparel Interest"
                  value={formatApparelInterestValue()}
                  empty={quoteFieldEmpty("apparel_interest")}
                  onEdit={() => openQuoteEdit("apparel_interest")}
                  onClear={() => clearQuoteField("apparel_interest")}
                />

                <div className="md:col-span-2">
                  <QuoteField
                    label="Selected Items"
                    value={formatSelectedItemsValue()}
                    empty={quoteFieldEmpty("selected_items")}
                    onEdit={() => openQuoteEdit("selected_items")}
                    onClear={() => clearQuoteField("selected_items")}
                  />
                </div>

                <QuoteField
                  label="Warmups"
                  value={formatWarmupsValue()}
                  empty={quoteFieldEmpty("warmup_kit")}
                  onEdit={() => openQuoteEdit("warmup_kit")}
                  onClear={() => clearQuoteField("warmup_kit")}
                />

                <QuoteField
                  label="Quantity"
                  value={formatQuantityValue()}
                  empty={quoteFieldEmpty("quantity")}
                  onEdit={() => openQuoteEdit("quantity")}
                  onClear={() => clearQuoteField("quantity")}
                />

                <div className="md:col-span-2">
                  <QuoteField
                    label="Deadline"
                    value={formatDeadlineValue()}
                    empty={quoteFieldEmpty("deadline")}
                    onEdit={() => openQuoteEdit("deadline")}
                    onClear={() => clearQuoteField("deadline")}
                  />
                </div>

                <div className="md:col-span-2">
                  <QuoteField
                    label="Message"
                    value={formatMessageValue()}
                    empty={quoteFieldEmpty("message")}
                    onEdit={() => openQuoteEdit("message")}
                    onClear={() => clearQuoteField("message")}
                  />
                </div>

                <div className="md:col-span-2">
                  <QuoteField
                    label="Design Notes"
                    value={formatDesignNotesValue()}
                    empty={quoteFieldEmpty("design_notes")}
                    onEdit={() => openQuoteEdit("design_notes")}
                    onClear={() => clearQuoteField("design_notes")}
                  />
                </div>

                <div className="md:col-span-2">
                  <QuoteField
                    label="Attachments"
                    value={formatAttachmentsValue()}
                    empty={quoteFieldEmpty("attachments")}
                    onEdit={() => openQuoteEdit("attachments")}
                    onClear={() => clearQuoteField("attachments")}
                  />
                </div>

                {isDev && (
                  <div className="md:col-span-2">
                    <details className="mt-2">
                      <summary className="text-sm font-medium cursor-pointer">Debug</summary>
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-muted-foreground">Raw keys present on lead object:</p>
                        <pre className="text-xs text-muted-foreground font-mono p-3 bg-muted rounded overflow-auto">
                          {Object.keys(lead).sort().join("\n")}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
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
