import os
import tempfile
import time
import unittest

from openpyxl import Workbook, load_workbook

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

    def _calculate_plan_sync(self, plan_id):
        calc = self.client.post("/api/plans/{0}/calculate".format(plan_id))
        self.assertEqual(calc.status_code, 200)
        self.assertEqual(calc.get_json()["solution_count"], 3)

    def test_create_and_calculate_plan(self):
        # ??????? -> ?? -> ?????????
        plan_id = self._create_plan()

        self._calculate_plan_sync(plan_id)

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

        with tempfile.TemporaryDirectory(prefix="override_upload_") as temp_dir:
            file_path = os.path.join(temp_dir, "override_web_upload.xlsx")
            wb = Workbook()
            wb.save(file_path)
            wb.close()
            with open(file_path, "rb") as fh:
                uploaded2 = self.client.post(
                    "/api/plans/{0}/override-upload".format(plan_id),
                    data={
                        "file": (fh, "override_web_upload.xlsx"),
                        "actor": "qa",
                        "note": "web upload",
                    },
                    content_type="multipart/form-data",
                )
            self.assertEqual(uploaded2.status_code, 201)
            self.assertEqual(uploaded2.get_json()["upload"]["file_name"], "override_web_upload.xlsx")

        final_detail = self.client.get("/api/plans/{0}".format(plan_id))
        self.assertEqual(final_detail.status_code, 200)
        final_body = final_detail.get_json()
        self.assertGreaterEqual(len(final_body["override_uploads"]), 2)
        actions = [row["action"] for row in final_body["audit_logs"]]
        self.assertIn("PLAN_CONFIRM", actions)
        self.assertIn("PLAN_ROLLBACK", actions)
        self.assertIn("PLAN_OVERRIDE_UPLOAD", actions)

    def test_layout_filters_and_export_endpoint(self):
        # 覆盖布局筛选接口与导出接口
        plan_id = self._create_plan()
        self._calculate_plan_sync(plan_id)

        detail = self.client.get("/api/plans/{0}".format(plan_id))
        self.assertEqual(detail.status_code, 200)
        detail_body = detail.get_json()
        self.assertGreater(len(detail_body["solutions"]), 0)
        selected_solution_id = detail_body["solutions"][0]["id"]

        layout_all = self.client.get("/api/layout/{0}".format(plan_id))
        self.assertEqual(layout_all.status_code, 200)
        layout_body = layout_all.get_json()
        self.assertEqual(layout_body["plan_id"], plan_id)
        self.assertGreater(layout_body["stats"]["row_count"], 0)
        self.assertEqual(layout_body["stats"]["row_count"], len(layout_body["boxes"]))

        first_box = layout_body["boxes"][0]
        pallet_id = first_box["pallet_id"]
        carton_id = first_box["carton_id"]
        model = first_box["models"][0]

        by_pallet = self.client.get("/api/layout/{0}?pallet_id={1}".format(plan_id, pallet_id))
        self.assertEqual(by_pallet.status_code, 200)
        for row in by_pallet.get_json()["boxes"]:
            self.assertEqual(row["pallet_id"], pallet_id)

        by_carton = self.client.get("/api/layout/{0}?carton_id={1}".format(plan_id, carton_id))
        self.assertEqual(by_carton.status_code, 200)
        for row in by_carton.get_json()["boxes"]:
            self.assertEqual(row["carton_id"], carton_id)

        by_model = self.client.get("/api/layout/{0}?model={1}".format(plan_id, model))
        self.assertEqual(by_model.status_code, 200)
        for row in by_model.get_json()["boxes"]:
            self.assertIn(model, row["models"])

        explicit = self.client.get(
            "/api/layout/{0}?solution_id={1}".format(plan_id, selected_solution_id)
        )
        self.assertEqual(explicit.status_code, 200)
        self.assertEqual(explicit.get_json()["solution_id"], selected_solution_id)

        with tempfile.TemporaryDirectory(prefix="plan_export_") as output_dir:
            exported = self.client.post(
                "/api/plans/{0}/export".format(plan_id),
                json={
                    "solution_id": selected_solution_id,
                    "output_dir": output_dir,
                },
            )
            self.assertEqual(exported.status_code, 200)
            self.assertEqual(
                exported.mimetype,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            self.assertGreater(len(exported.data), 0)

            files = [name for name in os.listdir(output_dir) if name.lower().endswith(".xlsx")]
            self.assertEqual(len(files), 1)

            file_path = os.path.join(output_dir, files[0])
            wb = load_workbook(file_path)
            ws = wb[wb.sheetnames[0]]
            self.assertEqual(str(ws["N4"].value), "2026-03-24")
            self.assertIn("ORD-001", str(ws["A3"].value or ""))
            wb.close()
            exported.close()


if __name__ == "__main__":
    unittest.main()
