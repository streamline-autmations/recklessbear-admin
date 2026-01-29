// New schema types (primary)
export interface Material {
  id: string;
  name: string;
  unit: string;
  quantity_in_stock: number;
  minimum_stock_level: number;
  restock_threshold: number;
  supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Computed
  is_low_stock?: boolean;
  needs_restock?: boolean;
  // Legacy field aliases for backward compatibility
  qty_on_hand?: number;
  minimum_level?: number;
  low_stock?: boolean;
}

export interface ProductMaterial {
  id: string;
  product_name: string;
  size: string;
  material_id: string | null;
  material_name: string;
  quantity_used: number;
  unit: string;
  material_2_id: string | null;
  material_2_name: string | null;
  quantity_used_2: number | null;
  created_at: string;
  // Joined
  material?: Material;
}

// Legacy type alias
export interface ProductMaterialUsage {
  id: string;
  product_type: string;
  size?: string | null;
  material_id: string;
  qty_per_unit: number;
  material?: Material;
  last_modified: string;
  last_modified_by: string | null;
}

export interface StockMovement {
  id: string;
  job_id?: string | null;
  order_name?: string | null;
  material_id: string | null;
  material_name: string;
  quantity_change: number;
  movement_type: 'consumed' | 'restocked' | 'adjustment';
  updated_by: string | null;
  notes: string | null;
  created_at: string;
  // Legacy fields
  delta_qty?: number;
  type?: 'consumed' | 'restocked' | 'audit';
  reference?: string | null;
  created_by?: string | null;
  // Joined
  material?: Material;
  actor_name?: string | null;
}

export interface Job {
  id: string;
  lead_id: string;
  trello_card_id: string | null;
  trello_card_url: string | null;
  production_stage: string;
  invoice_number: string | null;
  payment_status: string;
  order_deadline: string | null;
  order_quantity: number | null;
  product_list: JobItem[] | null;
  stock_deducted: boolean;
  stock_deducted_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined from leads
  customer_name?: string;
  organization?: string;
  email?: string;
  phone?: string;
  assigned_rep_id?: string;
  rep_name?: string;
}

export interface JobItem {
  id?: string;
  job_id?: string;
  product_name: string;
  size: string;
  quantity: number;
  variant_code?: string | null;
}

export interface JobStageHistory {
  id: string;
  job_id: string;
  from_stage: string | null;
  to_stage: string;
  changed_by: string | null;
  notes: string | null;
  changed_at: string;
}

// Production stage display names
export const PRODUCTION_STAGES: Record<string, string> = {
  orders_awaiting_confirmation: "Orders Awaiting Confirmation",
  no_invoice_number: "No Invoice Number",
  orders: "Orders",
  supplier_orders: "Supplier Orders",
  layouts_busy_colline: "Layouts Busy (Colliné)",
  layouts_busy_elzana: "Layouts Busy (Elzana)",
  awaiting_color_match: "Awaiting Color Match",
  layouts_done_awaiting_approval: "Layouts Done (Awaiting Approval)",
  layouts_received: "Layouts Received",
  printing: "Printing",
  pressing: "Pressing",
  cmt: "CMT",
  cleaning_packing: "Cleaning & Packing",
  completed: "Completed",
  full_payment_before_collection: "Full Payment Before Collection",
  full_payment_before_delivery: "Full Payment Before Delivery",
  ready_for_delivery_collection: "Ready for Delivery/Collection",
  out_for_delivery: "Out for Delivery",
  delivered_collected: "Delivered/Collected",
};

// Stages that trigger customer alerts
export const ALERT_STAGES = [
  "printing",
  "cleaning_packing",
  "ready_for_delivery_collection",
  "out_for_delivery",
  "delivered_collected",
];

// Stage that triggers stock deduction
export const STOCK_DEDUCT_STAGE = "printing";
