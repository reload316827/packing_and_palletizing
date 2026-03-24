PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shipment_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_code TEXT NOT NULL,
  ship_date TEXT NOT NULL,
  merge_mode TEXT NOT NULL DEFAULT '不合并',
  status TEXT NOT NULL DEFAULT '草稿',
  source_payload TEXT NOT NULL,
  final_solution_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipment_plan_order (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  order_no TEXT NOT NULL,
  line_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES shipment_plan(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS solution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  score_rank INTEGER NOT NULL,
  box_count INTEGER NOT NULL,
  pallet_count INTEGER NOT NULL,
  gross_weight_kg REAL NOT NULL,
  metrics_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES shipment_plan(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_status ON shipment_plan(status);
CREATE INDEX IF NOT EXISTS idx_order_plan_id ON shipment_plan_order(plan_id);
CREATE INDEX IF NOT EXISTS idx_solution_plan_id ON solution(plan_id);
