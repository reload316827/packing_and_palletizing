import json

from core.db import get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso
from engine.packing_solver import solve_packing
from services.rule_snapshot_service import get_active_box_rules


def _build_candidate_solutions(order_count, base_box_count, mixing_level):
    # 基于装箱结果生成 3 套候选方案（保守/均衡/省箱托）
    safe_order_count = max(1, order_count)
    base_box_count = max(1, base_box_count)
    base_pallet_count = max(1, int(base_box_count / 12) + 1)

    return [
        {
            "name": "Conservative",
            "tag": "low_complexity",
            "score_rank": 1,
            "box_count": base_box_count + 2,
            "pallet_count": base_pallet_count + 1,
            "gross_weight_kg": float(base_box_count * 42.5),
            "metrics_payload": {"mixing_level": "low", "order_count": safe_order_count, "source": "packing_solver"},
        },
        {
            "name": "Balanced",
            "tag": "recommended",
            "score_rank": 2,
            "box_count": base_box_count,
            "pallet_count": base_pallet_count,
            "gross_weight_kg": float(base_box_count * 41.8),
            "metrics_payload": {"mixing_level": mixing_level, "order_count": safe_order_count, "source": "packing_solver"},
        },
        {
            "name": "Aggressive",
            "tag": "box_pallet_min",
            "score_rank": 3,
            "box_count": max(1, base_box_count - 2),
            "pallet_count": max(1, base_pallet_count - 1),
            "gross_weight_kg": float(base_box_count * 41.0),
            "metrics_payload": {"mixing_level": "high", "order_count": safe_order_count, "source": "packing_solver"},
        },
    ]


def _build_order_lines(orders):
    # 从任务订单快照中提取装箱所需字段
    result = []
    for row in orders:
        payload = json.loads(row["line_payload"] or "{}")
        model = payload.get("model") or payload.get("model_code")
        if not model:
            continue
        qty = payload.get("qty") or payload.get("quantity") or 0
        try:
            qty = int(float(str(qty)))
        except (TypeError, ValueError):
            qty = 0
        if qty <= 0:
            continue
        result.append({"model": str(model).strip(), "qty": qty})
    return result


def calculate_plan(plan_id):
    # 任务计算入口：读取规则、执行装箱、生成候选方案、回写数据库
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

        order_lines = _build_order_lines(orders)
        active_box_rules = get_active_box_rules(plan["ship_date"])
        packing_result = solve_packing(order_lines=order_lines, rules=active_box_rules)
        base_box_count = packing_result["metrics"]["box_count"]
        mixing_level = packing_result["metrics"]["mixing_level"]

        candidates = _build_candidate_solutions(
            order_count=len(orders),
            base_box_count=base_box_count,
            mixing_level=mixing_level,
        )

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

    return {"plan_id": plan_id, "status": "PENDING_CONFIRM", "solution_count": 3}
