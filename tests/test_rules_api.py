import os
import unittest

from backend_server import create_app


class RulesApiTestCase(unittest.TestCase):
    def setUp(self):
        # 初始化应用和测试客户端
        self.app = create_app()
        self.client = self.app.test_client()
        self.project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def test_import_pallet_rules_and_get_snapshot(self):
        # 使用托盘规则文件做导入验证
        rule_file = os.path.join(self.project_root, "托盘，纸盒纸箱尺寸.xlsx")
        created = self.client.post("/api/rules/pallet/import", json={"file_path": rule_file})
        self.assertEqual(created.status_code, 201)
        snapshot_id = created.get_json()["snapshot_id"]

        detail = self.client.get("/api/rules/snapshots/{0}".format(snapshot_id))
        self.assertEqual(detail.status_code, 200)
        body = detail.get_json()
        self.assertEqual(body["snapshot"]["snapshot_type"], "pallet")
        self.assertGreaterEqual(len(body["records_preview"]), 1)

    def test_import_box_rules_with_xlsx(self):
        # 当前 box loader 支持 xlsx，使用导入模板做占位解析
        rule_file = os.path.join(self.project_root, "导入模板.xlsx")
        created = self.client.post("/api/rules/box/import", json={"file_path": rule_file})
        self.assertEqual(created.status_code, 201)
        self.assertGreaterEqual(created.get_json()["record_count"], 1)


if __name__ == "__main__":
    unittest.main()
