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

## 2026-03-24（批次5：字段字典口径修订）

### 已完成
1. 在 `docs/field-dictionary.md` 中新增 `shipment_unit_code` 字段（单位信息级）。
2. 明确 `customer_code` 为型号明细级客户编号，不等同于单位代号。
3. 新增“编号口径说明”小节，避免后续实现混用字段语义。

## 2026-03-24（批次4：注释规范）

### 已完成
1. 按要求为后端核心代码补充中文注释（模块入口、关键函数、核心逻辑段）。
2. 明确后续开发默认使用中文注释（必要处可补英文术语以避免歧义）。

## 2026-03-24（批次6：第二周开发-规则快照链路）

### 已完成
1. 新增迁移脚本 `migrations/002_rule_snapshots.sql`，落地规则快照与规则明细表。
2. `core/db.py` 升级为按序执行全部迁移脚本（`001`, `002`, ...）。
3. 新增规则快照服务 `services/rule_snapshot_service.py`：
- 导入 box 规则并写入快照
- 导入 pallet 规则并写入快照
- 查询快照详情与预览
4. 新增规则 API `api/rules.py`：
- `POST /api/rules/box/import`
- `POST /api/rules/pallet/import`
- `GET /api/rules/snapshots/{id}`
5. `backend_server.py` 注册 `rules` 蓝图。
6. 新增自动化测试 `tests/test_rules_api.py`，验证导入与快照查询闭环。

### 验证结果
1. `python -m py_compile ...`（含新增模块）：通过。
2. `python -m unittest tests/test_plan_api.py tests/test_rules_api.py`：通过（3个测试）。

### 2026-03-24（批次3：中文注释规范）
1. 已为后端骨架核心文件补充中文注释，覆盖 API、数据库、任务计算、规则导入、导入导出、引擎占位与测试主链路。
2. 新增约定：后续新增或改动代码，统一使用中文注释说明关键逻辑与约束。
