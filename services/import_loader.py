from pathlib import Path

from openpyxl import load_workbook


def load_import_template(file_path):
    # 导入模板占位解析：当前返回基础预览信息
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError("import file not found: {0}".format(path))
    wb = load_workbook(path, data_only=True)
    sheet = wb[wb.sheetnames[0]]
    rows = [list(row) for row in sheet.iter_rows(values_only=True)]
    return {
        "sheet_name": sheet.title,
        "row_count": len(rows),
        "rows_preview": rows[:20],
    }
