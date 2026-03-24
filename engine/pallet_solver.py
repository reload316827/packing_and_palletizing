def solve_palletizing(cartons, rules):
    """
    TODO(W4):
    1. 正放优先，竖放补位
    2. 同规格优先拼托
    3. 可用尺寸扣减与限重校验
    4. 最后一托加大加高策略
    """
    return {
        "pallets": [],
        "metrics": {
            "pallet_count": 0,
            "total_weight_kg": 0.0,
        },
    }
