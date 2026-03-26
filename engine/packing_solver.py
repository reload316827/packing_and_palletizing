from collections import defaultdict
from typing import Any


def _safe_int(value: Any, default_value: int) -> int:
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return default_value


def _safe_float(value: Any, default_value: float) -> float:
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return default_value


def _safe_bool(value: Any, default_value: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default_value
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "是", "允许"}:
        return True
    if text in {"0", "false", "no", "n", "否", "不允许"}:
        return False
    return default_value


def _pick_first(data: dict, keys, default_value=None):
    for key in keys:
        if key in data and data.get(key) is not None and str(data.get(key)).strip() != "":
            return data.get(key)
    return default_value


def _build_rule_index(rules):
    """按型号构建规则索引，便于装箱时快速匹配。"""
    index = {}
    for item in rules or []:
        model_code = _pick_first(item, ["model_code", "型号", "ZNP编号"])
        if not model_code:
            continue

        qty_per_carton = _safe_int(
            _pick_first(item, ["qty_per_carton", "数量", "一箱总数/只"]),
            0,
        )
        capacity_options_raw = item.get("capacity_options") or []
        qty_options_raw = item.get("qty_options") or [opt.get("qty") for opt in capacity_options_raw if isinstance(opt, dict)]
        qty_options = []
        for option in qty_options_raw:
            value = _safe_int(option, 0)
            if value > 0 and value not in qty_options:
                qty_options.append(value)
        qty_options.sort()
        package_weight_by_qty = {}
        for opt in capacity_options_raw:
            if not isinstance(opt, dict):
                continue
            opt_qty = _safe_int(opt.get("qty"), 0)
            if opt_qty <= 0:
                continue
            package_weight_by_qty[str(opt_qty)] = max(0.0, _safe_float(opt.get("package_weight_kg"), 0.0))
        gross_weight_kg = _safe_float(
            _pick_first(item, ["gross_weight_kg", "毛重", "毛重/kg"]),
            0.5,
        )
        # 型号-内盒规则中的毛重字段按“只重/kg”使用
        unit_weight_kg = max(0.001, gross_weight_kg)

        allow_side_place = _safe_bool(
            _pick_first(item, ["allow_side_place", "side_place_enabled", "允许侧放"]),
            False,
        )
        max_side_place_qty = _safe_int(
            _pick_first(item, ["max_side_place_qty", "side_place_limit", "侧放最大数量"]),
            0,
        )
        if allow_side_place and max_side_place_qty <= 0:
            max_side_place_qty = 2

        index[str(model_code).strip()] = {
            "inner_box_spec": str(_pick_first(item, ["inner_box_spec", "内盒"], "105")).strip() or "105",
            "qty_per_carton": max(1, qty_per_carton) if qty_per_carton > 0 else None,
            "qty_options": qty_options,
            "package_weight_by_qty": package_weight_by_qty,
            "unit_weight_kg": unit_weight_kg,
            # 方向约束：默认正放，只有满足触发条件时允许侧放。
            "allow_side_place": allow_side_place and max_side_place_qty > 0,
            "max_side_place_qty": max(0, max_side_place_qty),
            "side_trigger_max_sparse_qty": max(
                1,
                _safe_int(
                    _pick_first(item, ["side_trigger_max_sparse_qty", "侧放触发最大零散数"]),
                    3,
                ),
            ),
            "side_trigger_min_space_qty": max(
                1,
                _safe_int(
                    _pick_first(item, ["side_trigger_min_space_qty", "侧放触发最小剩余空间"]),
                    4,
                ),
            ),
            "side_trigger_min_space_ratio": min(
                1.0,
                max(
                    0.0,
                    _safe_float(
                        _pick_first(item, ["side_trigger_min_space_ratio", "侧放触发最小剩余比例"]),
                        0.4,
                    ),
                ),
            ),
        }
    return index


def _pick_best_capacity(total_qty, explicit_cap, qty_options):
    if explicit_cap and int(explicit_cap) > 0:
        return int(explicit_cap)
    options = [int(item) for item in (qty_options or []) if int(item) > 0]
    if not options:
        return 20
    # 动态容量选择：优先余数最小，再优先总箱数更少，最后偏向更大容量
    return min(
        options,
        key=lambda cap: (
            int(total_qty) % cap,
            (int(total_qty) + cap - 1) // cap,
            -cap,
        ),
    )


def _pick_package_weight(package_weight_by_qty, cap):
    if not isinstance(package_weight_by_qty, dict):
        return 0.0
    value = package_weight_by_qty.get(str(cap))
    return max(0.0, _safe_float(value, 0.0))


