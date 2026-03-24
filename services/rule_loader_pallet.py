from __future__ import annotations

from pathlib import Path
from typing import Any

from openpyxl import load_workbook


def load_pallet_rules(file_path: str | Path) -> list[dict[str, Any]]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"规则文件不存在: {path}")
    if path.suffix.lower() != ".xlsx":
        raise RuntimeError("托盘规则文件仅支持 .xlsx")

    workbook = load_workbook(path, data_only=True)
    sheet = workbook[workbook.sheetnames[0]]
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(v).strip() if v is not None else "" for v in rows[0]]
    records: list[dict[str, Any]] = []
    for idx, row in enumerate(rows[1:], start=2):
        if not any(cell is not None and str(cell).strip() for cell in row):
            continue
        record: dict[str, Any] = {
            headers[i] or f"col_{i+1}": row[i]
            for i in range(min(len(headers), len(row)))
        }
        record["source_row"] = idx
        records.append(record)
    return records
