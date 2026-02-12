export type StockMovementType = "consumed" | "restocked" | "audit";
export type StockTransactionType = "purchase_order" | "production_deduction" | "adjustment" | "return" | "initial_balance";

export interface MaterialInventory {
  id: string;
  name: string;
  unit: string;
  qty_on_hand: number;
  minimum_level: number;
  restock_threshold: number;
  supplier: string | null;
  updated_at: string;
  is_low_stock?: boolean;
  needs_restock?: boolean;
}

export interface ProductMaterialUsage {
  id: string;
  product_type: string;
  size: string | null;
  material_id: string;
  qty_per_unit: number;
  last_modified: string;
  last_modified_by: string | null;
  material?: Pick<MaterialInventory, "id" | "name" | "unit"> | null;
}

export interface StockMovement {
  id: string;
  material_id: string;
  delta_qty: number;
  type: StockMovementType;
  reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  material?: { name: string; unit: string } | null;
}

export interface StockTransaction {
  id: string;
  type: StockTransactionType;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export interface StockTransactionLineItem {
  id: string;
  transaction_id: string;
  material_id: string;
  delta_qty: number;
  material?: { name: string; unit: string } | null;
}

export const PRODUCTION_STAGES = [
  "orders_awaiting_confirmation",
  "no_invoice_number",
  "orders",
  "supplier_orders",
  "layouts_busy_colline",
  "layouts_busy_elzana",
  "awaiting_color_match",
  "layouts_done_awaiting_approval",
  "layouts_received",
  "printing",
  "pressing",
  "cmt",
  "cleaning_packing",
  "completed",
  "full_payment_before_collection",
  "full_payment_before_delivery",
  "ready_for_delivery_collection",
  "out_for_delivery",
  "delivered_collected",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];
