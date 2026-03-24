import os
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

from backend_server import create_app


def _find_file_by_keyword(project_root, keyword):
    # 在项目根目录按关键字查找 xlsx 文件
    for item in Path(project_root).glob("*.xlsx"):
        if item.name.startswith("~$"):
            continue
        if keyword in item.name:
            return str(item)
    return None


class RulesApiTestCase(unittest.TestCase):
    def setUp(self):
        # 初始化应用和测试客户端
        self.app = create_app()
        self.client = self.app.test_client()
        self.project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def test_import_pallet_rules_and_get_snapshot(self):
        # 验证托盘规则导入与快照查询
        rule_file = _find_file_by_keyword(self.project_root, "托盘")
        self.assertIsNotNone(rule_file)

        created = self.client.post("/api/rules/pallet/import", json={"file_path": rule_file})
        self.assertEqual(created.status_code, 201)
        snapshot_id = created.get_json()["snapshot_id"]

        detail = self.client.get("/api/rules/snapshots/{0}".format(snapshot_id))
        self.assertEqual(detail.status_code, 200)
        body = detail.get_json()
        self.assertEqual(body["snapshot"]["snapshot_type"], "pallet")
        self.assertGreaterEqual(len(body["records_preview"]), 1)

    def test_import_box_rules_with_xlsx(self):
        # 验证 box 规则导入（当前用导入模板做占位解析）
        rule_file = _find_file_by_keyword(self.project_root, "导入模板")
        self.assertIsNotNone(rule_file)

        created = self.client.post("/api/rules/box/import", json={"file_path": rule_file})
        self.assertEqual(created.status_code, 201)
        self.assertGreaterEqual(created.get_json()["record_count"], 1)

    def test_conflict_detect_and_activate_version(self):
        # 构造冲突规则：同一型号对应不同内盒
        tmp_dir = tempfile.mkdtemp(prefix="rule_test_")
        file_path = os.path.join(tmp_dir, "box_rules_conflict.xlsx")

        wb = Workbook()
        ws = wb.active
        ws.title = "rules"
        ws.append(["model", "inner_box_spec", "qty_per_carton", "gross_weight_kg"])
        ws.append(["M-001", "104", 20, 12.5])
        ws.append(["M-001", "105", 20, 12.5])
        wb.save(file_path)

        created = self.client.post("/api/rules/box/import", json={"file_path": file_path})
        self.assertEqual(created.status_code, 201)
        body = created.get_json()
        self.assertEqual(body["snapshot_type"], "box")
        self.assertGreaterEqual(body["conflict_count"], 1)
        snapshot_id = body["snapshot_id"]

        # 查询冲突列表
        conflicts = self.client.get("/api/rules/snapshots/{0}/conflicts".format(snapshot_id))
        self.assertEqual(conflicts.status_code, 200)
        self.assertGreaterEqual(len(conflicts.get_json()["conflicts"]), 1)

        # 激活版本
        activated = self.client.post(
            "/api/rules/snapshots/{0}/activate".format(snapshot_id),
            json={"effective_from": "2026-03-24T00:00:00+00:00"},
        )
        self.assertEqual(activated.status_code, 200)

        # 按时间查询生效版本
        active = self.client.get("/api/rules/active?snapshot_type=box&at=2026-03-24T12:00:00+00:00")
        self.assertEqual(active.status_code, 200)
        active_body = active.get_json()
        self.assertIsNotNone(active_body["active_snapshot"])
        self.assertEqual(active_body["active_snapshot"]["id"], snapshot_id)


if __name__ == "__main__":
    unittest.main()
