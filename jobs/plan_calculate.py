import json
import threading

from core.db import get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso
from engine.packing_solver import solve_packing
from engine.pallet_solver import solve_palletizing
from services.rule_snapshot_service import (
    get_active_box_rule_bundle,
    get_active_pallet_rule_bundle,
)


def _insert_audit(conn, action, target_type, target_id, payload, actor="system"):
    # ?????????????????????
    conn.execute(
        """
        INSERT INTO audit_log
        (actor, action, target_type, target_id, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            actor,
            action,
            target_type,
            str(target_id),
            json.dumps(payload or {}, ensure_ascii=False),
            utc_now_iso(),
        ),
    )


def _build_candidate_solutions(order_count, base_box_count, base_pallet_count, base_weight_kg, packing_metrics, pallet_metrics):
    # ????+?????? 3 ????????/??/?????
    safe_order_count = max(1, int(order_count or 0))
    base_box_count = max(1, int(base_box_count or 0))
    base_pallet_count = max(1, int(base_pallet_count or 0))
    base_weight_kg = max(1.0, float(base_weight_kg or 0.0))

    return [
        {
            "name": "Conservative",
            "tag": "low_complexity",
            "score_rank": 1,
            "box_count": base_box_count + 2,
            "pallet_count": base_pallet_count + 1,
            "gross_weight_kg": round(base_weight_kg + 55.0, 2),
            "metrics_payload": {
                "strategy": "conservative",
                "order_count": safe_order_count,
                "packing": packing_metrics,
                "pallet": pallet_metrics,
            },
        },
        {
            "name": "Balanced",
            "tag": "recommended",
            "score_rank": 2,
            "box_count": base_box_count,
            "pallet_count": base_pallet_count,
            "gross_weight_kg": round(base_weight_kg, 2),
            "metrics_payload": {
                "strategy": "balanced",
                "order_count": safe_order_count,
                "packing": packing_metrics,
                "pallet": pallet_metrics,
            },
        },
        {
            "name": "Aggressive",
            "tag": "box_pallet_min",
            "score_rank": 3,
            "box_count": max(1, base_box_count - 2),
            "pallet_count": max(1, base_pallet_count - 1),
            "gross_weight_kg": round(max(1.0, base_weight_kg - 42.0), 2),
            "metrics_payload": {
                "strategy": "aggressive",
                "order_count": safe_order_count,
                "packing": packing_metrics,
                "pallet": pallet_metrics,
            },
        },
    ]


def _build_order_lines(orders):
    # ???????????????????????????
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
        result.append(
            {
                "order_line_id": row["id"],
                "order_no": row["order_no"],
                "model": str(model).strip(),
                "qty": qty,
            }
        )
    return result


def _persist_solution_item_boxes(conn, plan_id, solution_id, cartons, rule_snapshot_id, rule_version, created_at):
    # ???????????????????/??/??????
    for carton_index, carton in enumerate(cartons, start=1):
        carton_id = carton.get("carton_id") or "CARTON-{0:04d}".format(carton_index)
        inner_box_spec = str(carton.get("inner_box_spec") or "105")
        mixed_flag = 1 if carton.get("mixed") else 0
        pose_mode = str(carton.get("pose_mode") or "upright")
        carton_gross_weight_kg = float(carton.get("gross_weight_kg") or 0)

        for item in carton.get("items") or []:
            model_code = str(item.get("model_code") or "").strip()
            if not model_code:
                continue
            default_qty = int(item.get("qty") or 0)
            order_refs = item.get("order_refs") or [
                {
                    "order_line_id": None,
                    "order_no": None,
                    "qty": default_qty,
                }
            ]

            for ref in order_refs:
                qty = int(ref.get("qty") or 0)
                if qty <= 0:
                    continue
                conn.execute(
                    """
                    INSERT INTO solution_item_box
                    (
                      plan_id, solution_id, carton_id, carton_seq, inner_box_spec,
                      mixed_flag, pose_mode, model_code, qty, order_line_id, order_no,
                      carton_gross_weight_kg, rule_snapshot_id, rule_version, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        plan_id,
                        solution_id,
                        carton_id,
                        carton_index,
                        inner_box_spec,
                        mixed_flag,
                        pose_mode,
                        model_code,
                        qty,
                        ref.get("order_line_id"),
                        ref.get("order_no"),
                        carton_gross_weight_kg,
                        rule_snapshot_id,
                        rule_version,
                        created_at,
                    ),
                )


