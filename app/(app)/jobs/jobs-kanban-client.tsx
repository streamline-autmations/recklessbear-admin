 "use client";
 
 import { useEffect, useMemo, useRef, useState } from "react";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
 import { ExternalLink, MoveRight, RefreshCw, MessageCircle } from "lucide-react";
 import { getTrelloCardUrl } from "@/lib/trello";
 import { getJobPanelDataAction, moveJobToStageAction, syncJobFromTrelloAction, type JobPanelData } from "./actions";
 import Link from "next/link";
 import { toast } from "sonner";
import { ProductionStageChip } from "@/components/production-stage-chip";
import { PaymentStatusChip } from "@/components/payment-status-chip";
 import { useSearchParams } from "next/navigation";
 
 export type JobsListRow = {
   id: string;
   trello_card_id: string | null;
   trello_list_id: string | null;
   production_stage: string | null;
   sales_status: string | null;
   payment_status: string | null;
   updated_at: string | null;
   lead: Array<{
     id: string;
     lead_id: string;
     customer_name: string | null;
     name: string | null;
     organization: string | null;
     phone?: string | null;
    product_type?: string | null;
    trello_product_list?: string | null;
     assigned_rep_name?: string | null;
   }> | null;
 };
 
 interface JobsKanbanClientProps {
   jobs: JobsListRow[];
 }
 
 const PIPELINE: { label: string; keys: string[] }[] = [
   { label: "Orders Awaiting Confirmation", keys: ["orders_awaiting_confirmation"] },
   { label: "Layouts Busy", keys: ["layouts_busy_colline", "layouts_busy_elzana"] },
   { label: "Awaiting Color Match", keys: ["awaiting_color_match"] },
   { label: "Layouts Done (Awaiting Approval)", keys: ["layouts_done_awaiting_approval"] },
   { label: "Printing", keys: ["printing"] },
   { label: "Pressing", keys: ["pressing"] },
   { label: "CMT", keys: ["cmt"] },
   { label: "Cleaning & Packing", keys: ["cleaning_packing"] },
   { label: "Ready for Delivery / Collection", keys: ["ready_for_delivery_collection"] },
   { label: "Delivered / Collected", keys: ["delivered_collected"] },
 ];
 
