 "use client";
 
 import { cn } from "@/lib/utils";
 import { PRODUCTION_STAGES } from "@/types/stock";
 
 const stageClasses: Record<string, string> = {
   orders_awaiting_confirmation: "border-amber-500/30 bg-amber-500/15 text-amber-200",
   layouts_busy: "border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-200",
   layouts_busy_colline: "border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-200",
   layouts_busy_elzana: "border-fuchsia-500/30 bg-fuchsia-500/15 text-fuchsia-200",
   awaiting_color_match: "border-sky-500/30 bg-sky-500/15 text-sky-200",
   layouts_done_awaiting_approval: "border-indigo-500/30 bg-indigo-500/15 text-indigo-200",
   printing: "border-primary/40 bg-primary/15 text-primary",
   pressing: "border-emerald-500/30 bg-emerald-500/15 text-emerald-200",
   cmt: "border-teal-500/30 bg-teal-500/15 text-teal-200",
   cleaning_packing: "border-lime-500/30 bg-lime-500/15 text-lime-200",
   ready_for_delivery_collection: "border-orange-500/30 bg-orange-500/15 text-orange-200",
   delivered_collected: "border-green-500/30 bg-green-500/15 text-green-200",
 };
 
 function getStageLabel(stage: string | null | undefined) {
   if (!stage) return "—";
   const key = stage.toLowerCase();
  if (key === "layouts_busy_colline" || key === "layouts_busy_elzana" || key === "layouts_busy") {
    return "Layouts Busy";
  }
   return PRODUCTION_STAGES[key] || stage;
 }
 
 export function ProductionStageChip({
   stage,
   className,
 }: {
   stage: string | null | undefined;
   className?: string;
 }) {
   const key = (stage || "").toLowerCase();
   const tone = stageClasses[key] || "border-border bg-muted text-foreground";
 
   return (
     <span
       className={cn(
         "inline-flex items-center rounded-full border px-3 py-[3px] text-[11px] font-semibold uppercase tracking-[0.18em]",
         tone,
         className
       )}
     >
       {getStageLabel(stage)}
     </span>
   );
 }
 
 export default ProductionStageChip;
