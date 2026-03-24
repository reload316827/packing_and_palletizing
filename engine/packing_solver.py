def solve_packing(order_lines, rules):
    """
    TODO(W3):
    1. 同型号优先
    2. 同内盒优先
    3. 兼容升级内盒
    4. 默认正放，必要时侧放
    """
    return {
        "cartons": [],
        "metrics": {
            "box_count": 0,
            "mixing_level": "unknown",
        },
    }
