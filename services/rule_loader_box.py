from pathlib import Path

from openpyxl import load_workbook


def load_box_rules(file_path):
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError("rule file not found: {0}".format(path))

    suffix = path.suffix.lower()
    if suffix == ".xls":
        raise RuntimeError("Direct .xls parsing is not enabled in this scaffold. Convert to .xlsx first.")
    if suffix != ".xlsx":
        raise RuntimeError("unsupported file type: {0}".format(suffix))

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
            record = {
                headers[i] or "col_{0}".format(i + 1): row[i]
                for i in range(min(len(headers), len(row)))
            }
            record["source_sheet"] = sheet_name
            record["source_row"] = idx
            all_rules.append(record)
    return all_rules
