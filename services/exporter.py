from pathlib import Path


def export_by_template(template_path, output_path):
    template = Path(template_path)
    target = Path(output_path)
    if not template.exists():
        raise FileNotFoundError("template not found: {0}".format(template))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(template.read_bytes())
    return target
