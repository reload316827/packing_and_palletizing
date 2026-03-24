from pathlib import Path

from openpyxl import load_workbook


def load_box_rules(file_path):
    """
    解析型号-内盒规则（优先支持 xlsx）。
    .xls 需要 xlrd 依赖，当前版本先给出明确错误，避免静默失败。
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"规则文件不存在: {path}")

    suffix = path.suffix.lower()
    if suffix == ".xls":
        raise RuntimeError(
            "暂不支持直接解析 .xls，请先转换为 .xlsx，或安装 xlrd 后扩展 rule_loader_box.py。"
        )
    if suffix != ".xlsx":
        raise RuntimeError(f"不支持的文件类型: {suffix}")

    workbook = load_workbook(path, data_only=True)
    all_rules = []
    for sheet_name in workbook.sheetnames:
        sheet = workbook[sheet_name]
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            continue
        headers = [str(v).strip() if v is not None else "" for v in rows[0]]
        for idx, row in enumerate(rows[1:], start=2):
            if not any(cell is not None and str(cell).strip() for cell in row):
                continue
            record = {headers[i] or f"col_{i+1}": row[i] for i in range(min(len(headers), len(row)))}
            record["source_sheet"] = sheet_name
            record["source_row"] = idx
            all_rules.append(record)
    return all_rules
