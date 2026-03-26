from engine.packing_solver import solve_packing
from engine.pallet_solver import solve_palletizing


def test_packing_should_use_qty_options_when_qty_per_carton_missing():
    order_lines = [{"order_no": "O-1", "model": "M-115", "qty": 50}]
    rules = [
        {
            "model_code": "M-115",
            "inner_box_spec": "115",
            "gross_weight_kg": 12.5,
            "qty_options": [25, 50],
        }
    ]

    result = solve_packing(order_lines=order_lines, rules=rules)
    cartons = result["cartons"]
    assert len(cartons) == 1
    assert cartons[0]["items"][0]["qty"] == 50


def test_palletizing_should_pick_best_carton_spec_by_carton_qty():
    cartons = [
        {
            "carton_id": "CARTON-0001",
            "inner_box_spec": "115",
            "gross_weight_kg": 12.5,
            "items": [{"model_code": "M-115", "qty": 50}],
        }
    ]
    rules = [
        {"inner_box_code": "115", "carton_spec_cm": "36*36*10", "carton_qty": 25},
        {"inner_box_code": "115", "carton_spec_cm": "36*36*17", "carton_qty": 50},
    ]

    result = solve_palletizing(cartons=cartons, rules=rules)
    pallets = result["pallets"]
    assert len(pallets) == 1
    assert pallets[0]["cartons"][0]["carton_spec_cm"] == "36*36*17"
