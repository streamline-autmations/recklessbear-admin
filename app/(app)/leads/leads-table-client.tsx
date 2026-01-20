"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
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
import Link from "next/link";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/status-badge";
import { X } from "lucide-react";

import type { Lead } from '@/types/leads';

interface DisplayLead extends Lead {
  id?: string;
  lead_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  lead_type?: string | null;
  source?: string | null;
  assigned_rep_id?: string | null;
  assigned_rep_name?: string | null;
  created_at?: string | null;
  submission_date?: string | null;
}

interface Rep {
  user_id: string;
  full_name: string | null;
}

interface LeadsTableClientProps {
  initialLeads: DisplayLead[];
  reps: Rep[];
  currentUserId?: string | null;
}

export function LeadsTableClient({ initialLeads, reps, currentUserId }: LeadsTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [leadTypeFilter, setLeadTypeFilter] = useState<string>("all");
  const [assignedRepFilter, setAssignedRepFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"created" | "updated" | "status">("updated");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  // Get unique values for filters
  const statuses = useMemo(() => {
    const unique = new Set(initialLeads.map((lead) => lead.status || "").filter(Boolean));
    return Array.from(unique).sort();
  }, [initialLeads]);

  const leadTypes = useMemo(() => {
    const unique = new Set<string>();
    initialLeads.forEach((lead) => {
      // Get types from intents array
      if (lead.intents && lead.intents.length > 0) {
        lead.intents.forEach(intent => unique.add(intent));
      }
      // Also include lead_type if exists
      if (lead.lead_type) {
        unique.add(lead.lead_type);
      }
    });
    return Array.from(unique).sort();
  }, [initialLeads]);

  const sources = useMemo(() => {
    const unique = new Set(initialLeads.map((lead) => lead.source || "").filter(Boolean));
    return Array.from(unique).sort();
  }, [initialLeads]);

  // Client-side filtering
  const filteredLeads = useMemo(() => {
    let filtered = initialLeads;

      // Search filter (name, email, phone, org, lead_id)
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

    // Lead type/Intent filter
    if (leadTypeFilter !== "all") {
      filtered = filtered.filter((lead) => {
        // Check intents array first
        if (lead.intents && lead.intents.length > 0) {
          return lead.intents.some(intent => 
            intent.toLowerCase() === leadTypeFilter.toLowerCase()
          );
        }
        // Fallback to lead_type
        return (lead.lead_type || "").toLowerCase() === leadTypeFilter.toLowerCase();
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

    // Source filter
    if (sourceFilter !== "all") {
      filtered = filtered.filter((lead) => (lead.source || "").toLowerCase() === sourceFilter.toLowerCase());
    }

    // Apply sorting
    if (sortBy === "created") {
      filtered.sort((a, b) => {
        const dateA = new Date(a.created_at || a.submission_date || 0).getTime();
        const dateB = new Date(b.created_at || b.submission_date || 0).getTime();
        return dateB - dateA; // Newest first
      });
    } else if (sortBy === "status") {
      filtered.sort((a, b) => {
        const statusA = (a.status || "").toLowerCase();
        const statusB = (b.status || "").toLowerCase();
        return statusA.localeCompare(statusB);
      });
    } else {
      // Default: updated (latest first)
      filtered.sort((a, b) => {
        const dateA = new Date(a.updated_at || a.last_activity_at || a.created_at || a.submission_date || 0).getTime();
        const dateB = new Date(b.updated_at || b.last_activity_at || b.created_at || b.submission_date || 0).getTime();
        return dateB - dateA; // Newest first
      });
    }

    return filtered;
  }, [initialLeads, searchQuery, statusFilter, leadTypeFilter, assignedRepFilter, sourceFilter, sortBy]);

  // Filter presets
  const applyPreset = (preset: string) => {
    setActivePreset(preset);
    if (preset === "my-leads") {
      // This would need current user ID - for now, clear other filters
      setStatusFilter("all");
      setLeadTypeFilter("all");
      setSourceFilter("all");
      setAssignedRepFilter("all");
    } else if (preset === "unassigned") {
      setAssignedRepFilter("unassigned");
      setStatusFilter("all");
      setLeadTypeFilter("all");
      setSourceFilter("all");
    } else if (preset === "new-today") {
      // Filter by created today
      setStatusFilter("New");
      setLeadTypeFilter("all");
      setSourceFilter("all");
      setAssignedRepFilter("all");
    } else if (preset === "needs-follow-up") {
      // This will be handled in the filtering logic - leads updated more than 48h ago and not completed
      setStatusFilter("all");
      setLeadTypeFilter("all");
      setSourceFilter("all");
      setAssignedRepFilter("all");
    }
  };

  // Apply needs-follow-up filter in the filteredLeads logic
  const filteredWithPresets = useMemo(() => {
    let result = filteredLeads;
    
    if (activePreset === "my-leads") {
      if (currentUserId) {
        result = result.filter((lead) => lead.assigned_rep_id === currentUserId);
      }
    } else if (activePreset === "new-today") {
      const today = new Date().toDateString();
      result = result.filter((lead) => {
        const createdDate = new Date(lead.created_at || lead.submission_date || 0).toDateString();
        return createdDate === today && (lead.status || "").toLowerCase() === "new";
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
    setLeadTypeFilter("all");
    setAssignedRepFilter("all");
    setSourceFilter("all");
    setSortBy("updated");
    setActivePreset(null);
  }

  const hasActiveFilters = searchQuery || statusFilter !== "all" || leadTypeFilter !== "all" || assignedRepFilter !== "all" || sourceFilter !== "all";

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
      
      // For older dates, show formatted date
      return formatDate(dateString);
    } catch {
      return dateString;
    }
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
          variant={activePreset === "needs-follow-up" ? "default" : "outline"}
          size="sm"
          onClick={() => applyPreset("needs-follow-up")}
          className="min-h-[36px] text-xs sm:text-sm"
        >
          Needs Follow-up
        </Button>
      </div>

      <div className="flex flex-col gap-3">
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
          {leadTypes.length > 0 && (
            <Select value={leadTypeFilter} onValueChange={setLeadTypeFilter}>
              <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
                <SelectValue placeholder="Lead Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {leadTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {reps.length > 0 && (
            <Select value={assignedRepFilter} onValueChange={setAssignedRepFilter}>
              <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
                <SelectValue placeholder="Assigned Rep" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reps</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {reps.map((rep) => (
                  <SelectItem key={rep.user_id} value={rep.user_id}>
                    {rep.full_name || rep.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {sources.length > 0 && (
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sortBy} onValueChange={(value: "created" | "updated" | "status") => setSortBy(value)}>
            <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Latest Updated</SelectItem>
              <SelectItem value="created">Latest Created</SelectItem>
              <SelectItem value="status">Status</SelectItem>
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

      {/* Responsive table wrapper - horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <div className="inline-block min-w-full align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Lead Type</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Assigned Rep</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWithPresets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                      // Only navigate if clicking on the row, not on buttons/links
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
                      {lead.name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {lead.intents && lead.intents.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {lead.intents.map((intent) => (
                            <span
                              key={intent}
                              className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium"
                            >
                              {intent}
                            </span>
                          ))}
                        </div>
                      ) : lead.lead_type ? (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                          {lead.lead_type}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <StatusBadge 
                        status={
                          ((lead.status || "new")?.toLowerCase().replace(/\s+/g, "_") || "new") as 
                          "new" | "assigned" | "contacted" | "quote_sent" | "quote_approved" | "in_production" | "completed" | "lost"
                        } 
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {lead.assigned_rep_name || lead.assigned_rep_id || <span className="text-muted-foreground">—</span>}
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
                        <Link href={`/leads/${lead.lead_id}`} onClick={(e) => e.stopPropagation()}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
