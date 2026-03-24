import json

from core.db import get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso


def _build_candidate_solutions(order_count, line_count):
    # 基于订单规模生成 3 套候选方案（占位策略）
    safe_order_count = max(1, order_count)
    safe_line_count = max(1, line_count)

    base_box_count = max(1, int(safe_line_count * 0.6))
    base_pallet_count = max(1, int(base_box_count / 12) + 1)

    return [
        {
            "name": "Conservative",
            "tag": "low_complexity",
            "score_rank": 1,
            "box_count": base_box_count + 2,
            "pallet_count": base_pallet_count + 1,
            "gross_weight_kg": float(base_box_count * 42.5),
            "metrics_payload": {"mixing_level": "low", "order_count": safe_order_count},
        },
        {
            "name": "Balanced",
            "tag": "recommended",
            "score_rank": 2,
            "box_count": base_box_count,
            "pallet_count": base_pallet_count,
            "gross_weight_kg": float(base_box_count * 41.8),
            "metrics_payload": {"mixing_level": "medium", "order_count": safe_order_count},
        },
        {
            "name": "Aggressive",
            "tag": "box_pallet_min",
            "score_rank": 3,
            "box_count": max(1, base_box_count - 2),
            "pallet_count": max(1, base_pallet_count - 1),
            "gross_weight_kg": float(base_box_count * 41.0),
            "metrics_payload": {"mixing_level": "high", "order_count": safe_order_count},
        },
    ]


def calculate_plan(plan_id):
    # 任务计算入口：更新状态、生成方案、回写结果
    now = utc_now_iso()
    with get_conn() as conn:
        plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            raise AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404)

        conn.execute(
            "UPDATE shipment_plan SET status = ?, updated_at = ? WHERE id = ?",
            ("CALCULATING", now, plan_id),
        )

        orders = conn.execute(
            "SELECT * FROM shipment_plan_order WHERE plan_id = ?",
            (plan_id,),
        ).fetchall()

        line_count = 0
        for row in orders:
            # 统计订单量，作为占位计算输入
            payload = json.loads(row["line_payload"] or "{}")
            qty = payload.get("qty") or payload.get("quantity") or 1
            try:
                line_count += int(qty)
            except (TypeError, ValueError):
                line_count += 1

        candidates = _build_candidate_solutions(order_count=len(orders), line_count=line_count)
        # 覆盖写入最新候选方案
        conn.execute("DELETE FROM solution WHERE plan_id = ?", (plan_id,))
        for candidate in candidates:
            conn.execute(
                """
                INSERT INTO solution
                (plan_id, name, tag, score_rank, box_count, pallet_count, gross_weight_kg, metrics_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    plan_id,
                    candidate["name"],
                    candidate["tag"],
                    candidate["score_rank"],
                    candidate["box_count"],
                    candidate["pallet_count"],
                    candidate["gross_weight_kg"],
                    json.dumps(candidate["metrics_payload"], ensure_ascii=False),
                    now,
                ),
            )

        conn.execute(
            "UPDATE shipment_plan SET status = ?, updated_at = ? WHERE id = ?",
            ("PENDING_CONFIRM", now, plan_id),
        )

    return {
        "plan_id": plan_id,
        "status": "PENDING_CONFIRM",
        "solution_count": 3,
    }
