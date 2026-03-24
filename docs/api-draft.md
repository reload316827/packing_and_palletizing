# API 草案（V1）

## 1. 任务管理
1. `POST /api/plans`
- 说明：创建装箱装托任务。
- 入参：`customer_code`, `ship_date`, `merge_mode`, `orders[]`。
- 出参：`plan`。

2. `GET /api/plans/{plan_id}`
- 说明：查询任务详情、订单明细、候选方案。
- 出参：`plan`, `orders`, `solutions`。

3. `POST /api/plans/{plan_id}/calculate`
- 说明：触发任务计算，生成候选方案。
- 出参：`plan_id`, `status`, `solution_count`。

## 2. 规则管理（待实现）
1. `POST /api/rules/box/import`
- 说明：导入 `装箱.xls/.xlsx` 规则。

2. `POST /api/rules/pallet/import`
- 说明：导入 `托盘，纸盒纸箱尺寸.xlsx` 规则。

3. `GET /api/rules/snapshots/{snapshot_id}`
- 说明：查询规则快照。

## 3. 导出（待实现）
1. `POST /api/plans/{plan_id}/export`
- 说明：按 `导出模板.xlsx` 生成导出文件。
- 出参：文件流（xlsx）。

## 4. 状态机
1. 草稿：任务已创建，未计算。
2. 计算中：已触发计算任务。
3. 待确认：生成候选方案，等待人工选定。
4. 已确认：确认最终方案，可导出。

## 5. 安全与审计（V1约定）
1. 每次状态变更写入 `audit_log`。
2. 每次计算需记录输入payload快照。
