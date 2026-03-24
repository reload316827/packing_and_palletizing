from collections import defaultdict


def _safe_int(value, default_value):
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return default_value


def _safe_float(value, default_value):
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return default_value


def _build_rule_index(rules):
    # 将规则按型号索引，便于快速查询
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


def _add_carton(cartons, carton_seq, inner_box_spec, items, rule_index):
    # 统一创建外箱记录
    gross = 0.0
    for line in items:
        model_rule = rule_index.get(line["model_code"], {})
        gross += line["qty"] * _safe_float(model_rule.get("unit_gross_kg"), 0.5)

    cartons.append(
        {
            "carton_id": "CARTON-{0:04d}".format(carton_seq),
            "inner_box_spec": inner_box_spec,
            "items": items,
            "mixed": len(items) > 1,
            "gross_weight_kg": round(gross, 2),
        }
    )


def solve_packing(order_lines, rules):
    """
    第一版装箱逻辑（第3周）：
    1. 同型号优先（整箱先出）
    2. 同内盒拼箱（处理余数）
    3. 无规则型号统一走兼容内盒 105 兜底
    """
    rule_index = _build_rule_index(rules)

    # 先聚合订单量，避免同型号多行重复计算
    demand_by_model = defaultdict(int)
    for line in order_lines or []:
        model_code = str(line.get("model") or line.get("model_code") or "").strip()
        if not model_code:
            continue
        demand_by_model[model_code] += _safe_int(line.get("qty"), 0)

    cartons = []
    carton_seq = 1
    remains = []

    # 阶段1：同型号整箱优先
    for model_code, total_qty in sorted(demand_by_model.items()):
        model_rule = rule_index.get(model_code)
        if model_rule is None:
            # 阶段3兜底：缺规则型号先挂到兼容队列
            remains.append(
                {
                    "model_code": model_code,
                    "qty": total_qty,
                    "inner_box_spec": "105",
                    "qty_per_carton": 20,
                }
            )
            continue

        cap = model_rule["qty_per_carton"]
        full_cartons = total_qty // cap
        remainder = total_qty % cap

        for _ in range(full_cartons):
            _add_carton(
                cartons,
                carton_seq,
                model_rule["inner_box_spec"],
                [{"model_code": model_code, "qty": cap}],
                rule_index,
            )
            carton_seq += 1

        if remainder > 0:
            remains.append(
                {
                    "model_code": model_code,
                    "qty": remainder,
                    "inner_box_spec": model_rule["inner_box_spec"],
                    "qty_per_carton": cap,
                }
            )

    # 阶段2：同内盒拼箱（余数拼箱）
    remains_by_inner = defaultdict(list)
    for row in remains:
        remains_by_inner[row["inner_box_spec"]].append(dict(row))

    for inner_box_spec, queue in remains_by_inner.items():
        # 以当前内盒中最大每箱数量作为拼箱容量
        cap = max([_safe_int(item.get("qty_per_carton"), 20) for item in queue] + [20])
        pending = [item for item in queue if item["qty"] > 0]

        while any(item["qty"] > 0 for item in pending):
            space = cap
            items = []
            for item in pending:
                if item["qty"] <= 0 or space <= 0:
                    continue
                take = min(item["qty"], space)
                if take <= 0:
                    continue
                item["qty"] -= take
                space -= take
                items.append({"model_code": item["model_code"], "qty": take})

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
