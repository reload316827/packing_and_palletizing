from pathlib import Path
import json

from flask import Blueprint, jsonify, request

from core.db import PROJECT_ROOT, get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso
from services.rule_snapshot_service import (
    activate_snapshot,
    get_active_snapshot,
    get_snapshot_conflicts,
    get_snapshot_detail,
    import_box_rules_to_snapshot,
    import_pallet_rules_to_snapshot,
)

rules_bp = Blueprint("rules", __name__, url_prefix="/api/rules")


def _error_response(err):
    return jsonify(err.to_dict()), err.http_status


def _to_int_or_none(value):
    try:
        text = str(value if value is not None else "").strip().replace(",", "")
        if text == "":
            return None
        return int(float(text))
    except (TypeError, ValueError):
        return None


def _to_float_or_none(value):
    try:
        text = str(value if value is not None else "").strip().replace(",", "")
        if text == "":
            return None
        return float(text)
    except (TypeError, ValueError):
        return None


def _safe_file_name(name):
    invalid = set('\\/:*?"<>|')
    return "".join(ch if ch not in invalid else "_" for ch in str(name or "").strip())


def _save_uploaded_rule_file(prefix):
    file = request.files.get("file")
    if not file or not str(file.filename or "").strip():
        raise AppError("MISSING_UPLOAD_FILE", "file is required in multipart/form-data")

    original_name = _safe_file_name(file.filename)
    suffix = Path(original_name).suffix.lower()
    if suffix not in (".xlsx", ".xls"):
        raise AppError("INVALID_FILE_TYPE", "only .xlsx/.xls is supported")

    timestamp = utc_now_iso().replace("-", "").replace(":", "").replace(".", "")
    upload_dir = PROJECT_ROOT / "output" / "uploads" / "rules"
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = "{0}_{1}_{2}".format(prefix, timestamp, original_name or "rule.xlsx")
    file_path = upload_dir / stored_name
    file.save(str(file_path))
    return str(file_path)


def _resolve_import_file_path(prefix):
    payload = request.get_json(silent=True) or {}
    file_path = payload.get("file_path")
    if file_path and str(file_path).strip():
        return str(file_path).strip()
    return _save_uploaded_rule_file(prefix)


@rules_bp.route("/box/import", methods=["POST"])
def import_box_rules():
    # 支持两种导入：JSON file_path / multipart 文件上传
    try:
        file_path = _resolve_import_file_path("box")
        result = import_box_rules_to_snapshot(file_path)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 201


@rules_bp.route("/pallet/import", methods=["POST"])
def import_pallet_rules():
    # 支持两种导入：JSON file_path / multipart 文件上传
    try:
        file_path = _resolve_import_file_path("pallet")
        result = import_pallet_rules_to_snapshot(file_path)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 201


@rules_bp.route("/snapshots/<int:snapshot_id>", methods=["GET"])
def get_snapshot(snapshot_id):
    try:
        result = get_snapshot_detail(snapshot_id)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 200


@rules_bp.route("/snapshots/<int:snapshot_id>/conflicts", methods=["GET"])
def get_snapshot_conflict_list(snapshot_id):
    try:
        result = get_snapshot_conflicts(snapshot_id)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 200


@rules_bp.route("/snapshots/<int:snapshot_id>/activate", methods=["POST"])
def activate_snapshot_version(snapshot_id):
    payload = request.get_json(silent=True) or {}
    effective_from = payload.get("effective_from")
    try:
        result = activate_snapshot(snapshot_id, effective_from)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 200


@rules_bp.route("/active", methods=["GET"])
def get_active_snapshot_version():
    snapshot_type = request.args.get("snapshot_type")
    at_time = request.args.get("at")
    try:
        result = get_active_snapshot(snapshot_type, at_time)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 200


