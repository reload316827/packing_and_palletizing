import json
import os
from datetime import datetime, timezone

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


def _parse_time_or_now(value):
    # 解析时间字符串，不合法则使用当前 UTC 时间
    if value and str(value).strip():
        try:
            # 支持 '2026-03-24T12:00:00+00:00' / '2026-03-24T12:00:00Z'
            text = str(value).strip()
            if text.endswith("Z"):
                text = text[:-1] + "+00:00"
            if len(text) >= 6 and text[-6] in ("+", "-") and text[-3] == ":":
                text = text[:-3] + text[-2:]

            dt = None
            for fmt in (
                "%Y-%m-%dT%H:%M:%S.%f%z",
                "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%d %H:%M:%S.%f%z",
                "%Y-%m-%d %H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%d %H:%M:%S.%f",
                "%Y-%m-%d %H:%M:%S",
            ):
                try:
                    dt = datetime.strptime(text, fmt)
                    break
                except Exception:
                    continue
            if dt is None:
                raise ValueError("unsupported datetime format")
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)
            return dt.replace(microsecond=0).isoformat()
        except Exception:
            pass
    return utc_now_iso()


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


def _detect_box_conflicts(records):
    # 冲突定义：同一 model_code 对应多个 inner_box_spec
    grouped = {}
    for row in records:
        model_code = row.get("model_code")
        inner_box_spec = row.get("inner_box_spec")
        if not model_code:
            continue
        grouped.setdefault(str(model_code), set())
        if inner_box_spec:
            grouped[str(model_code)].add(str(inner_box_spec))

    conflicts = []
    for model_code, specs in grouped.items():
        if len(specs) > 1:
            conflicts.append(
                {
                    "conflict_type": "box_model_conflict",
                    "conflict_key": model_code,
                    "detail": "multiple inner_box_spec found: {0}".format(", ".join(sorted(specs))),
                }
            )
    return conflicts


def _detect_pallet_conflicts(records):
    # 冲突定义：同一 inner_box_code 对应多个 carton_spec_cm 或 pallet_spec_cm
    grouped = {}
    for row in records:
        inner_box_code = row.get("inner_box_code")
        if not inner_box_code:
            continue
        key = str(inner_box_code)
        grouped.setdefault(key, {"carton": set(), "pallet": set()})
        if row.get("carton_spec_cm"):
            grouped[key]["carton"].add(str(row.get("carton_spec_cm")))
        if row.get("pallet_spec_cm"):
            grouped[key]["pallet"].add(str(row.get("pallet_spec_cm")))

    conflicts = []
    for code, spec_map in grouped.items():
        if len(spec_map["carton"]) > 1 or len(spec_map["pallet"]) > 1:
            detail = {
                "carton_specs": sorted(spec_map["carton"]),
                "pallet_specs": sorted(spec_map["pallet"]),
            }
            conflicts.append(
                {
                    "conflict_type": "pallet_inner_conflict",
                    "conflict_key": code,
                    "detail": json.dumps(detail, ensure_ascii=False),
                }
            )
    return conflicts


