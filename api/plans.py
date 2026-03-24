import json

from flask import Blueprint, jsonify, request

from core.db import get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso
from jobs.plan_calculate import calculate_plan

plans_bp = Blueprint("plans", __name__, url_prefix="/api/plans")


def _validate_plan_payload(payload):
    if not isinstance(payload, dict):
        raise AppError("INVALID_PAYLOAD", "请求体必须为 JSON 对象")
    if not str(payload.get("customer_code", "")).strip():
        raise AppError("MISSING_CUSTOMER_CODE", "customer_code 不能为空")
    if not str(payload.get("ship_date", "")).strip():
        raise AppError("MISSING_SHIP_DATE", "ship_date 不能为空，格式示例 2026-03-24")
    merge_mode = str(payload.get("merge_mode", "不合并")).strip()
    if merge_mode not in {"合并", "不合并"}:
        raise AppError("INVALID_MERGE_MODE", "merge_mode 仅支持 合并 / 不合并")


def _row_to_dict(row):
    return dict(row) if row is not None else {}


def _error_response(err: AppError):
    return jsonify(err.to_dict()), err.http_status


@plans_bp.route("", methods=["POST"])
def create_plan():
    payload = request.get_json(silent=True) or {}
    try:
        _validate_plan_payload(payload)
    except AppError as err:
        return _error_response(err)

    orders = payload.get("orders") or []
    if not isinstance(orders, list):
        return _error_response(AppError("INVALID_ORDERS", "orders 必须是数组"))

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
                payload.get("merge_mode", "不合并"),
                "草稿",
                json.dumps(payload, ensure_ascii=False),
                created_at,
                created_at,
            ),
        )
        plan_id = cursor.lastrowid

        for idx, order in enumerate(orders):
            order_no = str((order or {}).get("order_no", "")).strip() or f"ORDER-{idx + 1:03d}"
            conn.execute(
                """
                INSERT INTO shipment_plan_order
                (plan_id, order_no, line_payload, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (plan_id, order_no, json.dumps(order, ensure_ascii=False), created_at),
            )

        row = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()

    return jsonify({"plan": _row_to_dict(row)}), 201


@plans_bp.route("/<int:plan_id>", methods=["GET"])
def get_plan(plan_id):
    with get_conn() as conn:
        plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            return _error_response(AppError("PLAN_NOT_FOUND", f"任务不存在: {plan_id}", 404))

        orders = conn.execute(
            "SELECT * FROM shipment_plan_order WHERE plan_id = ? ORDER BY id ASC", (plan_id,)
        ).fetchall()
        solutions = conn.execute(
            "SELECT * FROM solution WHERE plan_id = ? ORDER BY score_rank ASC", (plan_id,)
        ).fetchall()

    return jsonify(
        {
            "plan": _row_to_dict(plan),
            "orders": [_row_to_dict(row) for row in orders],
            "solutions": [_row_to_dict(row) for row in solutions],
        }
    )


@plans_bp.route("/<int:plan_id>/calculate", methods=["POST"])
def run_plan_calculation(plan_id):
    try:
        result = calculate_plan(plan_id)
    except AppError as err:
        return _error_response(err)

    return jsonify(result), 200
