CREATE TABLE IF NOT EXISTS solution_item_pallet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  solution_id INTEGER NOT NULL,
  pallet_id TEXT NOT NULL,
  pallet_seq INTEGER NOT NULL,
  row_seq INTEGER NOT NULL,
  pallet_spec_cm TEXT NOT NULL,
  usable_spec_cm TEXT NOT NULL,
  customized_flag INTEGER NOT NULL DEFAULT 0,
  carton_id TEXT NOT NULL,
  carton_pose TEXT NOT NULL DEFAULT 'upright',
  carton_spec_cm TEXT NOT NULL,
  carton_gross_weight_kg REAL NOT NULL DEFAULT 0,
  pallet_total_weight_kg REAL NOT NULL DEFAULT 0,
  pallet_upright_count INTEGER NOT NULL DEFAULT 0,
  pallet_vertical_count INTEGER NOT NULL DEFAULT 0,
  rule_snapshot_id INTEGER,
  rule_version TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES shipment_plan(id) ON DELETE CASCADE,
  FOREIGN KEY(solution_id) REFERENCES solution(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_solution_item_pallet_plan_id ON solution_item_pallet(plan_id);
CREATE INDEX IF NOT EXISTS idx_solution_item_pallet_solution_id ON solution_item_pallet(solution_id);
CREATE INDEX IF NOT EXISTS idx_solution_item_pallet_pallet_id ON solution_item_pallet(pallet_id);

CREATE TABLE IF NOT EXISTS plan_override_upload (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT,
  note TEXT,
  uploaded_by TEXT NOT NULL DEFAULT 'system',
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES shipment_plan(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plan_override_upload_plan_id ON plan_override_upload(plan_id);
