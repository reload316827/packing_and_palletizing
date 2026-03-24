from pathlib import Path


def export_by_template(template_path, output_path):
    # 导出占位实现：先复制模板，后续再填充业务数据
    template = Path(template_path)
    target = Path(output_path)
    if not template.exists():
        raise FileNotFoundError("template not found: {0}".format(template))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(template.read_bytes())
    return target
