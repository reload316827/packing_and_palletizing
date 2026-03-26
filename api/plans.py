import json
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file

from core.db import PROJECT_ROOT, get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso
from jobs.plan_calculate import calculate_plan, enqueue_plan_calculation
from services.exporter import export_plan_excel
from services.import_loader import parse_import_template_to_plan_payload
from services.rule_snapshot_service import get_active_box_rule_bundle

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


def _insert_plan_with_orders(conn, payload, created_at, actor):
    orders = payload.get("orders") or []
    cursor = conn.execute(
        """
        INSERT INTO shipment_plan
        (customer_code, ship_date, merge_mode, status, source_payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(payload["customer_code"]).strip(),
            str(payload["ship_date"]).strip(),
            str(payload.get("merge_mode", "NO_MERGE")).strip() or "NO_MERGE",
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
        actor=actor,
    )
    return plan_id


def _ensure_active_box_snapshot(conn, now):
    # 读取当前生效的箱规快照；若不存在则创建手工同步快照并立即生效
    activation = conn.execute(
        """
        SELECT rsa.snapshot_id
        FROM rule_snapshot_activation rsa
        JOIN rule_snapshot rs ON rs.id = rsa.snapshot_id
        WHERE rsa.snapshot_type = 'box' AND rs.snapshot_type = 'box' AND rsa.effective_from <= ?
        ORDER BY rsa.effective_from DESC, rsa.id DESC
        LIMIT 1
        """,
        (now,),
    ).fetchone()
    if activation:
        return int(activation["snapshot_id"])

    latest = conn.execute(
        """
        SELECT id
        FROM rule_snapshot
        WHERE snapshot_type = 'box'
        ORDER BY id DESC
        LIMIT 1
        """
    ).fetchone()
    if latest:
        return int(latest["id"])

    version = "manual_sync_{0}".format(now.replace("-", "").replace(":", "").replace(".", ""))
    snapshot_id = conn.execute(
        """
        INSERT INTO rule_snapshot
        (snapshot_type, source_file, version, record_count, payload_preview, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        ("box", "manual_missing_data", version, 0, "{}", now),
    ).lastrowid
    conn.execute(
        """
        INSERT INTO rule_snapshot_activation
        (snapshot_type, snapshot_id, effective_from, created_at)
        VALUES (?, ?, ?, ?)
        """,
        ("box", snapshot_id, now, now),
    )
    return int(snapshot_id)


def _sync_manual_rules_to_rule_page(conn, rules, now):
    # 将详情页补录同步到规则页使用的箱规快照：同型号更新，不存在新增
    snapshot_id = _ensure_active_box_snapshot(conn, now)
    synced = 0
    for row in rules:
        model_code = str((row or {}).get("model_code") or "").strip()
        inner_box_spec = str((row or {}).get("inner_box_spec") or "").strip()
        if not model_code or not inner_box_spec:
            continue

        qty_per_carton = row.get("qty_per_carton")
        gross_weight_kg = row.get("gross_weight_kg")
        try:
            qty_per_carton = int(float(str(qty_per_carton))) if qty_per_carton not in (None, "") else None
        except (TypeError, ValueError):
            qty_per_carton = None
        try:
            gross_weight_kg = float(str(gross_weight_kg)) if gross_weight_kg not in (None, "") else None
        except (TypeError, ValueError):
            gross_weight_kg = None

        raw_payload = json.dumps(
            {
                "model_code": model_code,
                "inner_box_spec": inner_box_spec,
                "qty_per_carton": qty_per_carton,
                "gross_weight_kg": gross_weight_kg,
                "sync_source": "plan_missing_data",
                "sync_at": now,
            },
            ensure_ascii=False,
        )
        existing = conn.execute(
            """
            SELECT id
            FROM rule_model_inner_box
            WHERE snapshot_id = ? AND model_code = ?
            ORDER BY id ASC
            LIMIT 1
            """,
            (snapshot_id, model_code),
        ).fetchone()

        if existing:
            conn.execute(
                """
                UPDATE rule_model_inner_box
                SET inner_box_spec = ?, qty_per_carton = ?, gross_weight_kg = ?, raw_payload = ?
                WHERE id = ? AND snapshot_id = ?
                """,
                (inner_box_spec, qty_per_carton, gross_weight_kg, raw_payload, existing["id"], snapshot_id),
            )
        else:
            conn.execute(
                """
                INSERT INTO rule_model_inner_box
                (snapshot_id, model_code, inner_box_spec, qty_per_carton, gross_weight_kg, raw_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (snapshot_id, model_code, inner_box_spec, qty_per_carton, gross_weight_kg, raw_payload, now),
            )
        synced += 1

    # 同步后刷新快照记录数，避免规则页统计与数据不一致
    count_row = conn.execute(
        "SELECT COUNT(1) AS cnt FROM rule_model_inner_box WHERE snapshot_id = ?",
        (snapshot_id,),
    ).fetchone()
    count_value = int(count_row["cnt"] if count_row else 0)
    conn.execute(
        "UPDATE rule_snapshot SET record_count = ? WHERE id = ?",
        (count_value, snapshot_id),
    )
    return {"snapshot_id": snapshot_id, "synced_count": synced}


def _get_plan_models(conn, plan_id):
    return set(_get_plan_model_stats(conn, plan_id).keys())


def _get_plan_model_stats(conn, plan_id):
    rows = conn.execute(
        "SELECT line_payload FROM shipment_plan_order WHERE plan_id = ?",
        (plan_id,),
    ).fetchall()
    stats = {}
    for row in rows:
        payload = json.loads(row["line_payload"] or "{}")
        model_code = str(payload.get("model") or payload.get("model_code") or "").strip()
        if model_code:
            qty_value = payload.get("qty") or payload.get("quantity") or 0
            try:
                qty = int(float(str(qty_value)))
            except (TypeError, ValueError):
                qty = 0
            info = stats.setdefault(model_code, {"qty": 0, "line_count": 0})
            info["qty"] += max(0, qty)
            info["line_count"] += 1
    return stats


def _get_manual_models(conn, plan_id):
    rows = conn.execute(
        """
        SELECT model_code, inner_box_spec, qty_per_carton, gross_weight_kg
        FROM plan_manual_box_rule
        WHERE plan_id = ?
        """,
        (plan_id,),
    ).fetchall()
    complete = set()
    incomplete = set()
    for row in rows:
        model_code = str(row["model_code"] or "").strip()
        if not model_code:
            continue
        if _is_complete_box_rule(row):
            complete.add(model_code)
        else:
            incomplete.add(model_code)
    return complete, incomplete


def _to_positive_float(value):
    try:
        text = str(value or "").strip().replace(",", "")
        if not text:
            return None
        num = float(text)
        return num if num > 0 else None
    except (TypeError, ValueError):
        return None


def _row_get(row, key):
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(key)
    try:
        return row[key]
    except Exception:
        return None


def _is_complete_box_rule(row):
    # 新口径：缺少内盒或毛重任一关键字段，都视为“规则不完整”。
    if not row:
        return False
    inner_box_spec = str(_row_get(row, "inner_box_spec") or "").strip()
    gross_weight_kg = _to_positive_float(_row_get(row, "gross_weight_kg"))
    return bool(inner_box_spec) and gross_weight_kg is not None


def _split_active_rule_coverage(ship_date):
    active_rules = get_active_box_rule_bundle(ship_date).get("rules") or []
    active_complete = set()
    active_incomplete = set()
    for row in active_rules:
        model_code = str((row or {}).get("model_code") or "").strip()
        if not model_code:
            continue
        if _is_complete_box_rule(row):
            active_complete.add(model_code)
        else:
            active_incomplete.add(model_code)
    return active_complete, active_incomplete


def _calc_missing_models(conn, plan_id, ship_date, active_coverage=None):
    order_models = _get_plan_models(conn, plan_id)
    if not order_models:
        return []

    if active_coverage is None:
        active_complete, active_incomplete = _split_active_rule_coverage(ship_date)
    else:
        active_complete, active_incomplete = active_coverage

    manual_complete, manual_incomplete = _get_manual_models(conn, plan_id)
    covered_complete = active_complete.union(manual_complete)
    covered_incomplete = active_incomplete.union(manual_incomplete)
    return sorted(model for model in order_models if model not in covered_complete or model in (covered_incomplete - covered_complete))


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
        active_coverage_cache = {}
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
            ship_date = str(plan.get("ship_date") or "")
            if ship_date not in active_coverage_cache:
                active_coverage_cache[ship_date] = _split_active_rule_coverage(ship_date)
            missing_models = _calc_missing_models(conn, plan["id"], ship_date, active_coverage_cache[ship_date])
            plan["missing_model_count"] = len(missing_models)
            plan["has_missing_data"] = True if missing_models else False
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
    actor = str(payload.get("actor") or "system")
    with get_conn() as conn:
        plan_id = _insert_plan_with_orders(conn, payload, created_at, actor)
        row = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()

    return jsonify({"plan": _row_to_dict(row)}), 201


@plans_bp.route("/import", methods=["POST"])
def import_plan_and_calculate():
    # 上传导入模板并自动创建计划 + 同步计算 3 套方案
    try:
        file_name, file_path = _save_uploaded_plan_file()
        parsed = parse_import_template_to_plan_payload(file_path)
        payload = parsed["payload"]
        _validate_plan_payload(payload)
    except AppError as err:
        return _error_response(err)

    orders = payload.get("orders") or []
    if not isinstance(orders, list):
        return _error_response(AppError("INVALID_ORDERS", "orders must be an array"))
    if not orders:
        return _error_response(AppError("EMPTY_ORDERS", "no valid orders found in import template"))

    actor = str(request.form.get("actor") or "web_user")
    created_at = utc_now_iso()
    with get_conn() as conn:
        plan_id = _insert_plan_with_orders(conn, payload, created_at, actor)
        row = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()

    try:
        calc_result = calculate_plan(plan_id)
    except AppError as err:
        return _error_response(err)

    with get_conn() as conn:
        refreshed = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()

    return (
        jsonify(
            {
                "plan": _row_to_dict(refreshed or row),
                "calculate": calc_result,
                "import_meta": {
                    "file_name": file_name,
                    "file_path": file_path,
                    "sheet_name": parsed.get("sheet_name"),
                    "order_count": int(parsed.get("order_count") or 0),
                },
            }
        ),
        201,
    )


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

    with get_conn() as conn:
        missing_models = _calc_missing_models(conn, plan_id, plan["ship_date"])

    plan_data = _row_to_dict(plan)
    plan_data["missing_model_count"] = len(missing_models)
    plan_data["has_missing_data"] = True if missing_models else False

    return jsonify(
        {
            "plan": plan_data,
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
    if request.files:
        try:
            file_name, file_path = _save_uploaded_override_file()
        except AppError as err:
            return _error_response(err)
        note = str(request.form.get("note") or "").strip() or None
        actor = str(request.form.get("actor") or "system")
    else:
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


@plans_bp.route("/<int:plan_id>/export", methods=["POST"])
def export_plan(plan_id):
    # 导出当前任务方案 Excel（默认最终方案，否则取排名第一方案）
    payload = request.get_json(silent=True) or {}
    solution_id = payload.get("solution_id")
    template_path = str(payload.get("template_path") or "").strip() or None
    output_dir = str(payload.get("output_dir") or "").strip() or None

    if solution_id not in (None, ""):
        try:
            solution_id = int(solution_id)
        except (TypeError, ValueError):
            return _error_response(AppError("INVALID_SOLUTION_ID", "solution_id must be integer"))
    else:
        solution_id = None

    try:
        result = export_plan_excel(
            plan_id=plan_id,
            solution_id=solution_id,
            template_path=template_path,
            output_dir=output_dir,
        )
    except AppError as err:
        return _error_response(err)

    return send_file(
        result["file_path"],
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
    )


@plans_bp.route("/<int:plan_id>/missing-data", methods=["GET"])
def get_plan_missing_data(plan_id):
    with get_conn() as conn:
        plan = conn.execute("SELECT * FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            return _error_response(AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404))

        model_stats = _get_plan_model_stats(conn, plan_id)
        missing_models = _calc_missing_models(conn, plan_id, plan["ship_date"])
        manual_rows = conn.execute(
            """
            SELECT model_code, inner_box_spec, qty_per_carton, gross_weight_kg, note, updated_at
            FROM plan_manual_box_rule
            WHERE plan_id = ?
            ORDER BY model_code ASC
            """,
            (plan_id,),
        ).fetchall()

    return jsonify(
        {
            "plan_id": plan_id,
            "missing_models": missing_models,
            "missing_details": [
                {
                    "model_code": model_code,
                    "line_count": int((model_stats.get(model_code) or {}).get("line_count") or 0),
                    "qty": int((model_stats.get(model_code) or {}).get("qty") or 0),
                }
                for model_code in missing_models
            ],
            "manual_rules": [dict(row) for row in manual_rows],
            "has_missing_data": True if missing_models else False,
        }
    ), 200


@plans_bp.route("/<int:plan_id>/missing-data", methods=["POST"])
def save_plan_manual_rule(plan_id):
    payload = request.get_json(silent=True) or {}
    rules = payload.get("box_rules") or []
    if not isinstance(rules, list) or not rules:
        return _error_response(AppError("INVALID_RULES", "box_rules must be a non-empty array"))

    now = utc_now_iso()
    with get_conn() as conn:
        plan = conn.execute("SELECT id FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        if not plan:
            return _error_response(AppError("PLAN_NOT_FOUND", "plan not found: {0}".format(plan_id), 404))

        saved = 0
        for row in rules:
            model_code = str((row or {}).get("model_code") or "").strip()
            inner_box_spec = str((row or {}).get("inner_box_spec") or "").strip()
            if not model_code or not inner_box_spec:
                continue
            # 新口径不再收集一箱总数，统一置空保留兼容
            qty_per_carton = None
            gross_weight_kg = row.get("gross_weight_kg")
            note = str((row or {}).get("note") or "").strip() or None
            try:
                gross_weight_kg = float(str(gross_weight_kg)) if gross_weight_kg not in (None, "") else None
            except (TypeError, ValueError):
                gross_weight_kg = None

            updated = conn.execute(
                """
                UPDATE plan_manual_box_rule
                SET inner_box_spec = ?, qty_per_carton = ?, gross_weight_kg = ?, note = ?, updated_at = ?
                WHERE plan_id = ? AND model_code = ?
                """,
                (
                    inner_box_spec,
                    qty_per_carton,
                    gross_weight_kg,
                    note,
                    now,
                    plan_id,
                    model_code,
                ),
            ).rowcount
            if not updated:
                conn.execute(
                    """
                    INSERT INTO plan_manual_box_rule
                    (plan_id, model_code, inner_box_spec, qty_per_carton, gross_weight_kg, note, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        plan_id,
                        model_code,
                        inner_box_spec,
                        qty_per_carton,
                        gross_weight_kg,
                        note,
                        now,
                        now,
                    ),
                )
            saved += 1
        sync_result = _sync_manual_rules_to_rule_page(conn, rules, now)

    with get_conn() as conn:
        plan = conn.execute("SELECT ship_date FROM shipment_plan WHERE id = ?", (plan_id,)).fetchone()
        remaining = _calc_missing_models(conn, plan_id, plan["ship_date"]) if plan else []

    return (
        jsonify(
            {
                "plan_id": plan_id,
                "saved_count": saved,
                "remaining_missing_models": remaining,
                "rule_sync": sync_result,
            }
        ),
        200,
    )


def _safe_file_name(name):
    invalid = set('\\/:*?"<>|')
    return "".join(ch if ch not in invalid else "_" for ch in str(name or "").strip())


def _save_uploaded_override_file():
    file = request.files.get("file")
    if not file or not str(file.filename or "").strip():
        raise AppError("MISSING_UPLOAD_FILE", "file is required in multipart/form-data")

    origin_name = _safe_file_name(file.filename)
    timestamp = utc_now_iso().replace("-", "").replace(":", "").replace(".", "")
    upload_dir = PROJECT_ROOT / "output" / "uploads" / "override"
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved_name = "{0}_{1}".format(timestamp, origin_name or "override.xlsx")
    saved_path = upload_dir / saved_name
    file.save(str(saved_path))
    return (origin_name or saved_name), str(saved_path)


def _save_uploaded_plan_file():
    file = request.files.get("file")
    if not file or not str(file.filename or "").strip():
        raise AppError("MISSING_UPLOAD_FILE", "file is required in multipart/form-data")

    origin_name = _safe_file_name(file.filename)
    suffix = Path(origin_name).suffix.lower()
    if suffix != ".xlsx":
        raise AppError("INVALID_FILE_TYPE", "only .xlsx is supported for order import")

    timestamp = utc_now_iso().replace("-", "").replace(":", "").replace(".", "")
    upload_dir = PROJECT_ROOT / "output" / "uploads" / "plans"
    upload_dir.mkdir(parents=True, exist_ok=True)
    saved_name = "{0}_{1}".format(timestamp, origin_name or "orders.xlsx")
    saved_path = upload_dir / saved_name
    file.save(str(saved_path))
    return (origin_name or saved_name), str(saved_path)
