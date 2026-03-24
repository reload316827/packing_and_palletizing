import unittest

from engine.packing_solver import solve_packing


class PackingSolverTestCase(unittest.TestCase):
    def test_priority_same_model_then_mix_same_inner(self):
        # 两个型号同内盒时，余量应进入同内盒拼箱。
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
        # 无规则型号走兼容内盒 105 兜底。
        order_lines = [{"model": "X999", "qty": 7}]
        rules = []
        result = solve_packing(order_lines=order_lines, rules=rules)
        self.assertEqual(result["metrics"]["box_count"], 1)
        self.assertEqual(result["cartons"][0]["inner_box_spec"], "105")

    def test_keep_order_trace_refs(self):
        # 装箱结果需要保留订单行追溯信息。
        order_lines = [
            {"order_line_id": 101, "order_no": "ORD-001", "model": "A100", "qty": 7},
            {"order_line_id": 102, "order_no": "ORD-002", "model": "A100", "qty": 6},
        ]
        rules = [
            {"model_code": "A100", "inner_box_spec": "104", "qty_per_carton": 10, "gross_weight_kg": 12},
        ]
        result = solve_packing(order_lines=order_lines, rules=rules)
        first_item = result["cartons"][0]["items"][0]
        refs = first_item["order_refs"]

        self.assertGreaterEqual(len(refs), 2)
        self.assertEqual(refs[0]["order_line_id"], 101)
        self.assertEqual(refs[1]["order_line_id"], 102)
        self.assertEqual(sum(item["qty"] for item in refs), 10)


if __name__ == "__main__":
    unittest.main()
