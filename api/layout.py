import json

from flask import Blueprint, jsonify, request

from core.db import get_conn
from core.errors import AppError

layout_bp = Blueprint("layout", __name__, url_prefix="/api/layout")


def _error_response(err):
    return jsonify(err.to_dict()), err.http_status


def _pick_solution_id(conn, plan_id, explicit_solution_id=None):
    if explicit_solution_id is not None:
        row = conn.execute(
            "SELECT id FROM solution WHERE id = ? AND plan_id = ?",
            (explicit_solution_id, plan_id),
        ).fetchone()
        if not row:
            raise AppError("SOLUTION_NOT_FOUND", "solution not found in plan", 404)
        return int(row["id"])

    plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
    if not plan:
        raise AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404)

    if plan["final_solution_id"]:
        return int(plan["final_solution_id"])

    row = conn.execute(
        "SELECT id FROM solution WHERE plan_id = ? ORDER BY score_rank ASC, id ASC LIMIT 1",
        (plan_id,),
    ).fetchone()
    if not row:
        raise AppError("SOLUTION_NOT_FOUND", "solution not found in plan", 404)
    return int(row["id"])


@layout_bp.route("/<int:plan_id>", methods=["GET"])
def get_layout(plan_id):
    # ?? 3D ?????????????/??/?????
    pallet_id = str(request.args.get("pallet_id", "")).strip()
    carton_id = str(request.args.get("carton_id", "")).strip()
    model = str(request.args.get("model", "")).strip()
    solution_id_arg = request.args.get("solution_id")
    solution_id_arg = int(solution_id_arg) if solution_id_arg not in (None, "") else None

    try:
        with get_conn() as conn:
            solution_id = _pick_solution_id(conn, plan_id, solution_id_arg)

            pallet_rows = conn.execute(
                """
                SELECT *
                FROM solution_item_pallet
                WHERE plan_id = ? AND solution_id = ?
                ORDER BY pallet_seq ASC, row_seq ASC, id ASC
                """,
                (plan_id, solution_id),
            ).fetchall()

            box_rows = conn.execute(
                """
                SELECT carton_id, model_code, qty
                FROM solution_item_box
                WHERE plan_id = ? AND solution_id = ?
                ORDER BY carton_seq ASC, id ASC
                """,
                (plan_id, solution_id),
            ).fetchall()

    except AppError as err:
        return _error_response(err)

    model_map = {}
    qty_map = {}
    for row in box_rows:
        cid = str(row["carton_id"])
        model_map.setdefault(cid, set()).add(str(row["model_code"] or "-"))
        qty_map[cid] = qty_map.get(cid, 0) + int(row["qty"] or 0)

    boxes = []
    for row in pallet_rows:
        cid = str(row["carton_id"])
        models = sorted(model_map.get(cid, set())) or ["-"]
        if model and model not in models:
            continue

        box = {
            "pallet_id": str(row["pallet_id"]),
            "pallet_seq": int(row["pallet_seq"] or 0),
            "carton_id": cid,
            "row_seq": int(row["row_seq"] or 0),
            "carton_spec_cm": str(row["carton_spec_cm"] or "56*38*29"),
            "pose": str(row["carton_pose"] or "upright"),
            "models": models,
            "qty": int(qty_map.get(cid, 0)),
            "gross_weight_kg": float(row["carton_gross_weight_kg"] or 0),
            "pallet_spec_cm": str(row["pallet_spec_cm"] or "116*116*103"),
            "usable_spec_cm": str(row["usable_spec_cm"] or "108*108*90"),
        }

        if pallet_id and box["pallet_id"] != pallet_id:
            continue
        if carton_id and box["carton_id"] != carton_id:
            continue

        boxes.append(box)

    pallet_ids = sorted({row["pallet_id"] for row in boxes})
    carton_ids = sorted({row["carton_id"] for row in boxes})

    return jsonify(
        {
            "plan_id": plan_id,
            "solution_id": solution_id,
            "filters": {
                "pallet_id": pallet_id or None,
                "carton_id": carton_id or None,
                "model": model or None,
            },
            "stats": {
                "pallet_count": len(pallet_ids),
                "carton_count": len(carton_ids),
                "row_count": len(boxes),
            },
            "boxes": boxes,
        }
    ), 200
