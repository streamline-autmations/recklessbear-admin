-- Add stock tracking field to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS printing_stock_deducted_at TIMESTAMPTZ DEFAULT NULL;

-- Create materials_inventory table
CREATE TABLE IF NOT EXISTS materials_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL, -- 'meters', 'units', etc.
  qty_on_hand NUMERIC NOT NULL DEFAULT 0,
  minimum_level NUMERIC NOT NULL DEFAULT 0,
  restock_threshold NUMERIC NOT NULL DEFAULT 0,
  supplier TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for materials_inventory
ALTER TABLE materials_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON materials_inventory
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to authenticated users" ON materials_inventory
  FOR ALL TO authenticated USING (true);

-- Create product_material_usage (BOM) table
CREATE TABLE IF NOT EXISTS product_material_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL,
  size TEXT, -- Optional, for size-specific usage
  material_id UUID NOT NULL REFERENCES materials_inventory(id),
  qty_per_unit NUMERIC NOT NULL DEFAULT 0,
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  last_modified_by TEXT
);

-- Enable RLS for product_material_usage
ALTER TABLE product_material_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON product_material_usage
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow write access to authenticated users" ON product_material_usage
  FOR ALL TO authenticated USING (true);

-- Create stock_movements (audit ledger) table
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials_inventory(id),
  delta_qty NUMERIC NOT NULL, -- Positive for restock/audit add, negative for consumed
  type TEXT NOT NULL CHECK (type IN ('consumed', 'restocked', 'audit')),
  reference TEXT, -- lead_id or job_id
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS for stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON stock_movements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert access to authenticated users" ON stock_movements
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_stock_movements_material_id ON stock_movements(material_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_product_material_usage_product_type ON product_material_usage(product_type);
