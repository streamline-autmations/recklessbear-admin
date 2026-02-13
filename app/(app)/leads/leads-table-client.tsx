"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LayoutGrid, List, X } from "lucide-react";
import { toast } from "sonner";

import type { Lead } from '@/types/leads';
import { assignRepAction } from "./[id]/actions";
import { assignToMeAction } from "./actions";

interface DisplayLead extends Lead {
  id?: string;
  lead_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  assigned_rep_id?: string | null;
  assigned_rep_name?: string | null;
  created_at?: string | null;
  submission_date?: string | null;
  updated_at?: string | null;
  last_activity_at?: string | null;
  organization?: string | null;
}

interface Rep {
  id: string;
  name: string | null;
  email?: string | null;
}

interface LeadsTableClientProps {
  initialLeads: DisplayLead[];
  reps: Rep[];
  currentUserId?: string | null;
  isCeoOrAdmin?: boolean;
}

/**
 * Get rep name from assigned_rep_id
 */
function getRepName(lead: DisplayLead, reps: Rep[]): string | null {
  if (!lead.assigned_rep_id) return null;
  const rep = reps.find(r => r.id === lead.assigned_rep_id);
  return rep?.name || rep?.email || null;
}

/**
 * Build intents array from boolean fields ONLY (flags are source of truth)
 * TEMPORARY FALLBACK: Only infer from field data if ALL 3 flags are false
 * TODO: Remove fallback after all leads are normalized
 */
function buildIntents(lead: DisplayLead): string[] {
  const intents: string[] = [];
  if (lead.has_requested_quote) intents.push("Quote");
  if (lead.has_booked_call) intents.push("Booking");
  if (lead.has_asked_question) intents.push("Question");
  
  // TEMPORARY FALLBACK: Only infer if ALL 3 flags are false (legacy leads)
  if (!lead.has_requested_quote && !lead.has_booked_call && !lead.has_asked_question) {
    // Strong evidence for Quote
    const hasQuoteEvidence = !!(
      (lead.quote_data && typeof lead.quote_data === 'object' && lead.quote_data && Object.keys(lead.quote_data).length > 0) ||
      lead.attachments ||
      lead.category ||
      lead.product_type ||
      lead.quantity_range ||
      (lead.has_deadline && lead.has_deadline !== 'false' && lead.has_deadline !== '') ||
      (lead.include_warmups && lead.include_warmups !== 'false' && lead.include_warmups !== '') ||
      lead.design_notes ||
      lead.message ||
      lead.trello_product_list ||
      lead.delivery_date
    );
    
    // Strong evidence for Booking
    const hasBookingEvidence = !!(
      lead.booking_time ||
      (lead.booking_approved && lead.booking_approved !== 'false' && lead.booking_approved !== '') ||
      (lead.booking_data && typeof lead.booking_data === 'object' && lead.booking_data && Object.keys(lead.booking_data).length > 0) ||
      lead.pre_call_notes
    );
    
    // Strong evidence for Question
    const hasQuestionEvidence = !!(
      lead.question ||
      (lead.question_data && typeof lead.question_data === 'object' && lead.question_data && Object.keys(lead.question_data).length > 0)
    );
    
    if (hasQuoteEvidence) intents.push("Quote");
    if (hasBookingEvidence) intents.push("Booking");
    if (hasQuestionEvidence) intents.push("Question");
  }
  
  // Ensure only canonical intents (no duplicates)
  return Array.from(new Set(intents)).filter(intent => 
    ["Quote", "Booking", "Question"].includes(intent)
  );
}

type FocusTab = "needs_action" | "unassigned" | "in_progress" | "in_production";

type NextActionLabel =
  | "Needs Contact"
  | "Waiting on Client"
  | "Ready for Production"
  | "In Production";

