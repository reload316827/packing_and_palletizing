CREATE TABLE IF NOT EXISTS rule_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_type TEXT NOT NULL,             -- box / pallet
  source_file TEXT NOT NULL,
  version TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  payload_preview TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_model_inner_box (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  model_code TEXT,
  inner_box_spec TEXT,
  qty_per_carton INTEGER,
  gross_weight_kg REAL,
  raw_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES rule_snapshot(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rule_inner_outer_pallet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  inner_box_code TEXT,
  carton_spec_cm TEXT,
  pallet_spec_cm TEXT,
  carton_qty INTEGER,
  pallet_carton_qty INTEGER,
  raw_payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES rule_snapshot(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rule_snapshot_type ON rule_snapshot(snapshot_type);
CREATE INDEX IF NOT EXISTS idx_rule_model_snapshot_id ON rule_model_inner_box(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_rule_pallet_snapshot_id ON rule_inner_outer_pallet(snapshot_id);
