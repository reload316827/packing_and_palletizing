# 开发进展记录

## 2026-03-24（批次1：后端基础骨架 + 兼容修复）

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

### 兼容与稳定性修复
1. 清理 `__pycache__/*.pyc` 并新增 `.gitignore` 规则，避免缓存文件入库。
2. 修复 Flask 旧版本兼容：统一使用 `@route(methods=[...])`。
3. 修复 SQLite 路径兼容：`sqlite3.connect(str(DB_PATH))`。
4. 将核心文件改为 Python3.6 可运行语法。
5. 对关键文件改为 ASCII 安全文案，避免本机编码差异导致语法错误。

### 验证结果
1. `python -m py_compile backend_server.py api/plans.py core/db.py core/errors.py core/time_utils.py jobs/plan_calculate.py services/rule_loader_box.py services/rule_loader_pallet.py services/import_loader.py services/exporter.py engine/packing_solver.py engine/pallet_solver.py tests/test_plan_api.py`：通过。
2. `python -m unittest tests/test_plan_api.py`：通过（1个测试）。

### 下一步（批次2）
1. 实现规则入库与规则快照版本机制。
2. 接入导入模板解析到任务创建流程。
3. 开始实现 `engine/packing_solver.py` 的三层优先级装箱逻辑。