@rules_bp.route("/active/record", methods=["PUT"])
def update_active_rule_record():
    payload = request.get_json(silent=True) or {}
    snapshot_type = str(payload.get("snapshot_type") or "").strip()
    record_id = payload.get("record_id")
    updates = payload.get("updates") or {}
    snapshot_id = payload.get("snapshot_id")

    if snapshot_type not in ("box", "pallet"):
        return _error_response(AppError("INVALID_SNAPSHOT_TYPE", "snapshot_type must be box or pallet"))
    if not isinstance(updates, dict) or not updates:
        return _error_response(AppError("INVALID_UPDATES", "updates must be a non-empty object"))
    try:
        record_id = int(record_id)
    except (TypeError, ValueError):
        return _error_response(AppError("INVALID_RECORD_ID", "record_id must be integer"))

    try:
        active = get_active_snapshot(snapshot_type, None)
    except AppError as err:
        return _error_response(err)

    active_snapshot = active.get("active_snapshot")
    if snapshot_id is None:
        snapshot_id = (active_snapshot or {}).get("id")
    try:
        snapshot_id = int(snapshot_id)
    except (TypeError, ValueError):
        return _error_response(AppError("INVALID_SNAPSHOT_ID", "snapshot_id must be integer"))

    with get_conn() as conn:
        snapshot = conn.execute(
            "SELECT id, snapshot_type FROM rule_snapshot WHERE id = ?",
            (snapshot_id,),
        ).fetchone()
        if not snapshot:
            return _error_response(AppError("SNAPSHOT_NOT_FOUND", "snapshot not found: {0}".format(snapshot_id), 404))
        if snapshot["snapshot_type"] != snapshot_type:
            return _error_response(AppError("SNAPSHOT_TYPE_MISMATCH", "snapshot_type mismatch"))

        if snapshot_type == "box":
            row = conn.execute(
                "SELECT * FROM rule_model_inner_box WHERE id = ? AND snapshot_id = ?",
                (record_id, snapshot_id),
            ).fetchone()
            if not row:
                return _error_response(AppError("RULE_RECORD_NOT_FOUND", "record not found", 404))

            model_code = str(updates.get("model_code") if "model_code" in updates else row["model_code"] or "").strip() or None
            inner_box_spec = str(updates.get("inner_box_spec") if "inner_box_spec" in updates else row["inner_box_spec"] or "").strip() or None
            qty_per_carton = _to_int_or_none(updates.get("qty_per_carton")) if "qty_per_carton" in updates else row["qty_per_carton"]
            gross_weight_kg = _to_float_or_none(updates.get("gross_weight_kg")) if "gross_weight_kg" in updates else row["gross_weight_kg"]

            raw = {}
            try:
                raw = json.loads(row["raw_payload"] or "{}")
            except (TypeError, ValueError):
                raw = {}
            raw.update(
                {
                    "model_code": model_code,
                    "inner_box_spec": inner_box_spec,
                    "qty_per_carton": qty_per_carton,
                    "gross_weight_kg": gross_weight_kg,
                }
            )

            conn.execute(
                """
                UPDATE rule_model_inner_box
                SET model_code = ?, inner_box_spec = ?, qty_per_carton = ?, gross_weight_kg = ?, raw_payload = ?
                WHERE id = ? AND snapshot_id = ?
                """,
                (
                    model_code,
                    inner_box_spec,
                    qty_per_carton,
                    gross_weight_kg,
                    json.dumps(raw, ensure_ascii=False),
                    record_id,
                    snapshot_id,
                ),
            )
            updated = conn.execute(
                "SELECT * FROM rule_model_inner_box WHERE id = ? AND snapshot_id = ?",
                (record_id, snapshot_id),
            ).fetchone()
            return jsonify({"snapshot_id": snapshot_id, "record": dict(updated)}), 200

        row = conn.execute(
            "SELECT * FROM rule_inner_outer_pallet WHERE id = ? AND snapshot_id = ?",
            (record_id, snapshot_id),
        ).fetchone()
        if not row:
            return _error_response(AppError("RULE_RECORD_NOT_FOUND", "record not found", 404))

        key_alias = {
            "编号": "inner_box_code",
            "内盒编号": "inner_box_code",
            "inner_box_code": "inner_box_code",
            "外箱规格/cm": "carton_spec_cm",
            "外箱规格(cm)": "carton_spec_cm",
            "外箱规格": "carton_spec_cm",
            "carton_spec_cm": "carton_spec_cm",
            "默认托盘规格/cm": "pallet_spec_cm",
            "默认托盘规格(cm)": "pallet_spec_cm",
            "默认托盘规格": "pallet_spec_cm",
            "pallet_spec_cm": "pallet_spec_cm",
            "一箱总数/只": "carton_qty",
            "一箱总数": "carton_qty",
            "carton_qty": "carton_qty",
            "默认规格下一托外箱数": "pallet_carton_qty",
            "默认下一托外箱数": "pallet_carton_qty",
            "pallet_carton_qty": "pallet_carton_qty",
        }

        normalized = {
            "inner_box_code": row["inner_box_code"],
            "carton_spec_cm": row["carton_spec_cm"],
            "pallet_spec_cm": row["pallet_spec_cm"],
            "carton_qty": row["carton_qty"],
            "pallet_carton_qty": row["pallet_carton_qty"],
        }
        raw = {}
        try:
            raw = json.loads(row["raw_payload"] or "{}")
        except (TypeError, ValueError):
            raw = {}

        for key, value in updates.items():
            raw[key] = value
            canonical = key_alias.get(str(key))
            if canonical == "inner_box_code":
                normalized["inner_box_code"] = str(value if value is not None else "").strip() or None
            elif canonical == "carton_spec_cm":
                normalized["carton_spec_cm"] = str(value if value is not None else "").strip() or None
            elif canonical == "pallet_spec_cm":
                normalized["pallet_spec_cm"] = str(value if value is not None else "").strip() or None
            elif canonical == "carton_qty":
                normalized["carton_qty"] = _to_int_or_none(value)
            elif canonical == "pallet_carton_qty":
                normalized["pallet_carton_qty"] = _to_int_or_none(value)

        conn.execute(
            """
            UPDATE rule_inner_outer_pallet
            SET inner_box_code = ?, carton_spec_cm = ?, pallet_spec_cm = ?, carton_qty = ?, pallet_carton_qty = ?, raw_payload = ?
            WHERE id = ? AND snapshot_id = ?
            """,
            (
                normalized["inner_box_code"],
                normalized["carton_spec_cm"],
                normalized["pallet_spec_cm"],
                normalized["carton_qty"],
                normalized["pallet_carton_qty"],
                json.dumps(raw, ensure_ascii=False),
                record_id,
                snapshot_id,
            ),
        )
        updated = conn.execute(
            "SELECT * FROM rule_inner_outer_pallet WHERE id = ? AND snapshot_id = ?",
            (record_id, snapshot_id),
        ).fetchone()
        merged = dict(updated)
        try:
            merged_raw = json.loads(merged.get("raw_payload") or "{}")
        except (TypeError, ValueError):
            merged_raw = {}
        merged_raw.update(
            {
                "inner_box_code": merged.get("inner_box_code"),
                "carton_spec_cm": merged.get("carton_spec_cm"),
                "pallet_spec_cm": merged.get("pallet_spec_cm"),
                "carton_qty": merged.get("carton_qty"),
                "pallet_carton_qty": merged.get("pallet_carton_qty"),
            }
        )
        merged_all = dict(merged_raw)
        merged_all.update(merged)
        merged = merged_all
        return jsonify({"snapshot_id": snapshot_id, "record": merged}), 200
