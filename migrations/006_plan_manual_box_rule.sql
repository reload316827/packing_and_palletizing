CREATE TABLE IF NOT EXISTS plan_manual_box_rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  model_code TEXT NOT NULL,
  inner_box_spec TEXT NOT NULL,
  qty_per_carton INTEGER,
  gross_weight_kg REAL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES shipment_plan(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_manual_box_rule_plan_model
ON plan_manual_box_rule(plan_id, model_code);

CREATE INDEX IF NOT EXISTS idx_plan_manual_box_rule_plan_id
ON plan_manual_box_rule(plan_id);