def _consume_order_refs(refs, need_qty):
    """按 FIFO 从订单追溯队列扣减数量，保证每个装箱行可追溯到订单行。"""
    consumed = []
    remain = need_qty
    while remain > 0 and refs:
        head = refs[0]
        head_qty = _safe_int(head.get("qty"), 0)
        if head_qty <= 0:
            refs.pop(0)
            continue

        take = min(head_qty, remain)
        consumed.append(
            {
                "order_line_id": head.get("order_line_id"),
                "order_no": head.get("order_no"),
                "qty": take,
            }
        )
        head["qty"] = head_qty - take
        remain -= take
        if head["qty"] <= 0:
            refs.pop(0)
    return consumed


def _resolve_pose_mode(items, carton_cap, rule_index):
    """方向判定：默认正放，仅在“剩余空间大 + 零散件少 + 规则允许”时启用侧放。"""
    used_qty = sum(_safe_int(item.get("qty"), 0) for item in items)
    if carton_cap <= 0 or used_qty <= 0:
        return "upright", 0

    remaining_space = max(0, carton_cap - used_qty)
    if remaining_space <= 0:
        return "upright", 0

    model_rules = []
    for item in items:
        model_code = str(item.get("model_code") or "").strip()
        if not model_code:
            continue
        model_rules.append(rule_index.get(model_code, {}))

    side_rules = [rule for rule in model_rules if rule.get("allow_side_place")]
    if not side_rules:
        return "upright", 0

    max_sparse_qty = min(
        _safe_int(rule.get("side_trigger_max_sparse_qty"), 3)
        for rule in side_rules
    )
    min_space_qty = max(
        _safe_int(rule.get("side_trigger_min_space_qty"), 4)
        for rule in side_rules
    )
    min_space_ratio = max(
        _safe_float(rule.get("side_trigger_min_space_ratio"), 0.4)
        for rule in side_rules
    )
    max_side_place_qty = min(
        _safe_int(rule.get("max_side_place_qty"), 0)
        for rule in side_rules
    )

    if used_qty > max_sparse_qty:
        return "upright", 0
    if remaining_space < min_space_qty:
        return "upright", 0
    if float(remaining_space) / float(carton_cap) < min_space_ratio:
        return "upright", 0

    side_place_qty = min(used_qty, max(0, max_side_place_qty))
    if side_place_qty <= 0:
        return "upright", 0
    return "mixed", side_place_qty


def _add_carton(cartons, carton_seq, inner_box_spec, items, rule_index, carton_cap, package_weight_kg=0.0):
    """统一创建外箱记录，并计算毛重与方向。"""
    gross = 0.0
    model_set = set()
    for line in items:
        model_code = str(line.get("model_code", "")).strip()
        model_set.add(model_code)
        qty = _safe_int(line.get("qty"), 0)
        model_rule = rule_index.get(model_code, {})
        gross += qty * _safe_float(model_rule.get("unit_weight_kg"), 0.5)
    gross += max(0.0, _safe_float(package_weight_kg, 0.0))

    pose_mode, side_place_qty = _resolve_pose_mode(
        items=items,
        carton_cap=carton_cap,
        rule_index=rule_index,
    )

    cartons.append(
        {
            "carton_id": "CARTON-{0:04d}".format(carton_seq),
            "inner_box_spec": inner_box_spec,
            "items": items,
            "mixed": len(model_set) > 1,
            "pose_mode": pose_mode,
            "side_place_qty": side_place_qty,
            "gross_weight_kg": round(gross, 2),
        }
    )


def _build_demand_queues(order_lines):
    """按型号构建需求队列，队列中保留订单行追溯信息。"""
    queues = defaultdict(list)
    for line in order_lines or []:
        model_code = str(line.get("model") or line.get("model_code") or "").strip()
        if not model_code:
            continue
        qty = _safe_int(line.get("qty"), 0)
        if qty <= 0:
            continue
        queues[model_code].append(
            {
                "order_line_id": line.get("order_line_id"),
                "order_no": line.get("order_no"),
                "qty": qty,
            }
        )
    return queues


