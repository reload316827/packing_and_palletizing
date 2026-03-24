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

## 2026-03-24（批次4：注释规范）

### 已完成
1. 按要求为后端核心代码补充中文注释（模块入口、关键函数、核心逻辑段）。
2. 明确后续开发默认使用中文注释（必要处可补英文术语以避免歧义）。

### 2026-03-24（批次3：中文注释规范）
1. 已为后端骨架核心文件补充中文注释，覆盖 API、数据库、任务计算、规则导入、导入导出、引擎占位与测试主链路。
2. 新增约定：后续新增或改动代码，统一使用中文注释说明关键逻辑与约束。
