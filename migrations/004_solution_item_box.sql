CREATE TABLE IF NOT EXISTS solution_item_box (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  solution_id INTEGER NOT NULL,
  carton_id TEXT NOT NULL,
  carton_seq INTEGER NOT NULL,
  inner_box_spec TEXT NOT NULL,
  mixed_flag INTEGER NOT NULL DEFAULT 0,
  pose_mode TEXT NOT NULL DEFAULT 'upright',
  model_code TEXT NOT NULL,
  qty INTEGER NOT NULL,
  order_line_id INTEGER,
  order_no TEXT,
  carton_gross_weight_kg REAL NOT NULL DEFAULT 0,
  rule_snapshot_id INTEGER,
  rule_version TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES shipment_plan(id) ON DELETE CASCADE,
  FOREIGN KEY(solution_id) REFERENCES solution(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_solution_item_box_plan_id ON solution_item_box(plan_id);
CREATE INDEX IF NOT EXISTS idx_solution_item_box_solution_id ON solution_item_box(solution_id);
CREATE INDEX IF NOT EXISTS idx_solution_item_box_order_line_id ON solution_item_box(order_line_id);
