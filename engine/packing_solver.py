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


def _build_rule_index(rules):
    """将规则按型号索引，便于装箱时快速匹配。"""
    index = {}
    for item in rules or []:
        model_code = item.get("model_code")
        if not model_code:
            continue
        qty_per_carton = _safe_int(item.get("qty_per_carton"), 20)
        gross_weight_kg = _safe_float(item.get("gross_weight_kg"), 10.0)
        unit_gross = gross_weight_kg / max(1, qty_per_carton)
        index[str(model_code)] = {
            "inner_box_spec": item.get("inner_box_spec") or "105",
            "qty_per_carton": max(1, qty_per_carton),
            "unit_gross_kg": max(0.01, unit_gross),
        }
    return index


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


def _add_carton(cartons, carton_seq, inner_box_spec, items, rule_index):
    """统一创建外箱记录，并计算毛重。"""
    gross = 0.0
    model_set = set()
    for line in items:
        model_code = str(line.get("model_code", ""))
        model_set.add(model_code)
        qty = _safe_int(line.get("qty"), 0)
        model_rule = rule_index.get(model_code, {})
        gross += qty * _safe_float(model_rule.get("unit_gross_kg"), 0.5)

    cartons.append(
        {
            "carton_id": "CARTON-{0:04d}".format(carton_seq),
            "inner_box_spec": inner_box_spec,
            "items": items,
            "mixed": len(model_set) > 1,
            # 第三周方向约束：当前版本默认正放，不启用侧放。
            "pose_mode": "upright",
            "side_place_qty": 0,
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

        cap = model_rule["qty_per_carton"]
        full_cartons = total_qty // cap
        remainder = total_qty % cap

        for _ in range(full_cartons):
            order_refs = _consume_order_refs(queue, cap)
            _add_carton(
                cartons,
                carton_seq,
                model_rule["inner_box_spec"],
                [
                    {
                        "model_code": model_code,
                        "qty": cap,
                        "order_refs": order_refs,
                    }
                ],
                rule_index,
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
                    "order_refs": order_refs,
                }
            )

    # 阶段 2：同内盒拼箱（处理余量）。
    remains_by_inner = defaultdict(list)
    for row in remains:
        remains_by_inner[str(row["inner_box_spec"])].append(dict(row))

    for inner_box_spec, queue in remains_by_inner.items():
        cap = max([_safe_int(item.get("qty_per_carton"), 20) for item in queue] + [20])
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
                items.append({"model_code": item["model_code"], "qty": take, "order_refs": item_refs})

            if not items:
                break

            _add_carton(cartons, carton_seq, inner_box_spec, items, rule_index)
            carton_seq += 1

    mixed_count = sum(1 for carton in cartons if carton["mixed"])
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
        },
    }
