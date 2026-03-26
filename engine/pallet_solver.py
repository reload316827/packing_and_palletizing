import re


PALLET_TARE_WEIGHT_KG = 30.0
PALLET_MAX_WEIGHT_KG = 1250.0
CUSTOM_MAX_PALLET_SPEC = "116*116*116"


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


def _pick_first(data, keys, default_value=None):
    for key in keys:
        if key in data and data.get(key) is not None and str(data.get(key)).strip() != "":
            return data.get(key)
    return default_value


def _normalize_inner_box(value):
    text = str(value or "").strip()
    if not text:
        return ""
    return text.split("*")[0].strip()


def _parse_spec_cm(spec_text, default_dims):
    text = str(spec_text or "").strip().lower().replace("cm", "")
    nums = re.findall(r"\d+(?:\.\d+)?", text)
    if len(nums) < 3:
        return default_dims
    return (
        max(1, _safe_int(nums[0], default_dims[0])),
        max(1, _safe_int(nums[1], default_dims[1])),
        max(1, _safe_int(nums[2], default_dims[2])),
    )


def _format_spec_cm(dims):
    return "{0}*{1}*{2}".format(dims[0], dims[1], dims[2])


def _deduct_usable_dims(pallet_dims):
    # W4-01?????????????? 8??? 13?
    return (
        max(1, pallet_dims[0] - 8),
        max(1, pallet_dims[1] - 8),
        max(1, pallet_dims[2] - 13),
    )


def _default_pallet_spec(inner_box_code):
    if str(inner_box_code).strip() == "102":
        return "114*114*103"
    return "116*116*103"


def _build_rule_index(rules):
    index = {}
    for row in rules or []:
        inner_box_code = _normalize_inner_box(
            _pick_first(row, ["inner_box_code", "????", "??", "inner_box_spec"])
        )
        if not inner_box_code:
            continue
        record = {
            "carton_spec_cm": str(
                _pick_first(row, ["carton_spec_cm", "????/cm", "????"], "56*38*29")
            ).strip(),
            "pallet_spec_cm": str(
                _pick_first(row, ["pallet_spec_cm", "??????/cm"], _default_pallet_spec(inner_box_code))
            ).strip(),
            "carton_qty": max(
                0,
                _safe_int(
                    _pick_first(row, ["carton_qty", "????/?", "????"]),
                    0,
                ),
            ),
            "pallet_carton_qty": max(
                0,
                _safe_int(
                    _pick_first(row, ["pallet_carton_qty", "??????????"]),
                    0,
                ),
            ),
        }
        index.setdefault(inner_box_code, [])
        index[inner_box_code].append(record)
    return index


def _calc_carton_qty(carton):
    total = 0
    for item in carton.get("items") or []:
        total += max(0, _safe_int(item.get("qty"), 0))
    return total


def _pick_best_rule(rule_list, carton_qty):
    if not rule_list:
        return {}
    qty = max(0, _safe_int(carton_qty, 0))
    # 按当前箱内数量选择最匹配的外箱规格；缺失 carton_qty 的候选放后面
    return min(
        rule_list,
        key=lambda item: (
            1 if _safe_int(item.get("carton_qty"), 0) <= 0 else 0,
            abs(_safe_int(item.get("carton_qty"), qty) - qty),
            -_safe_int(item.get("carton_qty"), 0),
        ),
    )


def _normalize_carton(carton, rule_index):
    inner_box_spec = str(_pick_first(carton, ["inner_box_spec", "inner_box"], "105")).strip() or "105"
    inner_box_code = _normalize_inner_box(inner_box_spec)
    rule_list = rule_index.get(inner_box_code, [])
    carton_qty = _calc_carton_qty(carton)
    rule = _pick_best_rule(rule_list, carton_qty)

    carton_spec_cm = str(
        _pick_first(carton, ["carton_spec_cm", "carton_spec"], rule.get("carton_spec_cm", "56*38*29"))
    ).strip() or "56*38*29"
    pallet_spec_cm = str(
        _pick_first(carton, ["pallet_spec_cm", "pallet_spec"], rule.get("pallet_spec_cm", _default_pallet_spec(inner_box_code)))
    ).strip() or _default_pallet_spec(inner_box_code)

    gross_weight_kg = max(0.01, _safe_float(carton.get("gross_weight_kg"), 40.0))
    carton_id = str(carton.get("carton_id") or "").strip() or "CARTON-NA"

    return {
        "carton_id": carton_id,
        "inner_box_spec": inner_box_spec,
        "inner_box_code": inner_box_code,
        "carton_spec_cm": carton_spec_cm,
        "pallet_spec_cm": pallet_spec_cm,
        "carton_dims_cm": _parse_spec_cm(carton_spec_cm, (56, 38, 29)),
        "gross_weight_kg": gross_weight_kg,
        "pallet_carton_qty_hint": _safe_int(rule.get("pallet_carton_qty"), 0),
    }


