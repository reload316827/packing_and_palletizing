import time
import unittest

from backend_server import create_app


class PlanApiTestCase(unittest.TestCase):
    def setUp(self):
        # ??????????????????
        self.app = create_app()
        self.client = self.app.test_client()

    def _create_plan(self):
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
        return created.get_json()["plan"]["id"]

    def test_create_and_calculate_plan(self):
        # ??????? -> ?? -> ?????????
        plan_id = self._create_plan()

        calc = self.client.post("/api/plans/{0}/calculate".format(plan_id))
        self.assertEqual(calc.status_code, 200)
        self.assertEqual(calc.get_json()["solution_count"], 3)

        detail = self.client.get("/api/plans/{0}".format(plan_id))
        self.assertEqual(detail.status_code, 200)
        body = detail.get_json()
        self.assertEqual(body["plan"]["status"], "PENDING_CONFIRM")
        self.assertEqual(len(body["solutions"]), 3)
        self.assertGreater(len(body["solution_item_boxes"]), 0)
        self.assertGreater(len(body["solution_item_pallets"]), 0)
        self.assertIn("order_line_id", body["solution_item_boxes"][0])
        self.assertIn("rule_snapshot_id", body["solution_item_boxes"][0])

    def test_async_confirm_rollback_and_override_upload(self):
        # ??????? -> ?? -> ?? -> ???? -> ??????
        plan_id = self._create_plan()

        queued = self.client.post("/api/plans/{0}/calculate".format(plan_id), json={"async": True})
        self.assertEqual(queued.status_code, 202)
        self.assertTrue(queued.get_json()["queued"])

        solutions = []
        for _ in range(20):
            detail = self.client.get("/api/plans/{0}".format(plan_id))
            self.assertEqual(detail.status_code, 200)
            body = detail.get_json()
            if body["plan"]["status"] == "PENDING_CONFIRM" and body["solutions"]:
                solutions = body["solutions"]
                break
            time.sleep(0.1)

        self.assertGreater(len(solutions), 0)
        selected_solution_id = solutions[0]["id"]

        confirmed = self.client.post(
            "/api/plans/{0}/confirm".format(plan_id),
            json={"solution_id": selected_solution_id, "actor": "qa"},
        )
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.get_json()["plan"]["status"], "CONFIRMED")
        self.assertEqual(confirmed.get_json()["plan"]["final_solution_id"], selected_solution_id)

        rolled_back = self.client.post(
            "/api/plans/{0}/rollback".format(plan_id),
            json={"reason": "re-check", "actor": "qa"},
        )
        self.assertEqual(rolled_back.status_code, 200)
        self.assertEqual(rolled_back.get_json()["plan"]["status"], "PENDING_CONFIRM")
        self.assertIsNone(rolled_back.get_json()["plan"]["final_solution_id"])

        uploaded = self.client.post(
            "/api/plans/{0}/override-upload".format(plan_id),
            json={
                "file_name": "override_result.xlsx",
                "file_path": "D:/tmp/override_result.xlsx",
                "note": "manual override",
                "actor": "qa",
            },
        )
        self.assertEqual(uploaded.status_code, 201)
        self.assertEqual(uploaded.get_json()["upload"]["file_name"], "override_result.xlsx")

        final_detail = self.client.get("/api/plans/{0}".format(plan_id))
        self.assertEqual(final_detail.status_code, 200)
        final_body = final_detail.get_json()
        self.assertGreaterEqual(len(final_body["override_uploads"]), 1)
        actions = [row["action"] for row in final_body["audit_logs"]]
        self.assertIn("PLAN_CONFIRM", actions)
        self.assertIn("PLAN_ROLLBACK", actions)
        self.assertIn("PLAN_OVERRIDE_UPLOAD", actions)


if __name__ == "__main__":
    unittest.main()
