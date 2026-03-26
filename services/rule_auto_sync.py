import threading
import time
from pathlib import Path

from core.db import PROJECT_ROOT
from core.time_utils import utc_now_iso
from services.rule_snapshot_service import (
    activate_snapshot,
    import_box_rules_to_snapshot,
    import_pallet_rules_to_snapshot,
)


class RuleFileAutoSync:
    def __init__(self, interval_seconds=300):
        # 规则文件轮询周期（秒），避免过高频率造成数据库与磁盘压力。
        self.interval_seconds = max(30, int(interval_seconds or 300))
        self._stop_event = threading.Event()
        self._thread = None
        self._file_signatures = {}

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="rule-file-auto-sync", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()

    def _resolve_rule_file(self, exact_candidates, fallback_keywords):
        # 先按约定文件名精确匹配；找不到时按关键字兜底扫描。
        for name in exact_candidates:
            candidate = PROJECT_ROOT / name
            if candidate.is_file():
                return candidate

        xlsx_files = [path for path in PROJECT_ROOT.glob("*.xls*") if path.is_file()]
        for path in xlsx_files:
            lower_name = path.name.lower()
            if all(keyword in lower_name for keyword in fallback_keywords):
                return path
        return None

    def _get_signature(self, path):
        stat = path.stat()
        return (int(stat.st_mtime_ns), int(stat.st_size))

    def _sync_if_changed(self, sync_key, file_path, importer):
        if not file_path or not file_path.is_file():
            return False

        signature = self._get_signature(file_path)
        if self._file_signatures.get(sync_key) == signature:
            # 文件签名未变化，跳过重复导入。
            return False

        # 发生变更才导入快照，并立即激活为当前生效版本。
        result = importer(str(file_path))
        snapshot_id = result.get("snapshot_id")
        if snapshot_id:
            activate_snapshot(snapshot_id, utc_now_iso())
        self._file_signatures[sync_key] = signature
        return True

    def sync_once(self):
        # 按 soft.md 4.2 约定读取基础规则文件。
        box_file = self._resolve_rule_file(
            exact_candidates=["装箱.xlsx", "装箱.xls"],
            fallback_keywords=["装箱"],
        )
        pallet_file = self._resolve_rule_file(
            exact_candidates=["托盘，纸盒纸箱尺寸.xlsx", "托盘,纸盒纸箱尺寸.xlsx"],
            fallback_keywords=["托盘", "纸箱", "尺寸"],
        )

        box_changed = self._sync_if_changed("box", box_file, import_box_rules_to_snapshot)
        pallet_changed = self._sync_if_changed("pallet", pallet_file, import_pallet_rules_to_snapshot)
        return {"box_changed": box_changed, "pallet_changed": pallet_changed}

    def _run(self):
        while not self._stop_event.is_set():
            try:
                self.sync_once()
            except Exception as err:
                print("[rule-auto-sync] sync failed: {0}".format(err))
            self._stop_event.wait(self.interval_seconds)


_AUTO_SYNC = RuleFileAutoSync(interval_seconds=300)


def start_rule_file_auto_sync():
    # 服务启动时调用：后台线程常驻同步规则文件。
    _AUTO_SYNC.start()
