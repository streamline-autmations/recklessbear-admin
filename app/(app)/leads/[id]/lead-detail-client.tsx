"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
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
import { addNoteAction, deleteNoteAction, changeStatusAction, assignRepAction, updateDesignNotesAction, updateLeadFieldsAction } from "./actions";
import StatusBadge from "@/components/status-badge";
import { AttachmentGallery } from "./attachment-gallery";
import type { Lead } from "@/types/leads";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Pencil, Trash2, Plus, ArrowUp, ArrowDown, RotateCcw, Copy } from "lucide-react";
import { assignToMeAction } from "../actions";
import { getTrelloCardUrl, TRELLO_LISTS } from "@/lib/trello";
import { renderTrelloCardDescription } from "@/lib/trello-card-template";

const leadDetailTabs = [
  { value: "overview", label: "Overview" },
  { value: "quote", label: "Quote" },
  { value: "booking", label: "Booking" },
  { value: "question", label: "Question" },
  { value: "timeline", label: "Timeline" },
  { value: "notes", label: "Notes" },
] as const;

type LeadDetailTabValue = (typeof leadDetailTabs)[number]["value"];

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
  author_display_name?: string | null;
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
  job?: {
    id: string;
    trello_card_id: string | null;
    trello_card_url: string | null;
    trello_list_id: string | null;
    production_stage: string | null;
  } | null;
}

