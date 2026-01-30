-- Create stock_transactions table
CREATE TABLE IF NOT EXISTS stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('purchase_order', 'production_deduction', 'adjustment', 'return', 'initial_balance')),
  reference_id TEXT, -- Can be job_id, PO number, or NULL
  notes TEXT,
  status TEXT DEFAULT 'completed', -- pending, completed, cancelled
  transaction_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS for stock_transactions
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON stock_transactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert access to authenticated users" ON stock_transactions
  FOR INSERT TO authenticated WITH CHECK (true);

-- Create stock_transaction_line_items table
CREATE TABLE IF NOT EXISTS stock_transaction_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES stock_transactions(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES materials_inventory(id),
  quantity NUMERIC NOT NULL, -- Positive or negative delta
  unit_cost NUMERIC, -- Optional cost per unit at time of transaction
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for stock_transaction_line_items
ALTER TABLE stock_transaction_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to authenticated users" ON stock_transaction_line_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insert access to authenticated users" ON stock_transaction_line_items
  FOR INSERT TO authenticated WITH CHECK (true);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_stock_transactions_type ON stock_transactions(type);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_date ON stock_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_stock_transaction_items_trans_id ON stock_transaction_line_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_transaction_items_material_id ON stock_transaction_line_items(material_id);
