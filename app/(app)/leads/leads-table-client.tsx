"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/status-badge";
import { X, Filter, ChevronRight, MessageCircle, UserPlus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { assignRepAction, changeStatusAction } from "./[id]/actions";

import type { Lead } from '@/types/leads';

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

export function LeadsTableClient({ initialLeads, reps, currentUserId }: LeadsTableClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [intentFilters, setIntentFilters] = useState<Set<string>>(new Set());
  const [assignedRepFilter, setAssignedRepFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "created" | "name">("updated");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [repSelectionByLead, setRepSelectionByLead] = useState<Record<string, string>>({});

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
          router.refresh();
        }
      )
      .subscribe((status) => {
        console.log('[realtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

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
    if (sortBy === "created") {
      filtered.sort((a, b) => {
        const dateA = new Date(a.submission_date || a.created_at || 0).getTime();
        const dateB = new Date(b.submission_date || b.created_at || 0).getTime();
        return dateB - dateA; // Newest first
      });
    } else if (sortBy === "name") {
      filtered.sort((a, b) => {
        const nameA = (a.name || a.customer_name || "").toLowerCase();
        const nameB = (b.name || b.customer_name || "").toLowerCase();
        return nameA.localeCompare(nameB);
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

  // Filter presets
  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    if (preset === "my-leads") {
      setStatusFilter("all");
      setIntentFilters(new Set());
      setAssignedRepFilter("all");
    } else if (preset === "unassigned") {
      setAssignedRepFilter("unassigned");
      setStatusFilter("all");
      setIntentFilters(new Set());
    } else if (preset === "new-today") {
      setStatusFilter("New");
      setIntentFilters(new Set());
      setAssignedRepFilter("all");
    } else if (preset === "new-week") {
      setStatusFilter("New");
      setIntentFilters(new Set());
      setAssignedRepFilter("all");
    } else if (preset === "needs-follow-up") {
      setStatusFilter("all");
      setIntentFilters(new Set());
      setAssignedRepFilter("all");
    }
  };

  useEffect(() => {
    const preset = searchParams.get("preset");
    if (!preset) return;
    applyPreset(preset);
  }, [searchParams]);

  // Apply needs-follow-up filter
  const filteredWithPresets = useMemo(() => {
    let result = filteredLeads;
    
    if (activePreset === "my-leads") {
      if (currentUserId) {
        result = result.filter((lead) => lead.assigned_rep_id === currentUserId);
      }
    } else if (activePreset === "new-today") {
      const today = new Date().toDateString();
      result = result.filter((lead) => {
        const createdDate = new Date(lead.submission_date || lead.created_at || 0).toDateString();
        return createdDate === today && (lead.status || "").toLowerCase() === "new";
      });
    } else if (activePreset === "new-week") {
      const now = new Date().getTime();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((lead) => {
        const createdAt = new Date(lead.submission_date || lead.created_at || 0).getTime();
        return createdAt >= sevenDaysAgo && (lead.status || "").toLowerCase() === "new";
      });
    } else if (activePreset === "needs-follow-up") {
      const now = new Date().getTime();
      const fortyEightHoursAgo = now - (48 * 60 * 60 * 1000);
      result = result.filter((lead) => {
        const updatedAt = new Date(lead.updated_at || lead.last_activity_at || lead.created_at || lead.submission_date || 0).getTime();
        const status = (lead.status || "").toLowerCase();
        const isStale = updatedAt < fortyEightHoursAgo;
        const isNotCompleted = !["completed", "delivered", "lost"].includes(status);
        return isStale && isNotCompleted;
      });
    }
    
    return result;
  }, [filteredLeads, activePreset, currentUserId]);

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setIntentFilters(new Set());
    setAssignedRepFilter("all");
    setSortBy("updated");
    setActivePreset(null);
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

  const formatRelativeTime = (dateString: string | null | undefined) => {
    if (!dateString) return "—";
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      
      return formatDate(dateString);
    } catch {
      return dateString;
    }
  };

  const openWhatsApp = (phone?: string | null) => {
    if (!phone) return;
    const digits = String(phone).replace(/[^+\d]/g, "");
    window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
  };

  const approveQuote = async (leadDbId: string) => {
    const fd = new FormData();
    fd.append("leadId", leadDbId);
    fd.append("status", "Quote Approved");
    const res = await changeStatusAction(fd);
    if (res && "error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success("Quote approved");
    router.refresh();
  };

  const assignRep = async (leadDbId: string, repId: string) => {
    const fd = new FormData();
    fd.append("leadId", leadDbId);
    fd.append("repId", repId);
    const res = await assignRepAction(fd);
    if (res && "error" in res) {
      toast.error(res.error);
      return;
    }
    toast.success("Rep assigned");
    router.refresh();
  };

  // Mobile filters component
  const MobileFilters = () => (
    <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="sm:hidden min-h-[44px] gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {/* Status Filter */}
          <div className="space-y-3">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
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

          {/* Intent Filters */}
          <div className="space-y-3">
            <Label>Intents</Label>
            <div className="space-y-2">
              {["Quote", "Booking", "Question"].map((intent) => (
                <div key={intent} className="flex items-center space-x-2">
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

          {/* Assigned Rep Filter */}
          {reps.length > 0 && (
            <div className="space-y-3">
              <Label>Assigned Rep</Label>
              <Select value={assignedRepFilter} onValueChange={setAssignedRepFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Reps" />
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
          )}

          {/* Sort */}
          <div className="space-y-3">
            <Label>Sort by</Label>
            <Select value={sortBy} onValueChange={(value: "updated" | "created" | "name") => setSortBy(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Updated</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters} className="w-full">
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );

  // Intent chips component
  const IntentChips = ({ lead }: { lead: DisplayLead }) => {
    const intents = buildIntents(lead);
    if (intents.length === 0) return <span className="text-muted-foreground">—</span>;
    
    return (
      <div className="flex flex-wrap gap-1.5">
        {intents.map((intent) => (
          <span
            key={intent}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background/40 px-2.5 py-1 text-xs font-medium"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {intent}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter Presets */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activePreset === "my-leads" ? "default" : "outline"}
          size="sm"
          onClick={() => applyPreset("my-leads")}
          className="min-h-[36px] text-xs sm:text-sm"
        >
          My Leads
        </Button>
        <Button
          variant={activePreset === "unassigned" ? "default" : "outline"}
          size="sm"
          onClick={() => applyPreset("unassigned")}
          className="min-h-[36px] text-xs sm:text-sm"
        >
          Unassigned
        </Button>
        <Button
          variant={activePreset === "new-today" ? "default" : "outline"}
          size="sm"
          onClick={() => applyPreset("new-today")}
          className="min-h-[36px] text-xs sm:text-sm"
        >
          New Today
        </Button>
        <Button
          variant={activePreset === "new-week" ? "default" : "outline"}
          size="sm"
          onClick={() => applyPreset("new-week")}
          className="min-h-[36px] text-xs sm:text-sm"
        >
          New This Week
        </Button>
        <Button
          variant={activePreset === "needs-follow-up" ? "default" : "outline"}
          size="sm"
          onClick={() => applyPreset("needs-follow-up")}
          className="min-h-[36px] text-xs sm:text-sm"
        >
          Needs Follow-up
        </Button>
      </div>

      {/* Desktop Filters */}
      <div className="hidden sm:flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Input
            type="search"
            placeholder="Search by name, email, phone, org, or lead ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-[44px] flex-1 min-w-[200px]"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
              <SelectValue placeholder="Status" />
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
          
          {/* Intent Filters - Desktop */}
          <div className="flex items-center gap-3 min-h-[44px] px-3 border rounded-md bg-background">
            <Label className="text-sm font-medium whitespace-nowrap">Intents:</Label>
            <div className="flex gap-3">
              {["Quote", "Booking", "Question"].map((intent) => (
                <div key={intent} className="flex items-center space-x-2">
                  <Checkbox
                    id={`desktop-intent-${intent}`}
                    checked={intentFilters.has(intent)}
                    onCheckedChange={() => toggleIntentFilter(intent)}
                  />
                  <Label htmlFor={`desktop-intent-${intent}`} className="text-sm font-normal cursor-pointer whitespace-nowrap">
                    {intent}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {reps.length > 0 && (
            <Select value={assignedRepFilter} onValueChange={setAssignedRepFilter}>
              <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
                <SelectValue placeholder="Assigned Rep" />
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
          )}
          
          <Select value={sortBy} onValueChange={(value: "updated" | "created" | "name") => setSortBy(value)}>
            <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
              <SelectValue placeholder="Sort by:" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
          
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={clearFilters}
              className="min-h-[44px] gap-2"
            >
              <X className="h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Filters */}
      <div className="sm:hidden flex gap-2">
        <Input
          type="search"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-h-[44px] flex-1"
        />
        <MobileFilters />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {filteredWithPresets.length} lead{filteredWithPresets.length !== 1 ? "s" : ""}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={viewMode === "cards" ? "default" : "outline"}
            size="sm"
            className="min-h-[36px]"
            onClick={() => setViewMode("cards")}
          >
            Cards
          </Button>
          <Button
            type="button"
            variant={viewMode === "table" ? "default" : "outline"}
            size="sm"
            className="min-h-[36px]"
            onClick={() => setViewMode("table")}
          >
            Table
          </Button>
        </div>
      </div>

      <div className={viewMode === "cards" ? "hidden md:grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "hidden"}>
        {filteredWithPresets.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
            <CardContent className="py-10 text-center text-muted-foreground">
              {hasActiveFilters || activePreset ? "No leads found matching your filters." : "No leads yet."}
            </CardContent>
          </Card>
        ) : (
          filteredWithPresets.map((lead) => {
            const id = String(lead.id || lead.lead_id);
            const repPick = repSelectionByLead[id] ?? lead.assigned_rep_id ?? "unassigned";
            const leadHref = `/leads/${lead.lead_id || lead.id}`;
            return (
              <Card key={id} className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-semibold truncate">{lead.name || lead.customer_name || "—"}</div>
                      {lead.organization ? (
                        <div className="text-sm text-muted-foreground truncate">{lead.organization}</div>
                      ) : null}
                      <div className="mt-1 text-xs text-muted-foreground font-mono">{lead.lead_id}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge
                        status={
                          ((lead.status || "new")?.toLowerCase().replace(/\s+/g, "_") || "new") as
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
                      <Button asChild variant="ghost" size="sm" className="min-h-[36px]">
                        <Link href={leadHref}>
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <IntentChips lead={lead} />
                  </div>

                  <div className="grid gap-2 rounded-lg border p-3 bg-background/50">
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Assigned rep</div>
                      <div className="font-medium truncate">{lead.assigned_rep_name || "Unassigned"}</div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Submitted</div>
                      <div className="font-medium">{formatDate(lead.submission_date || lead.created_at || "")}</div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Updated</div>
                      <div className="font-medium">
                        {formatRelativeTime(lead.updated_at || lead.last_activity_at || lead.created_at || lead.submission_date)}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={repPick}
                        onValueChange={(v) => setRepSelectionByLead((prev) => ({ ...prev, [id]: v }))}
                      >
                        <SelectTrigger className="min-h-[44px]">
                          <SelectValue placeholder="Assign rep" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {reps.map((rep) => (
                            <SelectItem key={rep.id} value={rep.id}>
                              {rep.name || rep.email || rep.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-[44px] gap-2"
                        onClick={() => {
                          if (!lead.id) {
                            toast.error("Lead not available");
                            return;
                          }
                          if (repPick === "unassigned") {
                            toast.error("Pick a rep");
                            return;
                          }
                          void assignRep(String(lead.id), repPick);
                        }}
                      >
                        <UserPlus className="h-4 w-4" />
                        Assign
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="default"
                        className="min-h-[44px] gap-2"
                        onClick={() => {
                          if (!lead.id) {
                            toast.error("Lead not available");
                            return;
                          }
                          void approveQuote(String(lead.id));
                        }}
                        disabled={(lead.status || "").toLowerCase() === "quote approved"}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve quote
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-[44px] gap-2"
                        onClick={() => openWhatsApp(lead.phone)}
                        disabled={!lead.phone}
                      >
                        <MessageCircle className="h-4 w-4" />
                        WhatsApp
                      </Button>
                    </div>

                    <Button asChild variant="outline" className="min-h-[44px]">
                      <Link href={leadHref}>View details</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop Table View */}
      <div className={viewMode === "table" ? "hidden md:block overflow-x-auto -mx-4 md:mx-0" : "hidden"}>
        <div className="inline-block min-w-full align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Intents</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Date Submitted</TableHead>
                <TableHead className="hidden lg:table-cell">Assigned Rep</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWithPresets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {hasActiveFilters || activePreset
                      ? "No leads found matching your filters."
                      : "No leads yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredWithPresets.map((lead) => (
                  <TableRow 
                    key={lead.id || lead.lead_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (!target.closest('a') && !target.closest('button')) {
                        router.push(`/leads/${lead.lead_id || lead.id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <Link
                        href={`/leads/${lead.lead_id || lead.id}`}
                        className="font-medium text-primary hover:underline min-h-[44px] flex items-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.lead_id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {lead.name || lead.customer_name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <IntentChips lead={lead} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge 
                        status={
                          ((lead.status || "new")?.toLowerCase().replace(/\s+/g, "_") || "new") as 
                          "new" | "assigned" | "contacted" | "quote_sent" | "quote_approved" | "in_production" | "completed" | "lost"
                        } 
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(lead.submission_date || lead.created_at || "")}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {lead.assigned_rep_name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatRelativeTime(lead.updated_at || lead.last_activity_at || lead.created_at || lead.submission_date)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/leads/${lead.lead_id || lead.id}`} onClick={(e) => e.stopPropagation()}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-3">
        {filteredWithPresets.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {hasActiveFilters || activePreset
                ? "No leads found matching your filters."
                : "No leads yet."}
            </CardContent>
          </Card>
        ) : (
          filteredWithPresets.map((lead) => (
            <Card 
              key={lead.id || lead.lead_id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => router.push(`/leads/${lead.lead_id || lead.id}`)}
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-base truncate">
                        {lead.name || lead.customer_name || "—"}
                      </h3>
                      {lead.organization && (
                        <p className="text-sm text-muted-foreground truncate">{lead.organization}</p>
                      )}
                    </div>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/leads/${lead.lead_id || lead.id}`} onClick={(e) => e.stopPropagation()}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{lead.lead_id}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <IntentChips lead={lead} />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <StatusBadge 
                      status={
                        ((lead.status || "new")?.toLowerCase().replace(/\s+/g, "_") || "new") as 
                        "new" | "assigned" | "contacted" | "quote_sent" | "quote_approved" | "in_production" | "completed" | "lost"
                      } 
                    />
                    <div className="text-xs text-muted-foreground">
                      {lead.assigned_rep_name || <span>Unassigned</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Submitted {formatDate(lead.submission_date || lead.created_at || "")}</span>
                    <span>Updated {formatRelativeTime(lead.updated_at || lead.last_activity_at || lead.created_at || lead.submission_date)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
