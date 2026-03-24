CREATE TABLE IF NOT EXISTS rule_snapshot_conflict (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  conflict_type TEXT NOT NULL,          -- box_model_conflict / pallet_inner_conflict
  conflict_key TEXT NOT NULL,           -- model_code / inner_box_code
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES rule_snapshot(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rule_snapshot_activation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_type TEXT NOT NULL,          -- box / pallet
  snapshot_id INTEGER NOT NULL,
  effective_from TEXT NOT NULL,         -- ISO 时间，默认当前
  created_at TEXT NOT NULL,
  FOREIGN KEY(snapshot_id) REFERENCES rule_snapshot(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rule_conflict_snapshot_id ON rule_snapshot_conflict(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_rule_activation_type_time ON rule_snapshot_activation(snapshot_type, effective_from);
