export interface Material {
  id: string;
  name: string;
  unit: string;
  qty_on_hand: number;
  minimum_level: number;
  restock_threshold: number;
  supplier: string | null;
  updated_at: string;
  // Computed client-side usually, but good to have in type
  low_stock?: boolean;
}

export interface ProductMaterialUsage {
  id: string;
  product_type: string; // Links to leads.product_type
  size?: string | null;
  material_id: string;
  qty_per_unit: number;
  material?: Material; // Joined
  last_modified: string;
  last_modified_by: string | null;
}

export interface StockMovement {
  id: string;
  material_id: string;
  delta_qty: number;
  type: 'consumed' | 'restocked' | 'audit';
  reference: string | null; // lead_id or job_id
  notes: string | null;
  created_at: string;
  created_by: string | null;
  material?: Material; // Joined
  actor_name?: string | null; // Joined from users
}
