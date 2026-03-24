# 开发进展记录

## 2026-03-24（批次1：后端基础骨架）

### 已完成
1. 建立后端骨架目录：`api/`、`core/`、`jobs/`、`services/`、`engine/`、`migrations/`、`tests/`。
2. 新增数据库初始化脚本：`migrations/001_init.sql`。
3. 新增任务 API：
- `POST /api/plans`
- `GET /api/plans/{plan_id}`
- `POST /api/plans/{plan_id}/calculate`
4. 新增计算任务占位实现：`jobs/plan_calculate.py`（返回3套候选方案）。
5. 新增规则加载骨架：
- `services/rule_loader_box.py`
- `services/rule_loader_pallet.py`
6. 新增导入/导出占位：
- `services/import_loader.py`
- `services/exporter.py`
7. 新增引擎占位：
- `engine/packing_solver.py`
- `engine/pallet_solver.py`
8. 新增文档：
- `docs/dev-plan.md`
- `docs/field-dictionary.md`
- `docs/rule-mapping.md`
- `docs/api-draft.md`
- `docs/error-codes.md`

### 2026-03-24（批次2：3.14与类型注解调整）
1. 按要求恢复新式类型注解风格：
- `dict[str, Any]`
- `list[dict[str, Any]]`
- `str | Path`
- `from __future__ import annotations`
2. `.venv/pyvenv.cfg` 维持 Python 3.14 配置。
3. 修复因编码污染导致的服务文件异常，重写核心后端文件为干净 UTF-8。

### 当前阻塞
1. `.venv\\Scripts\\python -V` 可返回 `Python 3.14.0`。
2. 但 `.venv\\Scripts\\python -m ...` 无法运行，报错：
- `ModuleNotFoundError: No module named 'encodings'`
3. 根因：当前 `.venv\\Lib` 仅有 `site-packages`，缺少标准库目录（`encodings` 等）。
4. 尝试通过 `uv` 重建 3.14 运行时失败，受网络策略限制（下载 GitHub 资源被阻止）。

### 下一步（批次3）
1. 在可联网环境重建可用 3.14 解释器并重建 `.venv`。
2. 完成 Week2：规则入库与规则快照版本机制。
3. 完成 Week3：装箱求解器第一版（同型号->同内盒->兼容升级）。
