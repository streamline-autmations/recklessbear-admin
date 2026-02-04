 "use client";
 
 import { cn } from "@/lib/utils";
 
 function normalizePaymentStatus(status: string | null | undefined) {
   return (status || "").trim().toLowerCase();
 }
 
 function getPaymentTone(status: string | null | undefined) {
   const s = normalizePaymentStatus(status);
   if (!s) return "border-border bg-muted text-foreground";
 
   if (s.includes("paid")) return "border-green-500/30 bg-green-500/15 text-green-200";
   if (s.includes("partial")) return "border-amber-500/30 bg-amber-500/15 text-amber-200";
   if (s.includes("pending")) return "border-amber-500/30 bg-amber-500/15 text-amber-200";
   if (s.includes("overdue")) return "border-destructive/40 bg-destructive/15 text-destructive";
   if (s.includes("unpaid")) return "border-destructive/40 bg-destructive/15 text-destructive";
 
   return "border-border bg-muted text-foreground";
 }
 
 export function PaymentStatusChip({
   status,
   className,
 }: {
   status: string | null | undefined;
   className?: string;
 }) {
   return (
     <span
       className={cn(
         "inline-flex items-center rounded-full border px-3 py-[3px] text-[11px] font-semibold uppercase tracking-[0.18em]",
         getPaymentTone(status),
         className
       )}
     >
       {status || "—"}
     </span>
   );
 }
 
 export default PaymentStatusChip;
