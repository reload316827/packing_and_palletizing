from __future__ import annotations

import json
from typing import Any

from core.db import get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso


def _build_candidate_solutions(order_count: int, line_count: int) -> list[dict[str, Any]]:
    safe_order_count = max(1, order_count)
    safe_line_count = max(1, line_count)

    base_box_count = max(1, int(safe_line_count * 0.6))
    base_pallet_count = max(1, int(base_box_count / 12) + 1)

    return [
        {
            "name": "保守方案",
            "tag": "低复杂度",
            "score_rank": 1,
            "box_count": base_box_count + 2,
            "pallet_count": base_pallet_count + 1,
            "gross_weight_kg": float(base_box_count * 42.5),
            "metrics_payload": {"mixing_level": "low", "order_count": safe_order_count},
        },
        {
            "name": "均衡方案",
            "tag": "推荐",
            "score_rank": 2,
            "box_count": base_box_count,
            "pallet_count": base_pallet_count,
            "gross_weight_kg": float(base_box_count * 41.8),
            "metrics_payload": {"mixing_level": "medium", "order_count": safe_order_count},
        },
        {
            "name": "极致省箱托",
            "tag": "最省箱托",
            "score_rank": 3,
            "box_count": max(1, base_box_count - 2),
            "pallet_count": max(1, base_pallet_count - 1),
            "gross_weight_kg": float(base_box_count * 41.0),
            "metrics_payload": {"mixing_level": "high", "order_count": safe_order_count},
        },
    ]


def calculate_plan(plan_id: int) -> dict[str, Any]:
    now = utc_now_iso()
    with get_conn() as conn:
        plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            raise AppError("PLAN_NOT_FOUND", f"任务不存在: {plan_id}", 404)

        conn.execute(
            "UPDATE shipment_plan SET status = ?, updated_at = ? WHERE id = ?",
            ("计算中", now, plan_id),
        )

        orders = conn.execute(
            "SELECT * FROM shipment_plan_order WHERE plan_id = ?",
            (plan_id,),
        ).fetchall()

        line_count = 0
        for row in orders:
            payload = json.loads(row["line_payload"] or "{}")
            qty = payload.get("qty") or payload.get("quantity") or 1
            try:
                line_count += int(qty)
            except (TypeError, ValueError):
                line_count += 1

        candidates = _build_candidate_solutions(order_count=len(orders), line_count=line_count)
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
            ("待确认", now, plan_id),
        )

    return {
        "plan_id": plan_id,
        "status": "待确认",
        "solution_count": 3,
    }
