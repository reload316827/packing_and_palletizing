# 开发进展记录

## 2026-03-24（第1批：后端基础骨架）

### 已完成
1. 建立后端目录骨架：`api/`、`core/`、`jobs/`、`services/`、`engine/`、`migrations/`、`tests/`。
2. 建立数据库初始化与首个迁移脚本：
- `core/db.py`
- `migrations/001_init.sql`
3. 建立任务 API 初版：
- `POST /api/plans`（创建任务）
- `GET /api/plans/{id}`（查询任务详情）
- `POST /api/plans/{id}/calculate`（触发计算）
4. 建立计算任务占位实现（返回 3 套候选方案）：
- `jobs/plan_calculate.py`
5. 建立规则加载骨架：
- `services/rule_loader_box.py`
- `services/rule_loader_pallet.py`
6. 建立导入/导出占位服务：
- `services/import_loader.py`
- `services/exporter.py`
7. 建立引擎占位模块：
- `engine/packing_solver.py`
- `engine/pallet_solver.py`
8. 补齐第1周文档交付：
- `docs/field-dictionary.md`
- `docs/rule-mapping.md`
- `docs/api-draft.md`
- `docs/error-codes.md`

### 验证结果
1. `python -m py_compile ...`：通过。
2. `python -m unittest tests/test_plan_api.py`：通过（1个测试）。

### 启动方式
1. 启动服务：
```bash
python backend_server.py
```
2. 健康检查：
```bash
GET http://127.0.0.1:8010/healthz
```

### 已知限制
1. `engine/*` 目前为占位实现，尚未实现正式装箱/装托算法。
2. `.xls` 规则文件解析尚未接入 `xlrd`，当前会提示先转为 `.xlsx`。
3. 导出服务 `services/exporter.py` 当前仅复制模板，未填充正式业务数据。

### 下一步（第2批）
1. 完成规则导入入库与快照版本机制。
2. 实现 `engine/packing_solver.py` 的三层装箱优先级。
3. 接入任务计算链路中的真实规则与订单输入。
