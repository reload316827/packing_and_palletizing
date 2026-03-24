from __future__ import annotations

from pathlib import Path


def export_by_template(*, template_path: str | Path, output_path: str | Path) -> Path:
    """
    导出占位实现。
    当前仅复制模板，后续在 W7 实现字段替换、明细填充、单元格合并。
    """
    template = Path(template_path)
    target = Path(output_path)
    if not template.exists():
        raise FileNotFoundError(f"模板不存在: {template}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(template.read_bytes())
    return target