export function LeadDetailClient({
  leadId,
  lead,
  initialStatus,
  notes,
  events,
  isCeoOrAdmin,
  reps,
  job,
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
  const [isDeleteNotePending, startDeleteNoteTransition] = useTransition();
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [isStatusPending, startStatusTransition] = useTransition();
  const [isRepPending, startRepTransition] = useTransition();
  const [isDesignNotesPending, startDesignNotesTransition] = useTransition();
  const [bannerNoteOpen, setBannerNoteOpen] = useState(false);
  const [bannerNote, setBannerNote] = useState("");
  const [isBannerPending, startBannerTransition] = useTransition();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [trelloPreviewOpen, setTrelloPreviewOpen] = useState(false);
  const [trelloJobId, setTrelloJobId] = useState("");
  const [trelloCardTitle, setTrelloCardTitle] = useState("");
  const [trelloTargetListId, setTrelloTargetListId] = useState<string>(TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION);
  const [trelloProductList, setTrelloProductList] = useState("");
  const [isCreatingTrello, setIsCreatingTrello] = useState(false);
  const defaultTabOrder = useMemo<LeadDetailTabValue[]>(() => leadDetailTabs.map((t) => t.value), []);
  const [activeTab, setActiveTab] = useState<LeadDetailTabValue>("overview");
  const [tabOrder, setTabOrder] = useState<LeadDetailTabValue[]>(defaultTabOrder);
  const [arrangeTabsOpen, setArrangeTabsOpen] = useState(false);

  const hasQuoteData = useMemo(() => {
    const hasKeys =
      !!lead.quote_data && typeof lead.quote_data === "object" && Object.keys(lead.quote_data).length > 0;

    const hasNonEmpty = (v: unknown) => {
      if (v === null || v === undefined) return false;
      if (typeof v === "string") return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "number") return true;
      if (typeof v === "boolean") return true;
      return true;
    };

    return (
      !!lead.has_requested_quote ||
      hasKeys ||
      hasNonEmpty(lead.apparel_interest) ||
      hasNonEmpty(lead.selected_apparel_items) ||
      hasNonEmpty(lead.warmup_kit) ||
      hasNonEmpty(lead.quantity_value) ||
      hasNonEmpty(lead.quantity_rough) ||
      hasNonEmpty(lead.has_deadline) ||
      hasNonEmpty(lead.preferred_deadline_date) ||
      hasNonEmpty(lead.category) ||
      hasNonEmpty(lead.product_type) ||
      hasNonEmpty(lead.trello_product_list) ||
      hasNonEmpty(lead.attachments) ||
      hasNonEmpty(lead.message) ||
      hasNonEmpty(lead.design_notes) ||
      hasNonEmpty(lead.delivery_date)
    );
  }, [lead]);

  const hasBookingData = useMemo(() => {
    const hasKeys =
      !!lead.booking_data && typeof lead.booking_data === "object" && Object.keys(lead.booking_data).length > 0;
    return !!lead.has_booked_call || !!lead.booking_time || !!lead.booking_approved || !!lead.pre_call_notes || hasKeys;
  }, [lead]);

  const hasQuestionData = useMemo(() => {
    const hasKeys =
      !!lead.question_data && typeof lead.question_data === "object" && Object.keys(lead.question_data).length > 0;
    return !!lead.has_asked_question || !!lead.question || hasKeys;
  }, [lead]);

  const visibleTabs = useMemo(() => {
    return leadDetailTabs.filter((tab) => {
      if (tab.value === "overview") return true;
      if (tab.value === "timeline") return true;
      if (tab.value === "notes") return true;
      if (tab.value === "quote") return hasQuoteData;
      if (tab.value === "booking") return hasBookingData;
      if (tab.value === "question") return hasQuestionData;
      return true;
    });
  }, [hasBookingData, hasQuestionData, hasQuoteData]);

  useEffect(() => {
    if (!mobileDetailsOpen) {
      setActiveTab("overview");
    }
  }, [mobileDetailsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("rb:leadDetailTabsOrder");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const known = new Set(leadDetailTabs.map((t) => t.value));
      const next = parsed
        .map(String)
        .filter((v): v is LeadDetailTabValue => known.has(v as LeadDetailTabValue))
        .filter((v, idx, arr) => arr.indexOf(v) === idx);
      if (next.length > 0) setTabOrder(next);
    } catch {
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("rb:leadDetailTabsOrder", JSON.stringify(tabOrder));
    } catch {
    }
  }, [tabOrder]);

  const orderedTabs = useMemo(() => {
    const visibleValues = visibleTabs.map((t) => t.value);
    const visibleSet = new Set(visibleValues);
    const normalized = tabOrder.filter((v) => visibleSet.has(v));
    const missing = visibleValues.filter((v) => !normalized.includes(v));
    const values = [...normalized, ...missing];
    return values.map((v) => visibleTabs.find((t) => t.value === v)).filter(Boolean);
  }, [tabOrder, visibleTabs]);

  useEffect(() => {
    if (!orderedTabs.some((t) => t?.value === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, orderedTabs]);

  function moveTab(value: LeadDetailTabValue, direction: "up" | "down") {
    setTabOrder((prev) => {
      const all = leadDetailTabs.map((t) => t.value);
      const visibleValues = visibleTabs.map((t) => t.value);
      const visibleSet = new Set(visibleValues);
      const normalized = prev.filter((v) => all.includes(v));
      const currentVisible = [...normalized.filter((v) => visibleSet.has(v)), ...visibleValues.filter((v) => !normalized.includes(v))];
      const idx = currentVisible.indexOf(value);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentVisible.length) return prev;
      const copy = [...currentVisible];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      const hidden = all.filter((v) => !visibleSet.has(v));
      return [...copy, ...hidden];
    });
  }

  function resetTabOrder() {
    setTabOrder(defaultTabOrder);
  }

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
    return <AttachmentGallery attachments={attachmentUrls} />;
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

  function handleDeleteNote(noteId: string) {
    if (!confirm("Delete this note?")) return;
    const formData = new FormData();
    formData.set("leadId", leadId);
    formData.set("noteId", noteId);
    setPendingDeleteNoteId(noteId);
    startDeleteNoteTransition(async () => {
      const result = await deleteNoteAction(formData);
      setPendingDeleteNoteId(null);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Note deleted");
      router.refresh();
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

  function canUseDbActions(): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lead.id || "");
  }

  function normalizeStatus(value: string | null | undefined): string {
    return (value || "").trim().toLowerCase();
  }

  const bannerState = useMemo(() => {
    const status = normalizeStatus(selectedStatus || lead.status);
    const salesStatus = normalizeStatus(lead.sales_status);
    const isUnassigned = !lead.assigned_rep_id;
    const inProduction = status === "in production" || !!lead.production_stage || salesStatus === "in production";
    const quoteApproved = status === "quote approved" || salesStatus === "quote approved";
    const quoteSentOrPending = status === "quote sent" || (lead.has_requested_quote && !quoteApproved);
    const needsContact = !isUnassigned && (status === "new" || status === "assigned");
    const trelloUrl = lead.card_id ? getTrelloCardUrl(lead.card_id) : null;

    if (isUnassigned) {
      return {
        title: "Next Action",
        message: "Assign this lead to a rep to start.",
        kind: "unassigned" as const,
        trelloUrl,
      };
    }

    if (needsContact) {
      return {
        title: "Next Action",
        message: "Contact the customer now.",
        kind: "needs_contact" as const,
        trelloUrl,
      };
    }

    if (quoteSentOrPending) {
      return {
        title: "Next Action",
        message: "Send or review quote.",
        kind: "quote" as const,
        trelloUrl,
      };
    }

    if (quoteApproved && !lead.card_id) {
      return {
        title: "Next Action",
        message: "Start production by creating a Trello card.",
        kind: "ready_for_production" as const,
        trelloUrl,
      };
    }

    if (inProduction) {
      return {
        title: "Next Action",
        message: "Track production stage and update customer if needed.",
        kind: "in_production" as const,
        trelloUrl,
      };
    }

    return {
      title: "Next Action",
      message: "Review the lead and take the next step.",
      kind: "default" as const,
      trelloUrl,
    };
  }, [lead, selectedStatus]);

  function submitBannerNote() {
    if (!canUseDbActions()) {
      toast.error("Notes are unavailable for this lead.");
      return;
    }
    const note = bannerNote.trim();
    if (!note) return;

    startBannerTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", lead.id as string);
      formData.set("note", note);
      const result = await addNoteAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Note added");
      setBannerNote("");
      setBannerNoteOpen(false);
      router.refresh();
    });
  }

  function createUuidV4(): string {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
    const bytes = new Uint8Array(16);
    cryptoObj?.getRandomValues?.(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function buildCardTitle(): string {
    const leadIdText = lead.lead_id;
    const customerName = (lead.customer_name || lead.name || "").trim();
    const org = (lead.organization || "").trim();
    if (customerName && org) return `${customerName} — ${org} (${leadIdText})`;
    if (customerName) return `${customerName} (${leadIdText})`;
    return `Lead ${leadIdText}`;
  }

  function buildProductListPrefill(): string {
    const selected = Array.isArray(lead.selected_apparel_items) ? lead.selected_apparel_items : null;
    if (selected && selected.length > 0) {
      return selected
        .map((itemRaw) => {
          const item = String(itemRaw || "").trim();
          if (!item) return "";
          return `${item} (STD)\n[Qty], [Size]`;
        })
        .filter(Boolean)
        .join("\n\n");
    }
    return (lead.trello_product_list || "").trim();
  }

  function openTrelloPreview() {
    if (!canUseDbActions()) {
      toast.error("Start Production is unavailable for this lead.");
      return;
    }
    setTrelloJobId(createUuidV4());
    setTrelloCardTitle(buildCardTitle());
    setTrelloTargetListId(TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION);
    setTrelloProductList(buildProductListPrefill());
    setTrelloPreviewOpen(true);
  }

  const trelloDescriptionPreview = useMemo(() => {
    const leadIdText = lead.lead_id;
    const customerName = (lead.customer_name || lead.name || "").trim() || `Lead ${leadIdText}`;
    const productList = trelloProductList.trim() || "Product Name (STD)\n[Qty], [Size]";
    return renderTrelloCardDescription({
      INVOICE_NUMBER: "[Enter Invoice # Here]",
      PAYMENT_STATUS: lead.payment_status || "Pending",
      JOB_ID: trelloJobId || "[JOB_ID]",
      ORDER_QUANTITY: "[Enter Total Quantity]",
      ORDER_DEADLINE: lead.delivery_date || "[Enter Deadline]",
      PRODUCT_LIST: productList,
      CUSTOMER_NAME: customerName,
      PHONE: lead.phone || "[Enter Phone]",
      EMAIL: lead.email || "[Enter Email]",
      ORGANIZATION: lead.organization || "[Enter Organization]",
      LOCATION: "[Enter Location]",
      DESIGN_NOTES: lead.design_notes || "[Add any final design notes here]",
      LEAD_ID: leadIdText,
      INVOICE_MACHINE: "",
      ORDER_QUANTITY_MACHINE: "",
      ORDER_DEADLINE_MACHINE: lead.delivery_date || "",
    });
  }, [lead, trelloJobId, trelloProductList]);

  async function copyProductList() {
    try {
      await navigator.clipboard.writeText(trelloProductList);
      toast.success("Copied product list");
    } catch {
      toast.error("Copy failed");
    }
  }

  async function createTrelloCard() {
    if (!canUseDbActions()) return;
    if (!trelloProductList.trim()) return;

    setIsCreatingTrello(true);
    try {
      const res = await fetch("/api/n8n/card-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          jobId: trelloJobId,
          card_title: trelloCardTitle,
          card_description: trelloDescriptionPreview,
          target_list_id: trelloTargetListId,
          product_list: trelloProductList,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detailsText = json?.details ? `: ${typeof json.details === "string" ? json.details : JSON.stringify(json.details)}` : "";
        toast.error((json?.error || "Failed to send to workflow") + detailsText);
        return;
      }

      const message = typeof json?.webhook_response?.message === "string" ? json.webhook_response.message : null;
      toast.success(message || "Sent to workflow");
      setTrelloPreviewOpen(false);
      router.refresh();
    } finally {
      setIsCreatingTrello(false);
    }
  }

  function assignLeadToMe() {
    if (!canUseDbActions()) {
      toast.error("Assignment is unavailable for this lead.");
      return;
    }
    startBannerTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", lead.id as string);
      const result = await assignToMeAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Lead assigned to you");
      router.refresh();
    });
  }

  function focusRepAssign() {
    setAdvancedOpen(true);
    requestAnimationFrame(() => {
      const el = document.getElementById("rep");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="space-y-6">
      <Dialog open={bannerNoteOpen} onOpenChange={setBannerNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={bannerNote}
              onChange={(e) => setBannerNote(e.target.value)}
              className="min-h-[160px]"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBannerNoteOpen(false)} className="min-h-[44px]">
              Cancel
            </Button>
            <Button type="button" onClick={submitBannerNote} disabled={!bannerNote.trim() || isBannerPending} className="min-h-[44px]">
              {isBannerPending ? "Saving..." : "Save Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trelloPreviewOpen} onOpenChange={setTrelloPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] p-0 flex flex-col">
          <div className="px-6 pt-6">
            <DialogHeader>
              <DialogTitle>Preview Trello Card</DialogTitle>
            </DialogHeader>
          </div>

          <div className="px-6 py-4 overflow-y-auto flex-1">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Card Title</Label>
                <Input value={trelloCardTitle} onChange={(e) => setTrelloCardTitle(e.target.value)} className="min-h-[44px]" />
              </div>

              <div className="space-y-2">
                <Label>Target List</Label>
                {isCeoOrAdmin ? (
                  <Select value={trelloTargetListId} onValueChange={setTrelloTargetListId}>
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION}>Orders Awaiting confirmation</SelectItem>
                      <SelectItem value={TRELLO_LISTS.ORDERS}>Orders</SelectItem>
                      <SelectItem value={TRELLO_LISTS.SUPPLIER_ORDERS}>Supplier Orders</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value="Orders Awaiting confirmation" disabled className="min-h-[44px]" />
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Product List</Label>
                  <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={copyProductList} disabled={!trelloProductList.trim()}>
                    <Copy className="h-4 w-4" />
                    Copy Product List
                  </Button>
                </div>
                <Textarea
                  value={trelloProductList}
                  onChange={(e) => setTrelloProductList(e.target.value)}
                  className="min-h-[140px]"
                  placeholder="Paste or type the product list here. Use the same formatting as the template. This is required before creating the card."
                />
                {!trelloProductList.trim() && (
                  <p className="text-sm text-muted-foreground">Product list is required before you can create the Trello card.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Card Description (Preview)</Label>
                <Textarea value={trelloDescriptionPreview} readOnly className="min-h-[280px]" />
              </div>
            </div>
          </div>

          <div className="px-6 pb-6">
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setTrelloPreviewOpen(false)} className="min-h-[44px]" disabled={isCreatingTrello}>
                Cancel
              </Button>
              <Button type="button" onClick={createTrelloCard} className="min-h-[44px]" disabled={isCreatingTrello || !trelloProductList.trim()}>
                {isCreatingTrello ? "Sending..." : "Send to Workflow"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Card data-tour="lead-next-action" className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{bannerState.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{bannerState.message}</p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            {bannerState.kind === "unassigned" && (
              <>
                {!isCeoOrAdmin ? (
                  <Button type="button" className="min-h-[44px]" onClick={assignLeadToMe} disabled={isBannerPending || !canUseDbActions()}>
                    {isBannerPending ? "Assigning..." : "Assign to Me"}
                  </Button>
                ) : (
                  <Button type="button" className="min-h-[44px]" onClick={focusRepAssign}>
                    Assign Rep
                  </Button>
                )}
              </>
            )}

            {bannerState.kind === "needs_contact" && (
              <>
                {lead.phone ? (
                  <Button asChild className="min-h-[44px]">
                    <a href={`tel:${lead.phone}`}>Call customer</a>
                  </Button>
                ) : lead.email ? (
                  <Button asChild className="min-h-[44px]">
                    <a href={`mailto:${lead.email}`}>Email customer</a>
                  </Button>
                ) : (
                  <Button type="button" className="min-h-[44px]" onClick={() => handleStatusChange("Contacted")} disabled={isStatusPending}>
                    {isStatusPending ? "Updating..." : "Mark contacted"}
                  </Button>
                )}
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => handleStatusChange("Contacted")} disabled={isStatusPending}>
                  {isStatusPending ? "Updating..." : "Mark contacted"}
                </Button>
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setBannerNoteOpen(true)} disabled={!canUseDbActions()}>
                  Add note
                </Button>
              </>
            )}

            {bannerState.kind === "quote" && (
              <>
                <Button type="button" className="min-h-[44px]" onClick={() => setActiveTab("quote")}>
                  Open quote details
                </Button>
                {lead.phone ? (
                  <Button asChild variant="outline" className="min-h-[44px]">
                    <a href={`tel:${lead.phone}`}>Call customer</a>
                  </Button>
                ) : lead.email ? (
                  <Button asChild variant="outline" className="min-h-[44px]">
                    <a href={`mailto:${lead.email}`}>Email customer</a>
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setBannerNoteOpen(true)} disabled={!canUseDbActions()}>
                  Add note
                </Button>
              </>
            )}

            {bannerState.kind === "ready_for_production" && (
              <>
                {isCeoOrAdmin ? (
                  <Button type="button" className="min-h-[44px]" onClick={openTrelloPreview}>
                    Preview Trello Card
                  </Button>
                ) : (
                  <Button type="button" className="min-h-[44px]" disabled>
                    Awaiting admin
                  </Button>
                )}
              </>
            )}

            {bannerState.kind === "in_production" && bannerState.trelloUrl && (
              <>
                <Button asChild className="min-h-[44px]">
                  <a href={bannerState.trelloUrl} target="_blank" rel="noopener noreferrer">
                    Open Trello card
                  </a>
                </Button>
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setBannerNoteOpen(true)} disabled={!canUseDbActions()}>
                  Add note
                </Button>
              </>
            )}

            {bannerState.kind === "default" && (
              <>
                {lead.phone ? (
                  <Button asChild className="min-h-[44px]">
                    <a href={`tel:${lead.phone}`}>Call customer</a>
                  </Button>
                ) : lead.email ? (
                  <Button asChild className="min-h-[44px]">
                    <a href={`mailto:${lead.email}`}>Email customer</a>
                  </Button>
                ) : null}
                <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setBannerNoteOpen(true)} disabled={!canUseDbActions()}>
                  Add note
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px]"
          onClick={() => setAdvancedOpen((v) => !v)}
        >
          {advancedOpen ? "Hide Advanced" : "Advanced"}
        </Button>
      </div>

      {advancedOpen && (
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
      )}

      {/* Tabs */}
      <Dialog open={arrangeTabsOpen} onOpenChange={setArrangeTabsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arrange Tabs</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {orderedTabs.map((tab, idx) => (
              <div key={tab.value} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="text-sm font-medium">{tab.label}</div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveTab(tab.value, "up")}
                    disabled={idx === 0}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => moveTab(tab.value, "down")}
                    disabled={idx === orderedTabs.length - 1}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={resetTabOrder} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button type="button" onClick={() => setArrangeTabsOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as LeadDetailTabValue)}
        className="w-full"
      >
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="w-full sm:hidden">
            {!mobileDetailsOpen ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] w-full"
                onClick={() => setMobileDetailsOpen(true)}
              >
                More details
              </Button>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select value={activeTab} onValueChange={(v) => setActiveTab(v as LeadDetailTabValue)}>
                    <SelectTrigger className="min-h-[44px] w-full">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {orderedTabs.map((tab) => (
                        <SelectItem key={tab.value} value={tab.value}>
                          {tab.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setMobileDetailsOpen(false)}
                >
                  Hide
                </Button>
              </div>
            )}
          </div>

          <div className="hidden sm:flex w-full items-center gap-2">
            <TabsList className="flex w-full flex-wrap gap-2">
              {orderedTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="min-h-[44px] text-xs sm:text-sm">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 whitespace-nowrap"
              onClick={() => setArrangeTabsOpen(true)}
            >
              Arrange
            </Button>
          </div>
        </div>

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
                {(() => {
                  const cardId = lead.card_id || job?.trello_card_id || null;
                  const trelloUrl = job?.trello_card_url || (cardId ? getTrelloCardUrl(cardId) : null);
                  const isQuoteApproved = (lead.sales_status || lead.status || "").trim() === "Quote Approved";
                  const canPreview = isQuoteApproved && !cardId;

                  if (cardId) {
                    return (
                      <div className="space-y-3">
                        <div>
                          <p className="text-sm font-medium mb-1">Production Stage</p>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                            <p className="text-sm text-foreground">{lead.production_stage || job?.production_stage || "Orders Awaiting confirmation"}</p>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Button variant="outline" asChild className="min-h-[44px] gap-2 w-full justify-start">
                            <a href={trelloUrl || "#"} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                              Open in Trello
                            </a>
                          </Button>
                          {job?.id && (
                            <Button variant="outline" asChild className="min-h-[44px] w-full justify-start">
                              <a href={`/jobs/${job.id}`}>View Job</a>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium mb-1">Start Production</p>
                        {!isQuoteApproved ? (
                          <p className="text-sm text-muted-foreground">Set Quote Approved to start production.</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">Preview the Trello card before creating it.</p>
                        )}
                      </div>
                      <Button type="button" className="min-h-[44px] w-full" onClick={openTrelloPreview} disabled={!canPreview}>
                        Preview Trello Card
                      </Button>
                    </div>
                  );
                })()}
                
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
          {(lead.has_asked_question || lead.question) ? (
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Question Details</h3>
                <div className="space-y-6">
                  {/* Question Field */}
                  {lead.question && (
                    <div>
                      <p className="text-sm font-medium mb-2">Question</p>
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 p-4 rounded-lg border">
                        {lead.question}
                      </div>
                    </div>
                  )}

                  {/* Recommended Answer (Placeholder) */}
                  <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
                    <div className="flex flex-col space-y-1.5 p-4 border-b bg-muted/20">
                      <div className="flex items-center justify-between">
                         <h4 className="font-semibold leading-none tracking-tight text-sm flex items-center gap-2">
                           Recommended Answer
                           <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full border border-sky-200 font-normal">Beta</span>
                         </h4>
                         <Button variant="ghost" size="sm" className="h-7 text-xs" disabled>
                           Regenerate
                         </Button>
                      </div>
                    </div>
                    <div className="p-4">
                       <div className="bg-sky-50/50 border border-sky-100 rounded-md p-4 text-center">
                         <p className="text-sm text-muted-foreground">
                           Chatbot integration pending. This area will soon provide AI-generated responses based on your Knowledge Base.
                         </p>
                         <Button variant="outline" size="sm" className="mt-3" disabled>
                           Connect Knowledge Base
                         </Button>
                       </div>
                    </div>
                  </div>
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
                  <p className="text-xs text-muted-foreground">
                    {formatDateSafe(getQuoteValueFallback(lead.created_at, lead.submission_date))}
                  </p>
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
                          <span className="truncate">
                            {note.author_display_name || `${note.author_user_id.substring(0, 8)}...`}
                          </span>
                          <div className="flex items-center gap-2">
                            <span>{formatDateSafe(note.created_at)}</span>
                            {isCeoOrAdmin && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleDeleteNote(note.id)}
                                disabled={isDeleteNotePending && pendingDeleteNoteId === note.id}
                                aria-label="Delete note"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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
