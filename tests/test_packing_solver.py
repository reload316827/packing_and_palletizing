import unittest

from engine.packing_solver import solve_packing


class PackingSolverTestCase(unittest.TestCase):
    def test_priority_same_model_then_mix_same_inner(self):
        # 两个型号同内盒，余量应进入同内盒拼箱
        order_lines = [
            {"model": "A100", "qty": 25},
            {"model": "B200", "qty": 13},
        ]
        rules = [
            {"model_code": "A100", "inner_box_spec": "104", "qty_per_carton": 10, "gross_weight_kg": 12},
            {"model_code": "B200", "inner_box_spec": "104", "qty_per_carton": 10, "gross_weight_kg": 11},
        ]

        result = solve_packing(order_lines=order_lines, rules=rules)
        cartons = result["cartons"]
        self.assertGreaterEqual(len(cartons), 4)
        self.assertGreaterEqual(result["metrics"]["mixed_carton_count"], 1)

    def test_fallback_for_missing_rule(self):
        # 无规则型号走兼容内盒 105 兜底
        order_lines = [{"model": "X999", "qty": 7}]
        rules = []
        result = solve_packing(order_lines=order_lines, rules=rules)
        self.assertEqual(result["metrics"]["box_count"], 1)
        self.assertEqual(result["cartons"][0]["inner_box_spec"], "105")


if __name__ == "__main__":
    unittest.main()