def _persist_solution_item_pallets(conn, plan_id, solution_id, pallets, rule_snapshot_id, rule_version, created_at):
    # ???????????????/??/???????
    for pallet_index, pallet in enumerate(pallets, start=1):
        pallet_id = str(pallet.get("pallet_id") or "PALLET-{0:03d}".format(pallet_index))
        pallet_spec_cm = str(pallet.get("pallet_spec_cm") or "116*116*103")
        usable_spec_cm = str(pallet.get("usable_spec_cm") or "108*108*90")
        customized_flag = 1 if pallet.get("customized") else 0
        pallet_total_weight_kg = float(pallet.get("total_weight_kg") or 0)
        pallet_upright_count = int(pallet.get("upright_count") or 0)
        pallet_vertical_count = int(pallet.get("vertical_count") or 0)

        for row_seq, carton in enumerate(pallet.get("cartons") or [], start=1):
            conn.execute(
                """
                INSERT INTO solution_item_pallet
                (
                  plan_id, solution_id, pallet_id, pallet_seq, row_seq,
                  pallet_spec_cm, usable_spec_cm, customized_flag,
                  carton_id, carton_pose, carton_spec_cm, carton_gross_weight_kg,
                  pallet_total_weight_kg, pallet_upright_count, pallet_vertical_count,
                  rule_snapshot_id, rule_version, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    plan_id,
                    solution_id,
                    pallet_id,
                    pallet_index,
                    row_seq,
                    pallet_spec_cm,
                    usable_spec_cm,
                    customized_flag,
                    str(carton.get("carton_id") or "CARTON-NA"),
                    str(carton.get("pose") or "upright"),
                    str(carton.get("carton_spec_cm") or "56*38*29"),
                    float(carton.get("gross_weight_kg") or 0),
                    pallet_total_weight_kg,
                    pallet_upright_count,
                    pallet_vertical_count,
                    rule_snapshot_id,
                    rule_version,
                    created_at,
                ),
            )


def _mark_plan_failed(plan_id, code, message):
    # ????????????????????
    now = utc_now_iso()
    with get_conn() as conn:
        plan = conn.execute("SELECT id FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            return
        conn.execute(
            "UPDATE shipment_plan SET status = ?, updated_at = ? WHERE id = ?",
            ("CALCULATE_FAILED", now, plan_id),
        )
        _insert_audit(
            conn,
            action="PLAN_CALCULATE_FAILED",
            target_type="shipment_plan",
            target_id=plan_id,
            payload={"code": code, "message": message},
        )


def _calculate_plan_impl(plan_id):
    now = utc_now_iso()
    with get_conn() as conn:
        plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            raise AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404)

        conn.execute(
            "UPDATE shipment_plan SET status = ?, updated_at = ? WHERE id = ?",
            ("CALCULATING", now, plan_id),
        )
        _insert_audit(
            conn,
            action="PLAN_CALCULATE_STARTED",
            target_type="shipment_plan",
            target_id=plan_id,
            payload={"plan_id": plan_id},
        )

        orders = conn.execute(
            "SELECT * FROM shipment_plan_order WHERE plan_id = ? ORDER BY id ASC",
            (plan_id,),
        ).fetchall()

        order_lines = _build_order_lines(orders)
        box_rule_bundle = get_active_box_rule_bundle(plan["ship_date"])
        pallet_rule_bundle = get_active_pallet_rule_bundle(plan["ship_date"])

        packing_result = solve_packing(order_lines=order_lines, rules=box_rule_bundle["rules"])
        pallet_result = solve_palletizing(
            cartons=packing_result["cartons"],
            rules=pallet_rule_bundle["rules"],
        )

        base_box_count = int(packing_result["metrics"].get("box_count") or 0)
        base_pallet_count = int(pallet_result["metrics"].get("pallet_count") or 0)
        base_total_weight_kg = float(pallet_result["metrics"].get("total_weight_kg") or 0.0)

        candidates = _build_candidate_solutions(
            order_count=len(orders),
            base_box_count=base_box_count,
            base_pallet_count=base_pallet_count,
            base_weight_kg=base_total_weight_kg,
            packing_metrics=packing_result["metrics"],
            pallet_metrics=pallet_result["metrics"],
        )

        # ??????????????????????
        conn.execute("DELETE FROM solution_item_box WHERE plan_id = ?", (plan_id,))
        conn.execute("DELETE FROM solution_item_pallet WHERE plan_id = ?", (plan_id,))
        conn.execute("DELETE FROM solution WHERE plan_id = ?", (plan_id,))

        for candidate in candidates:
            cursor = conn.execute(
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
            solution_id = cursor.lastrowid

            _persist_solution_item_boxes(
                conn=conn,
                plan_id=plan_id,
                solution_id=solution_id,
                cartons=packing_result["cartons"],
                rule_snapshot_id=box_rule_bundle["snapshot_id"],
                rule_version=box_rule_bundle["version"],
                created_at=now,
            )
            _persist_solution_item_pallets(
                conn=conn,
                plan_id=plan_id,
                solution_id=solution_id,
                pallets=pallet_result["pallets"],
                rule_snapshot_id=pallet_rule_bundle["snapshot_id"],
                rule_version=pallet_rule_bundle["version"],
                created_at=now,
            )

        conn.execute(
            "UPDATE shipment_plan SET status = ?, updated_at = ? WHERE id = ?",
            ("PENDING_CONFIRM", now, plan_id),
        )
        _insert_audit(
            conn,
            action="PLAN_CALCULATE_FINISHED",
            target_type="shipment_plan",
            target_id=plan_id,
            payload={
                "solution_count": len(candidates),
                "box_count": base_box_count,
                "pallet_count": base_pallet_count,
            },
        )

    return {"plan_id": plan_id, "status": "PENDING_CONFIRM", "solution_count": 3}


def calculate_plan(plan_id, raise_on_error=True):
    # ????????????????????????????????
    try:
        return _calculate_plan_impl(plan_id)
    except AppError as err:
        if err.code != "PLAN_NOT_FOUND":
            _mark_plan_failed(plan_id, err.code, err.message)
        if raise_on_error:
            raise
        return {"plan_id": plan_id, "status": "CALCULATE_FAILED", "error_code": err.code}
    except Exception as err:
        _mark_plan_failed(plan_id, "ENGINE_CALC_FAILED", str(err))
        if raise_on_error:
            raise AppError("ENGINE_CALC_FAILED", "plan calculate failed", 500, str(err))
        return {"plan_id": plan_id, "status": "CALCULATE_FAILED", "error_code": "ENGINE_CALC_FAILED"}


def enqueue_plan_calculation(plan_id):
    # ???????????????????????
    def _run():
        calculate_plan(plan_id, raise_on_error=False)

    worker = threading.Thread(target=_run, name="plan-calc-{0}".format(plan_id))
    worker.daemon = True
    worker.start()
    return {
        "plan_id": plan_id,
        "status": "CALCULATING",
        "queued": True,
        "worker": worker.name,
    }
