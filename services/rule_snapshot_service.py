import json
import os

from core.db import get_conn
from core.errors import AppError
from core.time_utils import utc_now_iso
from services.rule_loader_box import load_box_rules
from services.rule_loader_pallet import load_pallet_rules


def _first_non_empty(record, keys):
    for key in keys:
        value = record.get(key)
        if value is not None and str(value).strip():
            return value
    return None


def _to_int(value, default_value=None):
    if value is None:
        return default_value
    try:
        text = str(value).strip().replace(",", "")
        if not text:
            return default_value
        return int(float(text))
    except (TypeError, ValueError):
        return default_value


def _to_float(value, default_value=None):
    if value is None:
        return default_value
    try:
        text = str(value).strip().replace(",", "")
        if not text:
            return default_value
        return float(text)
    except (TypeError, ValueError):
        return default_value


def _insert_snapshot(snapshot_type, source_file, rules):
    created_at = utc_now_iso()
    version = "{0}_{1}".format(snapshot_type, created_at.replace(":", "").replace("-", ""))
    preview = json.dumps(rules[:3], ensure_ascii=False)

    with get_conn() as conn:
        cursor = conn.execute(
            """
            INSERT INTO rule_snapshot
            (snapshot_type, source_file, version, record_count, payload_preview, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (snapshot_type, source_file, version, len(rules), preview, created_at),
        )
        snapshot_id = cursor.lastrowid

    return snapshot_id, version, created_at


def import_box_rules_to_snapshot(file_path):
    # 导入“型号-内盒”规则并写入快照
    if not file_path or not str(file_path).strip():
        raise AppError("MISSING_FILE_PATH", "file_path is required")
    file_path = str(file_path).strip()
    if not os.path.exists(file_path):
        raise AppError("RULE_FILE_NOT_FOUND", "rule file not found: {0}".format(file_path), 404)

    try:
        rules = load_box_rules(file_path)
    except Exception as err:
        raise AppError("RULE_PARSE_FAILED", "box rule parse failed", 422, str(err))

    snapshot_id, version, created_at = _insert_snapshot("box", file_path, rules)
    with get_conn() as conn:
        for row in rules:
            model_code = _first_non_empty(row, ["型号", "ZNP编号", "CODE NO.", "model", "编号"])
            inner_box_spec = _first_non_empty(row, ["内盒", "inner_box_spec", "内盒规格"])
            qty_per_carton = _to_int(_first_non_empty(row, ["数量", "qty_per_carton", "一箱总数/只"]))
            gross_weight_kg = _to_float(_first_non_empty(row, ["毛重", "gross_weight_kg", "毛重(kg)"]))

            conn.execute(
                """
                INSERT INTO rule_model_inner_box
                (snapshot_id, model_code, inner_box_spec, qty_per_carton, gross_weight_kg, raw_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot_id,
                    str(model_code).strip() if model_code is not None else None,
                    str(inner_box_spec).strip() if inner_box_spec is not None else None,
                    qty_per_carton,
                    gross_weight_kg,
                    json.dumps(row, ensure_ascii=False),
                    created_at,
                ),
            )

    return {
        "snapshot_id": snapshot_id,
        "snapshot_type": "box",
        "version": version,
        "record_count": len(rules),
    }


def import_pallet_rules_to_snapshot(file_path):
    # 导入“内盒-外箱-托盘”规则并写入快照
    if not file_path or not str(file_path).strip():
        raise AppError("MISSING_FILE_PATH", "file_path is required")
    file_path = str(file_path).strip()
    if not os.path.exists(file_path):
        raise AppError("RULE_FILE_NOT_FOUND", "rule file not found: {0}".format(file_path), 404)

    try:
        rules = load_pallet_rules(file_path)
    except Exception as err:
        raise AppError("RULE_PARSE_FAILED", "pallet rule parse failed", 422, str(err))

    snapshot_id, version, created_at = _insert_snapshot("pallet", file_path, rules)
    with get_conn() as conn:
        for row in rules:
            inner_box_code = _first_non_empty(row, ["编号", "inner_box_code", "内盒编号"])
            carton_spec_cm = _first_non_empty(row, ["外箱规格/cm", "carton_spec_cm", "外箱规格"])
            pallet_spec_cm = _first_non_empty(row, ["默认托盘规格/cm", "pallet_spec_cm"])
            carton_qty = _to_int(_first_non_empty(row, ["一箱总数/只", "carton_qty", "总数"]))
            pallet_carton_qty = _to_int(_first_non_empty(row, ["默认规格下一托外箱数", "pallet_carton_qty"]))

            conn.execute(
                """
                INSERT INTO rule_inner_outer_pallet
                (snapshot_id, inner_box_code, carton_spec_cm, pallet_spec_cm, carton_qty, pallet_carton_qty, raw_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot_id,
                    str(inner_box_code).strip() if inner_box_code is not None else None,
                    str(carton_spec_cm).strip() if carton_spec_cm is not None else None,
                    str(pallet_spec_cm).strip() if pallet_spec_cm is not None else None,
                    carton_qty,
                    pallet_carton_qty,
                    json.dumps(row, ensure_ascii=False),
                    created_at,
                ),
            )

    return {
        "snapshot_id": snapshot_id,
        "snapshot_type": "pallet",
        "version": version,
        "record_count": len(rules),
    }


def get_snapshot_detail(snapshot_id):
    # 查询快照详情与预览
    with get_conn() as conn:
        snapshot = conn.execute(
            "SELECT * FROM rule_snapshot WHERE id = ?",
            (snapshot_id,),
        ).fetchone()
        if not snapshot:
            raise AppError("SNAPSHOT_NOT_FOUND", "snapshot not found: {0}".format(snapshot_id), 404)

        if snapshot["snapshot_type"] == "box":
            rows = conn.execute(
                "SELECT * FROM rule_model_inner_box WHERE snapshot_id = ? ORDER BY id ASC LIMIT 50",
                (snapshot_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM rule_inner_outer_pallet WHERE snapshot_id = ? ORDER BY id ASC LIMIT 50",
                (snapshot_id,),
            ).fetchall()

    return {
        "snapshot": dict(snapshot),
        "records_preview": [dict(row) for row in rows],
    }
