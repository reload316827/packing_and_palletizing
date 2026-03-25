import os
import tempfile
import unittest

from openpyxl import Workbook

from backend_server import create_app


class FullFlowE2ETestCase(unittest.TestCase):
    def setUp(self):
        # 初始化应用并复用 Flask 测试客户端
        self.app = create_app()
        self.client = self.app.test_client()

    def _build_box_rule_file(self, temp_dir):
        file_path = os.path.join(temp_dir, "box_rules_e2e.xlsx")
        wb = Workbook()
        ws = wb.active
        ws.title = "box"
        ws.append(["model", "inner_box_spec", "qty_per_carton", "gross_weight_kg"])
        ws.append(["54-1801", "105", 20, 12.0])
        ws.append(["54-82202", "104", 24, 13.5])
        ws.append(["54-1801", "105", 20, 12.0])
        wb.save(file_path)
        wb.close()
        return file_path

    def _build_pallet_rule_file(self, temp_dir):
        file_path = os.path.join(temp_dir, "pallet_rules_e2e.xlsx")
        wb = Workbook()
        ws = wb.active
        ws.title = "pallet"
        ws.append(["inner_box_code", "carton_spec_cm", "pallet_spec_cm", "carton_qty", "pallet_carton_qty"])
        ws.append(["105", "56*38*29", "116*116*103", 20, 50])
        ws.append(["104", "56*38*29", "116*116*103", 24, 48])
        wb.save(file_path)
        wb.close()
        return file_path

    def test_end_to_end_main_chain(self):
        # 覆盖主链路：规则导入 -> 激活 -> 计划计算 -> 确认 -> 布局 -> 导出
        with tempfile.TemporaryDirectory(prefix="e2e_rules_") as temp_dir:
            box_file = self._build_box_rule_file(temp_dir)
            pallet_file = self._build_pallet_rule_file(temp_dir)

            box_import = self.client.post("/api/rules/box/import", json={"file_path": box_file})
            self.assertEqual(box_import.status_code, 201)
            box_snapshot_id = box_import.get_json()["snapshot_id"]

            pallet_import = self.client.post("/api/rules/pallet/import", json={"file_path": pallet_file})
            self.assertEqual(pallet_import.status_code, 201)
            pallet_snapshot_id = pallet_import.get_json()["snapshot_id"]

            box_activate = self.client.post(
                "/api/rules/snapshots/{0}/activate".format(box_snapshot_id),
                json={"effective_from": "2026-03-24T00:00:00+00:00"},
            )
            self.assertEqual(box_activate.status_code, 200)

            pallet_activate = self.client.post(
                "/api/rules/snapshots/{0}/activate".format(pallet_snapshot_id),
                json={"effective_from": "2026-03-24T00:00:00+00:00"},
            )
            self.assertEqual(pallet_activate.status_code, 200)

            create_payload = {
                "customer_code": "CUST-E2E",
                "ship_date": "2026-03-24",
                "merge_mode": "NO_MERGE",
                "orders": [
                    {"order_no": "E2E-001", "model": "54-1801", "qty": 120},
                    {"order_no": "E2E-002", "model": "54-82202", "qty": 60},
                ],
            }
            created = self.client.post("/api/plans", json=create_payload)
            self.assertEqual(created.status_code, 201)
            plan_id = created.get_json()["plan"]["id"]

            calculated = self.client.post("/api/plans/{0}/calculate".format(plan_id))
            self.assertEqual(calculated.status_code, 200)
            self.assertEqual(calculated.get_json()["status"], "PENDING_CONFIRM")

            detail = self.client.get("/api/plans/{0}".format(plan_id))
            self.assertEqual(detail.status_code, 200)
            detail_body = detail.get_json()
            self.assertEqual(detail_body["plan"]["status"], "PENDING_CONFIRM")
            self.assertGreater(len(detail_body["solutions"]), 0)

            selected_solution_id = detail_body["solutions"][0]["id"]
            confirmed = self.client.post(
                "/api/plans/{0}/confirm".format(plan_id),
                json={"solution_id": selected_solution_id, "actor": "e2e"},
            )
            self.assertEqual(confirmed.status_code, 200)
            self.assertEqual(confirmed.get_json()["plan"]["status"], "CONFIRMED")

            layout = self.client.get("/api/layout/{0}".format(plan_id))
            self.assertEqual(layout.status_code, 200)
            layout_body = layout.get_json()
            self.assertGreater(layout_body["stats"]["row_count"], 0)
            model_filter = layout_body["boxes"][0]["models"][0]

            filtered_layout = self.client.get("/api/layout/{0}?model={1}".format(plan_id, model_filter))
            self.assertEqual(filtered_layout.status_code, 200)
            for row in filtered_layout.get_json()["boxes"]:
                self.assertIn(model_filter, row["models"])

            export_res = self.client.post(
                "/api/plans/{0}/export".format(plan_id),
                json={"solution_id": selected_solution_id, "output_dir": temp_dir},
            )
            self.assertEqual(export_res.status_code, 200)
            self.assertEqual(
                export_res.mimetype,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            export_res.close()

            exported_files = [name for name in os.listdir(temp_dir) if name.lower().endswith(".xlsx")]
            self.assertGreaterEqual(len(exported_files), 3)


if __name__ == "__main__":
    unittest.main()