function normalizeStatus(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function getNextActionLabel(lead: DisplayLead): NextActionLabel {
  const status = normalizeStatus(lead.status);
  const salesStatus = normalizeStatus(lead.sales_status);

  const inProduction = status === "in production" || !!lead.production_stage || salesStatus === "in production";
  if (inProduction) return "In Production";

  const quoteApproved = status === "quote approved" || salesStatus === "quote approved";
  if (quoteApproved) return "Ready for Production";

  if (status === "quote sent" || status === "contacted") return "Waiting on Client";

  return "Needs Contact";
}

function matchesFocusTab(lead: DisplayLead, tab: FocusTab): boolean {
  if (tab === "unassigned") return !lead.assigned_rep_id;

  const nextAction = getNextActionLabel(lead);

  if (tab === "needs_action") {
    if (!lead.assigned_rep_id) return false;
    return nextAction === "Needs Contact" || nextAction === "Ready for Production";
  }

  if (tab === "in_progress") {
    if (!lead.assigned_rep_id) return false;
    return nextAction === "Waiting on Client";
  }

  return nextAction === "In Production";
}

function nextActionPillClass(label: NextActionLabel): string {
  if (label === "Needs Contact") return "bg-primary/10 text-primary border-primary/20";
  if (label === "Ready for Production") return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  if (label === "In Production") return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20";
  return "bg-muted text-muted-foreground border-border";
}

function isUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function LeadsTableClient({ initialLeads, reps, currentUserId, isCeoOrAdmin }: LeadsTableClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [intentFilters, setIntentFilters] = useState<Set<string>>(new Set());
  const [assignedRepFilter, setAssignedRepFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "submitted">("updated");
  const [focusTab, setFocusTab] = useState<FocusTab>("needs_action");
  const [assignOpenLeadKey, setAssignOpenLeadKey] = useState<string | null>(null);
  const [assignSelectedRepId, setAssignSelectedRepId] = useState<string>("");
  const [isAssignPending, startAssignTransition] = useTransition();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const realtimeRefreshTimerRef = useRef<number | null>(null);

  // Map rep names to leads
  const leadsWithRepNames = useMemo(() => {
    return initialLeads.map(lead => ({
      ...lead,
      assigned_rep_name: getRepName(lead, reps) || lead.assigned_rep_name
    }));
  }, [initialLeads, reps]);

  // Subscribe to Supabase Realtime for leads table updates
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
        },
        (payload) => {
          console.log('[realtime] Lead changed:', payload.eventType, payload.new || payload.old);
          if (realtimeRefreshTimerRef.current) {
            window.clearTimeout(realtimeRefreshTimerRef.current);
          }
          realtimeRefreshTimerRef.current = window.setTimeout(() => {
            router.refresh();
          }, 500);
        }
      )
      .subscribe((status) => {
        console.log('[realtime] Subscription status:', status);
      });

    return () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("rb-admin.leadsView");
      if (stored === "table") setViewMode("table");
      if (stored === "cards") setViewMode("cards");
    } catch {
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("rb-admin.leadsView", viewMode);
    } catch {
    }
  }, [viewMode]);

  // Get unique values for filters
  const statuses = useMemo(() => {
    const unique = new Set(initialLeads.map((lead) => lead.status || "").filter(Boolean));
    return Array.from(unique).sort();
  }, [initialLeads]);

  // Toggle intent filter
  const toggleIntentFilter = (intent: string) => {
    setIntentFilters((prev) => {
      const next = new Set(prev);
      if (next.has(intent)) {
        next.delete(intent);
      } else {
        next.add(intent);
      }
      return next;
    });
  };

  // Client-side filtering
  const filteredLeads = useMemo(() => {
    let filtered = leadsWithRepNames;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((lead) => {
        const name = lead.name?.toLowerCase() || "";
        const email = lead.email?.toLowerCase() || "";
        const phone = lead.phone?.toLowerCase() || "";
        const organization = lead.organization?.toLowerCase() || "";
        const leadId = lead.lead_id?.toLowerCase() || "";

        return (
          name.includes(query) ||
          email.includes(query) ||
          phone.includes(query) ||
          organization.includes(query) ||
          leadId.includes(query)
        );
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((lead) => (lead.status || "").toLowerCase() === statusFilter.toLowerCase());
    }

    // Intent filter (OR logic - show if ANY selected intent matches)
    if (intentFilters.size > 0) {
      filtered = filtered.filter((lead) => {
        const intents = buildIntents(lead);
        // Check if lead has ANY of the selected intents
        return Array.from(intentFilters).some((selectedIntent) =>
          intents.includes(selectedIntent)
        );
      });
    }

    // Assigned rep filter
    if (assignedRepFilter !== "all") {
      if (assignedRepFilter === "unassigned") {
        filtered = filtered.filter((lead) => !lead.assigned_rep_id);
      } else {
        filtered = filtered.filter((lead) => lead.assigned_rep_id === assignedRepFilter);
      }
    }

    // Apply sorting
    if (sortBy === "submitted") {
      filtered.sort((a, b) => {
        const dateA = new Date(a.submission_date || a.created_at || 0).getTime();
        const dateB = new Date(b.submission_date || b.created_at || 0).getTime();
        return dateB - dateA; // Newest first
      });
    } else {
      // Default: updated (uses updated_at)
      filtered.sort((a, b) => {
        const dateA = new Date(a.updated_at || 0).getTime();
        const dateB = new Date(b.updated_at || 0).getTime();
        return dateB - dateA; // Newest first
      });
    }

    return filtered;
  }, [leadsWithRepNames, searchQuery, statusFilter, intentFilters, assignedRepFilter, sortBy]);

  const focusFilteredLeads = useMemo(() => {
    return filteredLeads.filter((lead) => matchesFocusTab(lead, focusTab));
  }, [filteredLeads, focusTab]);

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setIntentFilters(new Set());
    setAssignedRepFilter("all");
    setSortBy("updated");
  }

  const hasActiveFilters = searchQuery || statusFilter !== "all" || intentFilters.size > 0 || assignedRepFilter !== "all";

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const FocusTabs = () => {
    const tabs: Array<{ value: FocusTab; label: string }> = [
      { value: "needs_action", label: "Needs Action" },
      { value: "unassigned", label: "Unassigned" },
      { value: "in_progress", label: "In Progress" },
      { value: "in_production", label: "In Production" },
    ];

    return (
      <div data-tour="leads-focus-tabs" className="flex w-full gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setFocusTab(tab.value)}
            className={[
              "whitespace-nowrap rounded-full border px-3 py-2 text-sm min-h-[44px]",
              focusTab === tab.value ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted/50",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  };

  function openAssignForLead(leadKey: string) {
    setAssignOpenLeadKey((prev) => (prev === leadKey ? null : leadKey));
    setAssignSelectedRepId("");
  }

  function handleAssignRep(leadDbId: string, repId: string) {
    startAssignTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadDbId);
      formData.set("repId", repId);
      const result = await assignRepAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Lead assigned");
      setAssignOpenLeadKey(null);
      router.refresh();
    });
  }

  function handleAssignToMe(leadDbId: string) {
    startAssignTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", leadDbId);
      const result = await assignToMeAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Lead assigned to you");
      router.refresh();
    });
  }

  const LeadCardRow = ({ lead }: { lead: DisplayLead }) => {
    const leadKey = String(lead.id || lead.lead_id);
    const nextAction = getNextActionLabel(lead);
    const intents = buildIntents(lead);
    const primaryIntent = intents[0] || null;
    const companyLabel = (lead.organization && lead.organization.trim()) ? lead.organization : (lead.lead_id || "—");

    const canAssignToMe = !isCeoOrAdmin && !!currentUserId && !lead.assigned_rep_id && isUuid(lead.id);
    const canAssignAsAdmin = !!isCeoOrAdmin && !lead.assigned_rep_id && isUuid(lead.id);

    return (
      <Card className="transition-colors hover:bg-muted/30">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold leading-tight truncate">
                  {lead.name || lead.customer_name || "—"}
                </h3>
                {primaryIntent && (
                  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-background">
                    {primaryIntent}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground truncate">{companyLabel}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", nextActionPillClass(nextAction)].join(" ")}>
                  {nextAction}
                </span>
                <span className="text-xs text-muted-foreground">
                  Submitted {formatDate(lead.submission_date || lead.created_at || "")}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <Button asChild className="min-h-[44px]" data-tour="lead-open">
                <Link href={`/leads/${lead.lead_id || lead.id}`}>Open</Link>
              </Button>

              {!lead.assigned_rep_id && (
                <>
                  {canAssignToMe && (
                    <Button
                      variant="outline"
                      className="min-h-[44px]"
                      disabled={isAssignPending}
                      onClick={() => handleAssignToMe(lead.id as string)}
                    >
                      {isAssignPending ? "Assigning..." : "Assign to Me"}
                    </Button>
                  )}
                  {canAssignAsAdmin && (
                    <Button
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => openAssignForLead(leadKey)}
                      disabled={isAssignPending}
                    >
                      Assign
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {canAssignAsAdmin && assignOpenLeadKey === leadKey && (
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select value={assignSelectedRepId} onValueChange={setAssignSelectedRepId}>
                  <SelectTrigger className="min-h-[44px] w-full">
                    <SelectValue placeholder="Select rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {reps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.name || rep.email || rep.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="min-h-[44px]"
                disabled={!assignSelectedRepId || isAssignPending}
                onClick={() => handleAssignRep(lead.id as string, assignSelectedRepId)}
              >
                {isAssignPending ? "Assigning..." : "Assign"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <FocusTabs />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            Advanced Filters
          </Button>
          <Button
            type="button"
            variant={viewMode === "cards" ? "default" : "outline"}
            className="min-h-[44px] gap-2"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
            Card View
          </Button>
          <Button
            type="button"
            variant={viewMode === "table" ? "default" : "outline"}
            className="min-h-[44px] gap-2"
            onClick={() => setViewMode("table")}
          >
            <List className="h-4 w-4" />
            Table View
          </Button>
        </div>
        {hasActiveFilters && (
          <Button type="button" variant="ghost" className="min-h-[44px] gap-2 justify-start" onClick={clearFilters}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {advancedOpen && (
        <Card>
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Search</Label>
                <Input
                  type="search"
                  placeholder="Search by name, email, phone, org, or lead ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="min-h-[44px] mt-2"
                />
              </div>

              <div>
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="min-h-[44px] mt-2">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Rep</Label>
                <Select value={assignedRepFilter} onValueChange={setAssignedRepFilter} disabled={reps.length === 0}>
                  <SelectTrigger className="min-h-[44px] mt-2">
                    <SelectValue placeholder="All reps" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Reps</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {reps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {rep.name || rep.email || rep.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Sort</Label>
                <Select value={sortBy} onValueChange={(value: "updated" | "submitted") => setSortBy(value)}>
                  <SelectTrigger className="min-h-[44px] mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated">Updated</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Intent</Label>
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {["Quote", "Booking", "Question"].map((intent) => (
                  <div key={intent} className="flex items-center gap-2">
                    <Checkbox
                      id={`intent-${intent}`}
                      checked={intentFilters.has(intent)}
                      onCheckedChange={() => toggleIntentFilter(intent)}
                    />
                    <Label htmlFor={`intent-${intent}`} className="font-normal cursor-pointer">
                      {intent}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {focusFilteredLeads.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {hasActiveFilters ? "No leads found matching your filters." : "No leads yet."}
            </CardContent>
          </Card>
        ) : (
          <>
            {viewMode === "cards" ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {focusFilteredLeads.map((lead) => (
                  <LeadCardRow key={lead.id || lead.lead_id} lead={lead} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Next</TableHead>
                        <TableHead>Rep</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {focusFilteredLeads.map((lead) => {
                        const nextAction = getNextActionLabel(lead);
                        const repName = lead.assigned_rep_name || getRepName(lead, reps) || "—";
                        const companyLabel = (lead.organization && lead.organization.trim()) ? lead.organization : (lead.lead_id || "—");
                        return (
                          <TableRow key={lead.id || lead.lead_id}>
                            <TableCell className="font-medium">
                              <div className="max-w-[260px] truncate">{lead.name || lead.customer_name || "—"}</div>
                              <div className="text-xs text-muted-foreground max-w-[260px] truncate">{lead.email || lead.phone || ""}</div>
                            </TableCell>
                            <TableCell className="max-w-[240px] truncate">{companyLabel}</TableCell>
                            <TableCell>
                              <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", nextActionPillClass(nextAction)].join(" ")}>
                                {nextAction}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate">{repName}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatDate(lead.submission_date || lead.created_at || "")}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild className="min-h-[36px]" size="sm">
                                <Link href={`/leads/${lead.lead_id || lead.id}`}>Open</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