def _create_pallet(pallet_seq, pallet_spec_cm):
    pallet_dims = _parse_spec_cm(pallet_spec_cm, (116, 116, 103))
    usable_dims = _deduct_usable_dims(pallet_dims)
    return {
        "pallet_id": "PALLET-{0:03d}".format(pallet_seq),
        "pallet_spec_cm": _format_spec_cm(pallet_dims),
        "pallet_dims_cm": pallet_dims,
        "usable_dims_cm": usable_dims,
        "usable_spec_cm": _format_spec_cm(usable_dims),
        "customized": False,
        "cartons": [],
        "upright_count": 0,
        "vertical_count": 0,
        "total_weight_kg": PALLET_TARE_WEIGHT_KG,
    }


def _capacity_with_orientation(usable_dims, base_l, base_w, box_h):
    u_l, u_w, u_h = usable_dims
    if min(base_l, base_w, box_h) <= 0:
        return 0
    per_layer_1 = (u_l // base_l) * (u_w // base_w)
    per_layer_2 = (u_l // base_w) * (u_w // base_l)
    per_layer = max(per_layer_1, per_layer_2)
    if per_layer <= 0:
        return 0
    layers = u_h // box_h
    return max(0, per_layer * layers)


def _calc_pose_capacities(pallet, carton):
    usable_dims = pallet["usable_dims_cm"]
    box_l, box_w, box_h = carton["carton_dims_cm"]

    upright_capacity = _capacity_with_orientation(usable_dims, box_l, box_w, box_h)
    vertical_capacity_a = _capacity_with_orientation(usable_dims, box_l, box_h, box_w)
    vertical_capacity_b = _capacity_with_orientation(usable_dims, box_w, box_h, box_l)
    vertical_capacity = max(vertical_capacity_a, vertical_capacity_b)

    hint = carton.get("pallet_carton_qty_hint") or 0
    if hint > 0:
        if upright_capacity > 0:
            upright_capacity = min(upright_capacity, hint)
        else:
            upright_capacity = hint

    return upright_capacity, vertical_capacity


def _choose_pose(pallet, carton):
    # W4-03?????????????????????
    upright_capacity, vertical_capacity = _calc_pose_capacities(pallet, carton)
    total_count = len(pallet["cartons"])

    if upright_capacity > 0 and total_count < upright_capacity:
        return "upright"
    if vertical_capacity > upright_capacity and total_count < vertical_capacity:
        return "vertical"
    return None


def _try_place_carton_on_pallet(pallet, carton):
    # W4-02????? 30kg????????????? 1250kg?
    after_weight = pallet["total_weight_kg"] + carton["gross_weight_kg"]
    if after_weight > PALLET_MAX_WEIGHT_KG:
        return False

    pose = _choose_pose(pallet, carton)
    if not pose:
        return False

    pallet["cartons"].append(
        {
            "carton_id": carton["carton_id"],
            "inner_box_spec": carton["inner_box_spec"],
            "carton_spec_cm": carton["carton_spec_cm"],
            "gross_weight_kg": round(carton["gross_weight_kg"], 2),
            "pose": pose,
        }
    )
    if pose == "vertical":
        pallet["vertical_count"] += 1
    else:
        pallet["upright_count"] += 1
    pallet["total_weight_kg"] = round(after_weight, 2)
    return True


def _spec_distance(spec_a, spec_b):
    a = _parse_spec_cm(spec_a, (116, 116, 103))
    b = _parse_spec_cm(spec_b, (116, 116, 103))
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])


