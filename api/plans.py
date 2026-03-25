import json

from flask import Blueprint, jsonify, request

from core.db import get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso
from jobs.plan_calculate import calculate_plan, enqueue_plan_calculation

plans_bp = Blueprint("plans", __name__, url_prefix="/api/plans")


def _validate_plan_payload(payload):
    # ????????????
    if not isinstance(payload, dict):
        raise AppError("INVALID_PAYLOAD", "payload must be a JSON object")
    if not str(payload.get("customer_code", "")).strip():
        raise AppError("MISSING_CUSTOMER_CODE", "customer_code is required")
    if not str(payload.get("ship_date", "")).strip():
        raise AppError("MISSING_SHIP_DATE", "ship_date is required, e.g. 2026-03-24")
    merge_mode = str(payload.get("merge_mode", "NO_MERGE")).strip()
    if merge_mode not in {"MERGE", "NO_MERGE", "??", "???"}:
        raise AppError("INVALID_MERGE_MODE", "merge_mode must be MERGE or NO_MERGE")


def _row_to_dict(row):
    # sqlite Row -> dict??? JSON ????
    return dict(row) if row is not None else {}


def _error_response(err):
    return jsonify(err.to_dict()), err.http_status


def _insert_audit(conn, action, target_type, target_id, payload, actor="system"):
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


@plans_bp.route("", methods=["GET"])
def list_plans():
    # ??????????????????????????
    status = str(request.args.get("status", "")).strip()
    customer_code = str(request.args.get("customer_code", "")).strip()

    sql = "SELECT * FROM shipment_plan WHERE 1=1"
    args = []
    if status:
        sql += " AND status = ?"
        args.append(status)
    if customer_code:
        sql += " AND customer_code = ?"
        args.append(customer_code)
    sql += " ORDER BY id DESC"

    with get_conn() as conn:
        rows = conn.execute(sql, tuple(args)).fetchall()
        plans = []
        for row in rows:
            plan = _row_to_dict(row)
            order_count = conn.execute(
                "SELECT COUNT(1) AS cnt FROM shipment_plan_order WHERE plan_id = ?",
                (plan["id"],),
            ).fetchone()["cnt"]

            final_solution_id = plan.get("final_solution_id")
            if final_solution_id:
                summary_solution = conn.execute(
                    "SELECT * FROM solution WHERE id = ? AND plan_id = ?",
                    (final_solution_id, plan["id"]),
                ).fetchone()
            else:
                summary_solution = conn.execute(
                    """
                    SELECT *
                    FROM solution
                    WHERE plan_id = ?
                    ORDER BY score_rank ASC, id ASC
                    LIMIT 1
                    """,
                    (plan["id"],),
                ).fetchone()

            plan["order_count"] = int(order_count or 0)
            plan["summary_box_count"] = int(summary_solution["box_count"]) if summary_solution else 0
            plan["summary_pallet_count"] = int(summary_solution["pallet_count"]) if summary_solution else 0
            plan["summary_weight_kg"] = float(summary_solution["gross_weight_kg"]) if summary_solution else 0.0
            plans.append(plan)

    return jsonify({"plans": plans}), 200


@plans_bp.route("", methods=["POST"])
def create_plan():
    # ?????????????
    payload = request.get_json(silent=True) or {}
    try:
        _validate_plan_payload(payload)
    except AppError as err:
        return _error_response(err)

    orders = payload.get("orders") or []
    if not isinstance(orders, list):
        return _error_response(AppError("INVALID_ORDERS", "orders must be an array"))

    created_at = utc_now_iso()
    with get_conn() as conn:
        cursor = conn.execute(
            """
            INSERT INTO shipment_plan
            (customer_code, ship_date, merge_mode, status, source_payload, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["customer_code"].strip(),
                payload["ship_date"].strip(),
                payload.get("merge_mode", "NO_MERGE"),
                "DRAFT",
                json.dumps(payload, ensure_ascii=False),
                created_at,
                created_at,
            ),
        )
        plan_id = cursor.lastrowid

        for idx, order in enumerate(orders):
            order_no = str((order or {}).get("order_no", "")).strip() or "ORDER-{0:03d}".format(idx + 1)
            conn.execute(
                """
                INSERT INTO shipment_plan_order
                (plan_id, order_no, line_payload, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (plan_id, order_no, json.dumps(order, ensure_ascii=False), created_at),
            )

        _insert_audit(
            conn,
            action="PLAN_CREATED",
            target_type="shipment_plan",
            target_id=plan_id,
            payload={"order_count": len(orders)},
            actor=str(payload.get("actor") or "system"),
        )

        row = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()

    return jsonify({"plan": _row_to_dict(row)}), 201


@plans_bp.route("/<int:plan_id>", methods=["GET"])
def get_plan(plan_id):
    # ??????????????????????????????????
    with get_conn() as conn:
        plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            return _error_response(AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404))

        orders = conn.execute(
            "SELECT * FROM shipment_plan_order WHERE plan_id = ? ORDER BY id ASC",
            (plan_id,),
        ).fetchall()
        solutions = conn.execute(
            "SELECT * FROM solution WHERE plan_id = ? ORDER BY score_rank ASC",
            (plan_id,),
        ).fetchall()
        solution_item_boxes = conn.execute(
            """
            SELECT *
            FROM solution_item_box
            WHERE plan_id = ?
            ORDER BY solution_id ASC, carton_seq ASC, id ASC
            """,
            (plan_id,),
        ).fetchall()
        solution_item_pallets = conn.execute(
            """
            SELECT *
            FROM solution_item_pallet
            WHERE plan_id = ?
            ORDER BY solution_id ASC, pallet_seq ASC, row_seq ASC, id ASC
            """,
            (plan_id,),
        ).fetchall()
        override_uploads = conn.execute(
            "SELECT * FROM plan_override_upload WHERE plan_id = ? ORDER BY id DESC",
            (plan_id,),
        ).fetchall()
        audit_logs = conn.execute(
            "SELECT * FROM audit_log WHERE target_type = 'shipment_plan' AND target_id = ? ORDER BY id DESC",
            (str(plan_id),),
        ).fetchall()

    return jsonify(
        {
            "plan": _row_to_dict(plan),
            "orders": [_row_to_dict(row) for row in orders],
            "solutions": [_row_to_dict(row) for row in solutions],
            "solution_item_boxes": [_row_to_dict(row) for row in solution_item_boxes],
            "solution_item_pallets": [_row_to_dict(row) for row in solution_item_pallets],
            "override_uploads": [_row_to_dict(row) for row in override_uploads],
            "audit_logs": [_row_to_dict(row) for row in audit_logs],
        }
    )


