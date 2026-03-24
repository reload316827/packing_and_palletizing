# 开发记录（2026-03-24）

## 本次完成内容
1. 建立后端基础目录与骨架：`core/`、`api/`、`jobs/`、`services/`、`engine/`、`migrations/`、`tests/`。
2. 新增数据库初始化脚本：`migrations/001_init.sql`。
3. 新增任务 API：创建任务、查询任务、触发计算（候选方案占位生成）。
4. 新增规则解析器骨架：
- `services/rule_loader_box.py`
- `services/rule_loader_pallet.py`
5. 新增导入/导出占位服务：
- `services/import_loader.py`
- `services/exporter.py`
6. 新增周计划落地文档：
- `docs/field-dictionary.md`
- `docs/rule-mapping.md`
- `docs/api-draft.md`
- `docs/error-codes.md`

## 环境与注解调整
1. 按要求恢复并使用新式类型注解（`dict[str, Any]`、`str | Path`、`from __future__ import annotations`）。
2. `.venv/pyvenv.cfg` 当前指向 Python 3.14 基础解释器配置。

## 当前阻塞
1. `.venv\\Scripts\\python -V` 可返回 `Python 3.14.0`，但执行 `-m`（如 `py_compile`、`unittest`）失败。
2. 报错：`ModuleNotFoundError: No module named 'encodings'`。
3. 根因：当前 `.venv\\Lib` 中仅有 `site-packages`，缺少标准库（`encodings` 等），基础解释器路径不可用于加载 stdlib。

## 下一步
1. 修复/重建可用的 Python 3.14 运行时（保证 `python -m` 可用）。
2. 完成 Week2 的规则入库与快照逻辑。
3. 启动 Week3 的 `engine/packing_solver.py` 正式实现。
