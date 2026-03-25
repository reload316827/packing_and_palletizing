from pathlib import Path

from flask import Blueprint, jsonify, request

from core.db import PROJECT_ROOT
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