@plans_bp.route("/<int:plan_id>/calculate", methods=["POST"])
def run_plan_calculation(plan_id):
    # ???????????????? async=true ????????
    payload = request.get_json(silent=True) or {}
    async_mode = bool(payload.get("async"))

    if async_mode:
        with get_conn() as conn:
            plan = conn.execute("SELECT id FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
            if not plan:
                return _error_response(AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404))
        result = enqueue_plan_calculation(plan_id)
        return jsonify(result), 202

    try:
        result = calculate_plan(plan_id)
    except AppError as err:
        return _error_response(err)

    return jsonify(result), 200


@plans_bp.route("/<int:plan_id>/confirm", methods=["POST"])
def confirm_solution(plan_id):
    # ????????? final_solution_id ?????? CONFIRMED?
    payload = request.get_json(silent=True) or {}
    solution_id = payload.get("solution_id")
    actor = str(payload.get("actor") or "system")

    if solution_id is None:
        return _error_response(AppError("MISSING_SOLUTION_ID", "solution_id is required"))

    now = utc_now_iso()
    with get_conn() as conn:
        plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            return _error_response(AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404))

        solution = conn.execute(
            "SELECT * FROM solution WHERE id = ? AND plan_id = ?",
            (solution_id, plan_id),
        ).fetchone()
        if not solution:
            return _error_response(AppError("SOLUTION_NOT_FOUND", "solution not found in plan: {0}".format(solution_id), 404))

        conn.execute(
            "UPDATE shipment_plan SET final_solution_id = ?, status = ?, updated_at = ? WHERE id = ?",
            (solution_id, "CONFIRMED", now, plan_id),
        )
        _insert_audit(
            conn,
            action="PLAN_CONFIRM",
            target_type="shipment_plan",
            target_id=plan_id,
            payload={"solution_id": solution_id},
            actor=actor,
        )

        row = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()

    return jsonify({"plan": _row_to_dict(row)}), 200


@plans_bp.route("/<int:plan_id>/rollback", methods=["POST"])
def rollback_plan_confirmation(plan_id):
    # ????????????? PENDING_CONFIRM?
    payload = request.get_json(silent=True) or {}
    actor = str(payload.get("actor") or "system")
    reason = str(payload.get("reason") or "").strip()

    now = utc_now_iso()
    with get_conn() as conn:
        plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            return _error_response(AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404))

        conn.execute(
            "UPDATE shipment_plan SET final_solution_id = NULL, status = ?, updated_at = ? WHERE id = ?",
            ("PENDING_CONFIRM", now, plan_id),
        )
        _insert_audit(
            conn,
            action="PLAN_ROLLBACK",
            target_type="shipment_plan",
            target_id=plan_id,
            payload={"reason": reason},
            actor=actor,
        )

        row = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()

    return jsonify({"plan": _row_to_dict(row)}), 200


@plans_bp.route("/<int:plan_id>/override-upload", methods=["POST"])
def upload_override_file(plan_id):
    # ????????????????????
    payload = request.get_json(silent=True) or {}
    file_name = str(payload.get("file_name") or "").strip()
    if not file_name:
        return _error_response(AppError("MISSING_FILE_NAME", "file_name is required"))

    file_path = str(payload.get("file_path") or "").strip() or None
    note = str(payload.get("note") or "").strip() or None
    actor = str(payload.get("actor") or "system")
    now = utc_now_iso()

    with get_conn() as conn:
        plan = conn.execute("SELECT id FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            return _error_response(AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404))

        cursor = conn.execute(
            """
            INSERT INTO plan_override_upload
            (plan_id, file_name, file_path, note, uploaded_by, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (plan_id, file_name, file_path, note, actor, now),
        )
        upload_id = cursor.lastrowid

        _insert_audit(
            conn,
            action="PLAN_OVERRIDE_UPLOAD",
            target_type="shipment_plan",
            target_id=plan_id,
            payload={"upload_id": upload_id, "file_name": file_name},
            actor=actor,
        )

        row = conn.execute("SELECT * FROM plan_override_upload WHERE id = ?", (upload_id,)).fetchone()

    return jsonify({"upload": _row_to_dict(row)}), 201
