from flask import Blueprint, jsonify, request

from core.errors import AppError
from services.rule_snapshot_service import (
    get_snapshot_detail,
    import_box_rules_to_snapshot,
    import_pallet_rules_to_snapshot,
)

rules_bp = Blueprint("rules", __name__, url_prefix="/api/rules")


def _error_response(err):
    return jsonify(err.to_dict()), err.http_status


@rules_bp.route("/box/import", methods=["POST"])
def import_box_rules():
    # 导入型号-内盒规则并生成快照
    payload = request.get_json(silent=True) or {}
    file_path = payload.get("file_path")
    try:
        result = import_box_rules_to_snapshot(file_path)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 201


@rules_bp.route("/pallet/import", methods=["POST"])
def import_pallet_rules():
    # 导入托盘规则并生成快照
    payload = request.get_json(silent=True) or {}
    file_path = payload.get("file_path")
    try:
        result = import_pallet_rules_to_snapshot(file_path)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 201


@rules_bp.route("/snapshots/<int:snapshot_id>", methods=["GET"])
def get_snapshot(snapshot_id):
    # 查询规则快照详情
    try:
        result = get_snapshot_detail(snapshot_id)
    except AppError as err:
        return _error_response(err)
    return jsonify(result), 200