def solve_packing(order_lines, rules):
    """
    第三周装箱逻辑（MVP）：
    1. 同型号整箱优先
    2. 同内盒余量拼箱
    3. 缺规则型号统一走内盒 105 兜底
    """
    rule_index = _build_rule_index(rules)
    demand_queues = _build_demand_queues(order_lines)

    cartons = []
    carton_seq = 1
    remains = []

    # 阶段 1：同型号整箱优先。
    for model_code in sorted(demand_queues.keys()):
        queue = demand_queues[model_code]
        total_qty = sum(_safe_int(item.get("qty"), 0) for item in queue)
        if total_qty <= 0:
            continue

        model_rule = rule_index.get(model_code)
        if model_rule is None:
            # 阶段 3：缺规则型号进入兼容内盒 105 队列。
            order_refs = _consume_order_refs(queue, total_qty)
            remains.append(
                {
                    "model_code": model_code,
                    "qty": total_qty,
                    "inner_box_spec": "105",
                    "qty_per_carton": 20,
                    "order_refs": order_refs,
                }
            )
            continue

        cap = _pick_best_capacity(
            total_qty=total_qty,
            explicit_cap=model_rule.get("qty_per_carton"),
            qty_options=model_rule.get("qty_options") or [],
        )
        package_weight_kg = _pick_package_weight(model_rule.get("package_weight_by_qty"), cap)
        full_cartons = total_qty // cap
        remainder = total_qty % cap

        for _ in range(full_cartons):
            order_refs = _consume_order_refs(queue, cap)
            _add_carton(
                cartons=cartons,
                carton_seq=carton_seq,
                inner_box_spec=model_rule["inner_box_spec"],
                items=[
                    {
                        "model_code": model_code,
                        "qty": cap,
                        "order_refs": order_refs,
                    }
                ],
                rule_index=rule_index,
                carton_cap=cap,
                package_weight_kg=package_weight_kg,
            )
            carton_seq += 1

        if remainder > 0:
            order_refs = _consume_order_refs(queue, remainder)
            remains.append(
                {
                    "model_code": model_code,
                    "qty": remainder,
                    "inner_box_spec": model_rule["inner_box_spec"],
                    "qty_per_carton": cap,
                    "qty_options": model_rule.get("qty_options") or [],
                    "package_weight_by_qty": model_rule.get("package_weight_by_qty") or {},
                    "order_refs": order_refs,
                }
            )

    # 阶段 2：同内盒拼箱（处理余量）。
    remains_by_inner = defaultdict(list)
    for row in remains:
        remains_by_inner[str(row["inner_box_spec"])].append(dict(row))

    for inner_box_spec, queue in remains_by_inner.items():
        total_pending_qty = sum(max(0, _safe_int(item.get("qty"), 0)) for item in queue)
        explicit_caps = [_safe_int(item.get("qty_per_carton"), 0) for item in queue if _safe_int(item.get("qty_per_carton"), 0) > 0]
        qty_options = []
        for item in queue:
            for option in item.get("qty_options") or []:
                value = _safe_int(option, 0)
                if value > 0 and value not in qty_options:
                    qty_options.append(value)
        cap = _pick_best_capacity(
            total_qty=total_pending_qty,
            explicit_cap=max(explicit_caps) if explicit_caps else None,
            qty_options=qty_options,
        )
        package_weight_kg = 0.0
        for item in queue:
            candidate = _pick_package_weight(item.get("package_weight_by_qty"), cap)
            if candidate > 0:
                package_weight_kg = candidate
                break
        pending = [item for item in queue if _safe_int(item.get("qty"), 0) > 0]

        while any(_safe_int(item.get("qty"), 0) > 0 for item in pending):
            space = cap
            items = []
            for item in pending:
                item_qty = _safe_int(item.get("qty"), 0)
                if item_qty <= 0 or space <= 0:
                    continue
                take = min(item_qty, space)
                if take <= 0:
                    continue

                item["qty"] = item_qty - take
                space -= take
                item_refs = _consume_order_refs(item["order_refs"], take)
                items.append(
                    {
                        "model_code": item["model_code"],
                        "qty": take,
                        "order_refs": item_refs,
                    }
                )

            if not items:
                break

            _add_carton(
                cartons=cartons,
                carton_seq=carton_seq,
                inner_box_spec=inner_box_spec,
                items=items,
                rule_index=rule_index,
                carton_cap=cap,
                package_weight_kg=package_weight_kg,
            )
            carton_seq += 1

    mixed_count = sum(1 for carton in cartons if carton["mixed"])
    side_carton_count = sum(1 for carton in cartons if _safe_int(carton.get("side_place_qty"), 0) > 0)
    if mixed_count == 0:
        mixing_level = "low"
    elif mixed_count <= max(1, int(len(cartons) * 0.2)):
        mixing_level = "medium"
    else:
        mixing_level = "high"

    return {
        "cartons": cartons,
        "metrics": {
            "box_count": len(cartons),
            "mixing_level": mixing_level,
            "mixed_carton_count": mixed_count,
            "side_place_carton_count": side_carton_count,
        },
    }