function normalizeStageForPipeline(stage: string | null | undefined): string {
  const s = (stage || "").toLowerCase().trim();
  if (!s) return "orders_awaiting_confirmation";
  if (s === "layouts_busy") return "layouts_busy_colline";
  if (s === "layouts_received") return "layouts_done_awaiting_approval";
  if (s === "orders") return "orders_awaiting_confirmation";
  if (s === "supplier_orders") return "orders_awaiting_confirmation";
  if (s === "no_invoice_number") return "orders_awaiting_confirmation";
  if (s === "out_for_delivery") return "ready_for_delivery_collection";
  if (s === "completed") return "delivered_collected";
  if (s === "full_payment_before_collection") return "ready_for_delivery_collection";
  if (s === "full_payment_before_delivery") return "ready_for_delivery_collection";
  return s;
}

 export function JobsKanbanClient({ jobs }: JobsKanbanClientProps) {
   const [items, setItems] = useState<JobsListRow[]>(jobs);
   const [selected, setSelected] = useState<JobsListRow | null>(null);
   const [pendingMove, setPendingMove] = useState<string | null>(null);
   const [panelData, setPanelData] = useState<JobPanelData | null>(null);
   const [panelLoading, setPanelLoading] = useState(false);
  const searchParams = useSearchParams();
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
   const grouped = useMemo(() => {
     const g: Record<string, JobsListRow[]> = {};
     for (const col of PIPELINE) {
       for (const k of col.keys) g[k] = [];
     }
     for (const j of items) {
      const s = normalizeStageForPipeline(j.production_stage);
      if (g[s]) g[s].push(j);
     }
     return g;
   }, [items]);
 
   useEffect(() => {
     if (!selected) {
       setPanelData(null);
       setPanelLoading(false);
       return;
     }
 
     setPanelLoading(true);
     getJobPanelDataAction(selected.id)
       .then((res) => {
         if ("error" in res) {
           toast.error(res.error);
           setPanelData(null);
         } else {
           setPanelData(res);
         }
       })
       .catch(() => {
         toast.error("Failed to load job details");
         setPanelData(null);
       })
       .finally(() => setPanelLoading(false));
   }, [selected]);
 
  useEffect(() => {
    const stageParam = searchParams.get("stage");
    if (!stageParam) return;
    const key = normalizeStageForPipeline(stageParam);
    const target = columnRefs.current[key];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }
  }, [searchParams]);

   const onDragStart = (e: React.DragEvent, jobId: string) => {
     e.dataTransfer.setData("text/job-id", jobId);
   };
 
   const onDrop = async (e: React.DragEvent, stage: string) => {
     e.preventDefault();
     const jobId = e.dataTransfer.getData("text/job-id");
     if (!jobId) return;

     setPendingMove(jobId);
     const previous = items;
     setItems((prev) => prev.map((j) => (j.id === jobId ? { ...j, production_stage: stage } : j)));
     const result = await moveJobToStageAction(jobId, stage);
     if (result && "error" in result) {
       setItems(previous);
       toast.error(result.error);
     }
     setPendingMove(null);
   };
 
   const onDragOver = (e: React.DragEvent) => {
     e.preventDefault();
   };
 
   const openWhatsApp = (phone?: string | null) => {
     if (!phone) return;
     const digits = String(phone).replace(/[^+\d]/g, "");
     const url = `https://wa.me/${digits}`;
     window.open(url, "_blank", "noopener,noreferrer");
   };
 
   const getCurrentPipelineIndex = (stage: string | null | undefined) => {
     const s = normalizeStageForPipeline(stage);
     return PIPELINE.findIndex((p) => p.keys.includes(s));
   };
 
   const formatDateTime = (iso?: string | null) => {
     if (!iso) return "—";
     const d = new Date(iso);
     if (Number.isNaN(d.getTime())) return "—";
     return d.toLocaleString();
   };
 
   const getLastMovedAt = (history: JobPanelData["history"]) => {
     if (!history.length) return null;
     const current = history.findLast((h) => !h.exited_at && h.entered_at);
     if (current?.entered_at) return current.entered_at;
     const last = history.findLast((h) => h.entered_at);
     return last?.entered_at || null;
   };
 
   return (
     <div className="flex gap-4 overflow-x-auto pb-4">
       {PIPELINE.map((col) => {
         const count = col.keys.reduce((acc, k) => acc + (grouped[k]?.length || 0), 0);
         return (
           <div
             key={col.label}
            ref={(el) => {
              columnRefs.current[col.keys[0]] = el;
            }}
             className="min-w-[320px] w-[360px] flex-shrink-0 bg-secondary rounded-lg border"
             onDragOver={onDragOver}
             onDrop={(e) => onDrop(e, col.keys[0])}
           >
             <div className="flex items-center justify-between p-4 border-b">
               <div className="text-sm font-semibold">{col.label}</div>
               <Badge variant="outline">{count}</Badge>
             </div>
             <div className="max-h-[70vh] overflow-y-auto p-3 space-y-3">
               {col.keys.flatMap((k) => grouped[k] || []).map((job) => {
                 const lead = Array.isArray(job.lead) ? job.lead[0] : null;
                 const customer = lead?.customer_name || lead?.name || "Unknown";
                 const org = lead?.organization || "";
                 const productSummary =
                   lead?.product_type ||
                   (lead?.trello_product_list ? String(lead.trello_product_list).split(/\r?\n/)[0] : null) ||
                   "Custom order";
                 const trelloUrl = job.trello_card_id ? getTrelloCardUrl(job.trello_card_id) : null;
                 return (
                   <div
                     key={job.id}
                     draggable
                     onDragStart={(e) => onDragStart(e, job.id)}
                     onClick={() => setSelected(job)}
                     className="cursor-grab active:cursor-grabbing bg-background rounded-lg border shadow-sm hover:bg-muted/50 transition-colors"
                   >
                     <div className="p-3 space-y-2">
                       <div className="flex items-center justify-between">
                         <div className="font-semibold">{lead?.lead_id || job.id}</div>
                         <ProductionStageChip stage={job.production_stage} className="whitespace-nowrap" />
                       </div>
                       <div className="text-sm">
                         <div className="font-medium truncate">{customer}</div>
                         {org ? <div className="text-muted-foreground truncate">{org}</div> : null}
                         <div className="text-muted-foreground truncate">{productSummary}</div>
                       </div>
                       <div className="flex items-center justify-between text-xs text-muted-foreground">
                         <span>{lead?.assigned_rep_name || "Unassigned"}</span>
                         <span>{job.sales_status || "—"}</span>
                       </div>
                       <div className="flex items-center justify-between">
                         <PaymentStatusChip status={job.payment_status} className="whitespace-nowrap" />
                         {pendingMove === job.id ? (
                           <span className="text-xs text-muted-foreground">Moving…</span>
                         ) : null}
                         {trelloUrl ? (
                           <Button asChild variant="outline" size="sm" className="h-8 gap-2">
                             <a href={trelloUrl} target="_blank" rel="noopener noreferrer">
                               <ExternalLink className="h-4 w-4" />
                               Open
                             </a>
                           </Button>
                         ) : (
                           <span className="text-xs text-muted-foreground">No Trello</span>
                         )}
                       </div>
                     </div>
                   </div>
                 );
               })}
             </div>
           </div>
         );
       })}
 
       <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
         <SheetContent side="right" className="sm:max-w-lg">
           {selected ? (
             <>
               <SheetHeader>
                 <SheetTitle>
                   {panelData?.job.lead?.lead_id ||
                     (Array.isArray(selected.lead) ? selected.lead[0]?.lead_id : null) ||
                     selected.id}
                 </SheetTitle>
               </SheetHeader>
               <div className="mt-4 space-y-6">
                 {panelLoading ? (
                   <div className="text-sm text-muted-foreground">Loading…</div>
                 ) : panelData ? (
                   <>
                     <div className="grid gap-4">
                       <div className="grid gap-1">
                         <div className="text-xs text-muted-foreground">Customer</div>
                         <div className="text-base font-semibold">
                           {panelData.job.lead?.customer_name || panelData.job.lead?.name || "—"}
                         </div>
                         {panelData.job.lead?.organization ? (
                           <div className="text-sm text-muted-foreground">{panelData.job.lead.organization}</div>
                         ) : null}
                       </div>
 
                       <div className="flex flex-wrap gap-2">
                        <ProductionStageChip stage={panelData.job.production_stage} />
                        <PaymentStatusChip status={panelData.job.payment_status} />
                         {panelData.job.lead?.assigned_rep_id ? (
                           <Badge variant="outline">Assigned</Badge>
                         ) : (
                           <Badge variant="outline">Unassigned</Badge>
                         )}
                       </div>
 
                       <div className="grid gap-2 rounded-lg border p-3 bg-muted/20">
                         <div className="grid grid-cols-2 gap-3 text-sm">
                           <div>
                             <div className="text-xs text-muted-foreground">Created</div>
                             <div className="font-medium">{formatDateTime(panelData.job.created_at)}</div>
                           </div>
                           <div>
                             <div className="text-xs text-muted-foreground">Last moved</div>
                             <div className="font-medium">{formatDateTime(getLastMovedAt(panelData.history))}</div>
                           </div>
                         </div>
                       </div>
 
                       <div className="grid gap-2">
                         <div className="text-xs text-muted-foreground">Production timeline</div>
                         <div className="grid gap-2">
                           {PIPELINE.map((p, idx) => {
                             const currentIdx = getCurrentPipelineIndex(panelData.job.production_stage);
                             const isCurrent = idx === currentIdx;
                             const isDone = currentIdx >= 0 && idx < currentIdx;
                             return (
                               <div
                                 key={p.label}
                                 className={[
                                   "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                                   isCurrent ? "border-primary bg-primary/10" : "bg-background",
                                   isDone ? "opacity-70" : "",
                                 ].join(" ")}
                               >
                                 <div className="font-medium">{p.label}</div>
                                 {isCurrent ? <Badge>Current</Badge> : isDone ? <Badge variant="outline">Done</Badge> : null}
                               </div>
                             );
                           })}
                         </div>
                       </div>
 
                       <div className="grid gap-2">
                         <div className="text-xs text-muted-foreground">Product summary</div>
                         <div className="rounded-lg border p-3 bg-background">
                           <div className="font-medium">{panelData.job.lead?.product_type || "Custom order"}</div>
                           {panelData.job.lead?.trello_product_list ? (
                             <div className="mt-1 text-sm text-muted-foreground line-clamp-3 whitespace-pre-line">
                               {panelData.job.lead.trello_product_list}
                             </div>
                           ) : (
                             <div className="mt-1 text-sm text-muted-foreground">—</div>
                           )}
                         </div>
                       </div>
 
                       <div className="grid gap-2 rounded-lg border p-3 bg-muted/20">
                         <div className="text-xs text-muted-foreground">Contact</div>
                         <div className="grid gap-1 text-sm">
                           <div>{panelData.job.lead?.email || "—"}</div>
                           <div>{panelData.job.lead?.phone || "—"}</div>
                         </div>
                       </div>
                     </div>
                   </>
                 ) : (
                   <div className="text-sm text-muted-foreground">No details available.</div>
                 )}
 
                 <div className="flex flex-wrap gap-2">
                   <Button
                     variant="default"
                     className="min-h-[44px] gap-2"
                     onClick={async () => {
                       const stage = normalizeStageForPipeline(panelData?.job.production_stage || selected.production_stage);
                       const idx = PIPELINE.findIndex((p) => p.keys.includes(stage));
                       const nextStage = idx >= 0 && PIPELINE[idx + 1] ? PIPELINE[idx + 1].keys[0] : stage;
                       if (!nextStage) return;
                       setPendingMove(selected.id);
                       const previous = items;
                       setItems((prev) =>
                         prev.map((j) => (j.id === selected.id ? { ...j, production_stage: nextStage } : j))
                       );
                       const result = await moveJobToStageAction(selected.id, nextStage);
                       if (result && "error" in result) {
                         setItems(previous);
                         toast.error(result.error);
                       }
                       setPendingMove(null);
                     }}
                   >
                     <MoveRight className="h-4 w-4" />
                     Move to next
                   </Button>
                   <Button
                     variant="outline"
                     className="min-h-[44px] gap-2"
                     onClick={async () => {
                       const fd = new FormData();
                       fd.append("jobId", selected.id);
                       const res = await syncJobFromTrelloAction(fd);
                       if (res && "error" in res) toast.error(res.error);
                     }}
                   >
                     <RefreshCw className="h-4 w-4" />
                     Sync from Trello
                   </Button>
                   {(panelData?.job.lead?.phone || (Array.isArray(selected.lead) ? selected.lead[0]?.phone : null)) ? (
                     <Button
                       variant="outline"
                       className="min-h-[44px] gap-2"
                       onClick={() =>
                         openWhatsApp(
                           panelData?.job.lead?.phone ||
                             (Array.isArray(selected.lead) ? selected.lead[0]?.phone : null)
                         )
                       }
                     >
                       <MessageCircle className="h-4 w-4" />
                       Send WhatsApp
                     </Button>
                   ) : null}
                   {panelData?.job.trello_card_id ? (
                     <Button asChild variant="outline" className="min-h-[44px] gap-2">
                       <a
                         href={getTrelloCardUrl(panelData.job.trello_card_id)}
                         target="_blank"
                         rel="noopener noreferrer"
                       >
                         <ExternalLink className="h-4 w-4" />
                         Open Trello
                       </a>
                     </Button>
                   ) : null}
                   <Button asChild variant="outline" className="min-h-[44px] gap-2">
                     <Link href={`/jobs/${selected.id}`}>Open details</Link>
                   </Button>
                 </div>
               </div>
             </>
           ) : null}
         </SheetContent>
       </Sheet>
     </div>
   );
 }
