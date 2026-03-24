import unittest

from backend_server import create_app


class PlanApiTestCase(unittest.TestCase):
    def setUp(self):
        # 每个用例独立初始化应用与测试客户端
        self.app = create_app()
        self.client = self.app.test_client()

    def test_create_and_calculate_plan(self):
        # 覆盖“创建任务 -> 计算 -> 查询结果”主链路
        payload = {
            "customer_code": "CUST-6002",
            "ship_date": "2026-03-24",
            "merge_mode": "NO_MERGE",
            "orders": [
                {"order_no": "ORD-001", "model": "54-1801", "qty": 120},
                {"order_no": "ORD-002", "model": "54-82202", "qty": 60},
            ],
        }
        created = self.client.post("/api/plans", json=payload)
        self.assertEqual(created.status_code, 201)
        plan_id = created.get_json()["plan"]["id"]

        calc = self.client.post("/api/plans/{0}/calculate".format(plan_id))
        self.assertEqual(calc.status_code, 200)
        self.assertEqual(calc.get_json()["solution_count"], 3)

        detail = self.client.get("/api/plans/{0}".format(plan_id))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.get_json()["solutions"]), 3)


if __name__ == "__main__":
    unittest.main()
