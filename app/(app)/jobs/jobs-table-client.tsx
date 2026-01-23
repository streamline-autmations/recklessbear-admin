"use client";

import { useState, useMemo, useEffect } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { X, Filter, ChevronRight, ExternalLink } from "lucide-react";

import type { Lead } from '@/types/leads';

interface DisplayLead extends Lead {
  id?: string;
  lead_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  sales_status?: string | null;
  production_stage?: string | null;
  assigned_rep_id?: string | null;
  assigned_rep_name?: string | null;
  created_at?: string | null;
  submission_date?: string | null;
  updated_at?: string | null;
  last_activity_at?: string | null;
  organization?: string | null;
  card_id?: string | null;
}

interface Rep {
  id: string;
  name: string | null;
  email?: string | null;
}

interface JobsTableClientProps {
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

export function JobsTableClient({ initialLeads, reps }: JobsTableClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [assignedRepFilter, setAssignedRepFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "created" | "name">("updated");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
      .channel('jobs-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
        },
        (payload) => {
          console.log('[realtime] Job changed:', payload.eventType, payload.new || payload.old);
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

  // Get unique production stages for filters
  const stages = useMemo(() => {
    const unique = new Set(initialLeads.map((lead) => lead.production_stage || "Orders Awaiting Confirmation").filter(Boolean));
    return Array.from(unique).sort();
  }, [initialLeads]);

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

    // Stage filter
    if (stageFilter !== "all") {
      filtered = filtered.filter((lead) => (lead.production_stage || "Orders Awaiting Confirmation") === stageFilter);
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
  }, [leadsWithRepNames, searchQuery, stageFilter, assignedRepFilter, sortBy]);

  function clearFilters() {
    setSearchQuery("");
    setStageFilter("all");
    setAssignedRepFilter("all");
    setSortBy("updated");
  }

  const hasActiveFilters = searchQuery || stageFilter !== "all" || assignedRepFilter !== "all";

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
          {/* Stage Filter */}
          <div className="space-y-3">
            <Label>Production Stage</Label>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {stage}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

  return (
    <div className="space-y-4">
      {/* Desktop Filters */}
      <div className="hidden sm:flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Input
            type="search"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-[44px] flex-1 min-w-[200px]"
          />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="min-h-[44px] w-full sm:w-[200px]">
              <SelectValue placeholder="Production Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
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
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Filters */}
      <div className="sm:hidden flex gap-2">
        <Input
          type="search"
          placeholder="Search jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-h-[44px] flex-1"
        />
        <MobileFilters />
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto -mx-4 md:mx-0">
        <div className="inline-block min-w-full align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Production Stage</TableHead>
                <TableHead>Assigned Rep</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="text-right">Trello</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {hasActiveFilters
                      ? "No jobs found matching your filters."
                      : "No active jobs found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow 
                    key={lead.id || lead.lead_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (!target.closest('a') && !target.closest('button')) {
                        window.location.href = `/leads/${lead.lead_id}`;
                      }
                    }}
                  >
                    <TableCell>
                      <Link
                        href={`/leads/${lead.lead_id}`}
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
                      <span className="inline-flex items-center rounded-md bg-secondary text-secondary-foreground px-2 py-1 text-xs font-medium border border-border">
                        {lead.production_stage || "Orders Awaiting Confirmation"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {lead.assigned_rep_name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatRelativeTime(lead.updated_at || lead.last_activity_at || lead.created_at || lead.submission_date)}
                    </TableCell>
                    <TableCell className="text-right">
                      {lead.card_id ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="min-h-[36px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a href={`https://trello.com/c/${lead.card_id}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
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
        {filteredLeads.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {hasActiveFilters
                ? "No jobs found matching your filters."
                : "No active jobs found."}
            </CardContent>
          </Card>
        ) : (
          filteredLeads.map((lead) => (
            <Card 
              key={lead.id || lead.lead_id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => window.location.href = `/leads/${lead.lead_id}`}
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
                      <Link href={`/leads/${lead.lead_id}`} onClick={(e) => e.stopPropagation()}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{lead.lead_id}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="inline-flex items-center rounded-md bg-secondary text-secondary-foreground px-2 py-1 text-xs font-medium border border-border">
                      {lead.production_stage || "Orders Awaiting Confirmation"}
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {lead.assigned_rep_name || <span>Unassigned</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Updated {formatRelativeTime(lead.updated_at || lead.last_activity_at || lead.created_at || lead.submission_date)}</span>
                    {lead.card_id && (
                      <a 
                        href={`https://trello.com/c/${lead.card_id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Trello <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
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
