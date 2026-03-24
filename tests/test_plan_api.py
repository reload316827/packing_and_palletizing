import unittest

from backend_server import create_app


class PlanApiTestCase(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()

    def test_create_and_calculate_plan(self):
        payload = {
            "customer_code": "CUST-6002",
            "ship_date": "2026-03-24",
            "merge_mode": "不合并",
            "orders": [
                {"order_no": "ORD-001", "model": "54-1801", "qty": 120},
                {"order_no": "ORD-002", "model": "54-82202", "qty": 60},
            ],
        }
        created = self.client.post("/api/plans", json=payload)
        self.assertEqual(created.status_code, 201)
        plan_id = created.get_json()["plan"]["id"]

        calc = self.client.post(f"/api/plans/{plan_id}/calculate")
        self.assertEqual(calc.status_code, 200)
        self.assertEqual(calc.get_json()["solution_count"], 3)

        detail = self.client.get(f"/api/plans/{plan_id}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.get_json()["solutions"]), 3)


if __name__ == "__main__":
    unittest.main()