def _save_conflicts(snapshot_id, conflicts, created_at):
    with get_conn() as conn:
        for item in conflicts:
            conn.execute(
                """
                INSERT INTO rule_snapshot_conflict
                (snapshot_id, conflict_type, conflict_key, detail, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    snapshot_id,
                    item["conflict_type"],
                    item["conflict_key"],
                    item["detail"],
                    created_at,
                ),
            )


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
    normalized_rows = []
    with get_conn() as conn:
        for row in rules:
            model_code = _first_non_empty(row, ["型号", "ZNP编号", "CODE NO.", "model", "编号"])
            inner_box_spec = _first_non_empty(row, ["内盒", "inner_box_spec", "内盒规格"])
            qty_per_carton = _to_int(_first_non_empty(row, ["数量", "qty_per_carton", "一箱总数/只"]))
            gross_weight_kg = _to_float(_first_non_empty(row, ["毛重", "gross_weight_kg", "毛重(kg)"]))

            normalized = {
                "model_code": str(model_code).strip() if model_code is not None else None,
                "inner_box_spec": str(inner_box_spec).strip() if inner_box_spec is not None else None,
                "qty_per_carton": qty_per_carton,
                "gross_weight_kg": gross_weight_kg,
            }
            normalized_rows.append(normalized)

            conn.execute(
                """
                INSERT INTO rule_model_inner_box
                (snapshot_id, model_code, inner_box_spec, qty_per_carton, gross_weight_kg, raw_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot_id,
                    normalized["model_code"],
                    normalized["inner_box_spec"],
                    normalized["qty_per_carton"],
                    normalized["gross_weight_kg"],
                    json.dumps(row, ensure_ascii=False),
                    created_at,
                ),
            )

    conflicts = _detect_box_conflicts(normalized_rows)
    _save_conflicts(snapshot_id, conflicts, created_at)

    return {
        "snapshot_id": snapshot_id,
        "snapshot_type": "box",
        "version": version,
        "record_count": len(rules),
        "conflict_count": len(conflicts),
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
    normalized_rows = []
    with get_conn() as conn:
        for row in rules:
            # 结构化字段用于求解；原始表的全部字段通过 raw_payload 完整保留。
            inner_box_code = _first_non_empty(
                row,
                ["编号", "内盒编号", "inner_box_code", "内盒", "内盒规格", "inner_box_spec"],
            )
            carton_spec_cm = _first_non_empty(
                row,
                ["外箱规格/cm", "外箱规格(cm)", "外箱规格", "carton_spec_cm"],
            )
            pallet_spec_cm = _first_non_empty(
                row,
                ["默认托盘规格/cm", "默认托盘规格(cm)", "默认托盘规格", "pallet_spec_cm"],
            )
            carton_qty = _to_int(
                _first_non_empty(row, ["一箱总数/只", "一箱总数", "carton_qty", "总数", "数量"])
            )
            pallet_carton_qty = _to_int(
                _first_non_empty(row, ["默认规格下一托外箱数", "默认下一托外箱数", "pallet_carton_qty", "每托外箱数"])
            )

            normalized = {
                "inner_box_code": str(inner_box_code).strip() if inner_box_code is not None else None,
                "carton_spec_cm": str(carton_spec_cm).strip() if carton_spec_cm is not None else None,
                "pallet_spec_cm": str(pallet_spec_cm).strip() if pallet_spec_cm is not None else None,
                "carton_qty": carton_qty,
                "pallet_carton_qty": pallet_carton_qty,
            }
            normalized_rows.append(normalized)

            conn.execute(
                """
                INSERT INTO rule_inner_outer_pallet
                (snapshot_id, inner_box_code, carton_spec_cm, pallet_spec_cm, carton_qty, pallet_carton_qty, raw_payload, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot_id,
                    normalized["inner_box_code"],
                    normalized["carton_spec_cm"],
                    normalized["pallet_spec_cm"],
                    normalized["carton_qty"],
                    normalized["pallet_carton_qty"],
                    json.dumps(row, ensure_ascii=False),
                    created_at,
                ),
            )

    conflicts = _detect_pallet_conflicts(normalized_rows)
    _save_conflicts(snapshot_id, conflicts, created_at)

    return {
        "snapshot_id": snapshot_id,
        "snapshot_type": "pallet",
        "version": version,
        "record_count": len(rules),
        "conflict_count": len(conflicts),
    }


def get_snapshot_detail(snapshot_id):
    # 查询快照详情与规则预览
    with get_conn() as conn:
        snapshot = conn.execute(
            "SELECT * FROM rule_snapshot WHERE id = ?",
            (snapshot_id,),
        ).fetchone()
        if not snapshot:
            raise AppError("SNAPSHOT_NOT_FOUND", "snapshot not found: {0}".format(snapshot_id), 404)

        if snapshot["snapshot_type"] == "box":
            rows = conn.execute(
                "SELECT * FROM rule_model_inner_box WHERE snapshot_id = ? ORDER BY id ASC",
                (snapshot_id,),
            ).fetchall()
            preview = [dict(row) for row in rows]
        else:
            rows = conn.execute(
                "SELECT * FROM rule_inner_outer_pallet WHERE snapshot_id = ? ORDER BY id ASC",
                (snapshot_id,),
            ).fetchall()
            preview = []
            for row in rows:
                record = dict(row)
                raw = {}
                try:
                    raw = json.loads(record.get("raw_payload") or "{}")
                except (TypeError, ValueError):
                    raw = {}
                merged = dict(raw)
                merged.update(record)
                preview.append(merged)

    return {
        "snapshot": dict(snapshot),
        "records_preview": preview,
    }


def get_snapshot_conflicts(snapshot_id):
    # 查询快照冲突列表
    with get_conn() as conn:
        snapshot = conn.execute("SELECT * FROM rule_snapshot WHERE id = ?", (snapshot_id,)).fetchone()
        if not snapshot:
            raise AppError("SNAPSHOT_NOT_FOUND", "snapshot not found: {0}".format(snapshot_id), 404)

        rows = conn.execute(
            "SELECT * FROM rule_snapshot_conflict WHERE snapshot_id = ? ORDER BY id ASC",
            (snapshot_id,),
        ).fetchall()
    return {"snapshot_id": snapshot_id, "conflicts": [dict(row) for row in rows]}


def activate_snapshot(snapshot_id, effective_from=None):
    # 激活快照版本（支持生效时间）
    effective_from_iso = _parse_time_or_now(effective_from)
    created_at = utc_now_iso()
    with get_conn() as conn:
        snapshot = conn.execute("SELECT * FROM rule_snapshot WHERE id = ?", (snapshot_id,)).fetchone()
        if not snapshot:
            raise AppError("SNAPSHOT_NOT_FOUND", "snapshot not found: {0}".format(snapshot_id), 404)

        conn.execute(
            """
            INSERT INTO rule_snapshot_activation
            (snapshot_type, snapshot_id, effective_from, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (snapshot["snapshot_type"], snapshot_id, effective_from_iso, created_at),
        )
    return {
        "snapshot_id": snapshot_id,
        "snapshot_type": snapshot["snapshot_type"],
        "effective_from": effective_from_iso,
    }


def get_active_snapshot(snapshot_type, at_time=None):
    # 按时间选择当前生效版本：effective_from <= at_time 的最新一条
    if snapshot_type not in ("box", "pallet"):
        raise AppError("INVALID_SNAPSHOT_TYPE", "snapshot_type must be box or pallet")

    at_time_iso = _parse_time_or_now(at_time)
    with get_conn() as conn:
        activation = conn.execute(
            """
            SELECT *
            FROM rule_snapshot_activation
            WHERE snapshot_type = ? AND effective_from <= ?
            ORDER BY effective_from DESC, id DESC
            LIMIT 1
            """,
            (snapshot_type, at_time_iso),
        ).fetchone()

        if not activation:
            # 若未配置生效时间，回退到该类型最新导入版本，避免计算链路使用空规则全量兜底。
            latest_snapshot = conn.execute(
                """
                SELECT *
                FROM rule_snapshot
                WHERE snapshot_type = ?
                ORDER BY id DESC
                LIMIT 1
                """,
                (snapshot_type,),
            ).fetchone()
            return {
                "snapshot_type": snapshot_type,
                "active_snapshot": dict(latest_snapshot) if latest_snapshot else None,
                "at_time": at_time_iso,
                "activation": None,
                "fallback_latest_snapshot": True if latest_snapshot else False,
            }

        snapshot = conn.execute(
            "SELECT * FROM rule_snapshot WHERE id = ?",
            (activation["snapshot_id"],),
        ).fetchone()

    return {
        "snapshot_type": snapshot_type,
        "at_time": at_time_iso,
        "active_snapshot": dict(snapshot) if snapshot else None,
        "activation": dict(activation),
    }


def get_active_box_rules(at_time=None):
    # 兼容旧调用：仅返回规则行列表。
    return get_active_box_rule_bundle(at_time)["rules"]


def get_active_box_rule_bundle(at_time=None):
    # 读取指定时间点生效的 box 规则及版本信息，供计算链路追溯。
    active = get_active_snapshot("box", at_time)
    snapshot = active.get("active_snapshot")
    if not snapshot:
        return {"snapshot_id": None, "version": None, "rules": []}

    snapshot_id = snapshot["id"]
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT model_code, inner_box_spec, qty_per_carton, gross_weight_kg
            FROM rule_model_inner_box
            WHERE snapshot_id = ?
            """,
            (snapshot_id,),
        ).fetchall()

    return {
        "snapshot_id": snapshot_id,
        "version": snapshot.get("version"),
        "rules": [dict(row) for row in rows],
    }


def get_active_pallet_rule_bundle(at_time=None):
    # 读取指定时间点生效的 pallet 规则及版本信息，供装托链路追溯。
    active = get_active_snapshot("pallet", at_time)
    snapshot = active.get("active_snapshot")
    if not snapshot:
        return {"snapshot_id": None, "version": None, "rules": []}

    snapshot_id = snapshot["id"]
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT inner_box_code, carton_spec_cm, pallet_spec_cm, carton_qty, pallet_carton_qty, raw_payload
            FROM rule_inner_outer_pallet
            WHERE snapshot_id = ?
            """,
            (snapshot_id,),
        ).fetchall()

    full_rules = []
    for row in rows:
        record = dict(row)
        raw = {}
        try:
            raw = json.loads(record.get("raw_payload") or "{}")
        except (TypeError, ValueError):
            raw = {}
        merged = dict(raw)
        merged.update(
            {
                "inner_box_code": record.get("inner_box_code"),
                "carton_spec_cm": record.get("carton_spec_cm"),
                "pallet_spec_cm": record.get("pallet_spec_cm"),
                "carton_qty": record.get("carton_qty"),
                "pallet_carton_qty": record.get("pallet_carton_qty"),
            }
        )
        full_rules.append(merged)

    return {
        "snapshot_id": snapshot_id,
        "version": snapshot.get("version"),
        "rules": full_rules,
    }