def _sort_candidate_pallets(pallets, preferred_spec):
    # ?????????????????
    return sorted(
        pallets,
        key=lambda p: (
            0 if p["pallet_spec_cm"] == preferred_spec else 1,
            _spec_distance(p["pallet_spec_cm"], preferred_spec),
            p["pallet_id"],
        ),
    )


def _try_expand_last_pallet(pallets, carton):
    # W4-04????????????????????????116*116*116??
    if not pallets:
        return False
    pallet = pallets[-1]
    if pallet.get("customized"):
        return False

    old_state = {
        "pallet_spec_cm": pallet["pallet_spec_cm"],
        "pallet_dims_cm": pallet["pallet_dims_cm"],
        "usable_dims_cm": pallet["usable_dims_cm"],
        "usable_spec_cm": pallet["usable_spec_cm"],
    }

    custom_dims = _parse_spec_cm(CUSTOM_MAX_PALLET_SPEC, (116, 116, 116))
    custom_usable_dims = _deduct_usable_dims(custom_dims)
    pallet["pallet_spec_cm"] = _format_spec_cm(custom_dims)
    pallet["pallet_dims_cm"] = custom_dims
    pallet["usable_dims_cm"] = custom_usable_dims
    pallet["usable_spec_cm"] = _format_spec_cm(custom_usable_dims)
    pallet["customized"] = True

    if _try_place_carton_on_pallet(pallet, carton):
        return True

    pallet["pallet_spec_cm"] = old_state["pallet_spec_cm"]
    pallet["pallet_dims_cm"] = old_state["pallet_dims_cm"]
    pallet["usable_dims_cm"] = old_state["usable_dims_cm"]
    pallet["usable_spec_cm"] = old_state["usable_spec_cm"]
    pallet["customized"] = False
    return False


def solve_palletizing(cartons, rules):
    rule_index = _build_rule_index(rules)
    normalized = [_normalize_carton(item, rule_index) for item in (cartons or [])]
    normalized.sort(key=lambda x: (x["pallet_spec_cm"], -x["gross_weight_kg"], x["carton_id"]))

    pallets = []
    exceptions = []

    for carton in normalized:
        if carton["gross_weight_kg"] + PALLET_TARE_WEIGHT_KG > PALLET_MAX_WEIGHT_KG:
            exceptions.append("carton too heavy for single pallet: {0}".format(carton["carton_id"]))
            continue

        placed = False
        for pallet in _sort_candidate_pallets(pallets, carton["pallet_spec_cm"]):
            if _try_place_carton_on_pallet(pallet, carton):
                placed = True
                break

        if not placed and _try_expand_last_pallet(pallets, carton):
            placed = True

        if not placed:
            new_pallet = _create_pallet(len(pallets) + 1, carton["pallet_spec_cm"])
            if _try_place_carton_on_pallet(new_pallet, carton):
                pallets.append(new_pallet)
                placed = True

        if not placed:
            exceptions.append("unable to place carton: {0}".format(carton["carton_id"]))

    output_pallets = []
    for pallet in pallets:
        output_pallets.append(
            {
                "pallet_id": pallet["pallet_id"],
                "pallet_spec_cm": pallet["pallet_spec_cm"],
                "usable_spec_cm": pallet["usable_spec_cm"],
                "customized": pallet["customized"],
                "carton_count": len(pallet["cartons"]),
                "upright_count": pallet["upright_count"],
                "vertical_count": pallet["vertical_count"],
                "tare_weight_kg": PALLET_TARE_WEIGHT_KG,
                "total_weight_kg": round(pallet["total_weight_kg"], 2),
                "cartons": pallet["cartons"],
            }
        )

    total_weight = sum(item["total_weight_kg"] for item in output_pallets)
    upright_count = sum(item["upright_count"] for item in output_pallets)
    vertical_count = sum(item["vertical_count"] for item in output_pallets)
    custom_count = sum(1 for item in output_pallets if item["customized"])

    return {
        "pallets": output_pallets,
        "metrics": {
            "pallet_count": len(output_pallets),
            "total_weight_kg": round(total_weight, 2),
            "upright_carton_count": upright_count,
            "vertical_carton_count": vertical_count,
            "customized_pallet_count": custom_count,
            "unplaced_carton_count": len(exceptions),
            "exceptions": exceptions,
        },
    }
