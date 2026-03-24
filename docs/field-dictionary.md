# 字段字典（V1）

## 1. 导入模板字段（业务输入）
| 字段 | 说明 | 类型 | 必填 | 示例 |
| --- | --- | --- | --- | --- |
| shipment_unit_code | 单位代号（整票/整单位级） | string | 是 | UNIT-6002-BBB |
| customer_code | 客户编号（型号级客户编号，随型号行变化） | string | 是 | CUST-6002-M01 |
| order_no | 订单编号 | string | 是 | 405398+405228+420867 |
| model | ZNP型号 | string | 是 | 54-1801 |
| category | 产品类别 | string | 是 | 配件 |
| qty | 数量 | int | 是 | 290 |
| unit | 单位 | string | 是 | 只 |
| unit_price | 单价 | number | 否 | 0.08 |
| amount | 金额 | number | 否 | 23.2 |
| ship_date | 交货日期 | string(date) | 是 | 2026-03-24 |
| merge_mode | 合并方式 | enum | 是 | 合并/不合并 |
| need_pallet | 是否打托 | bool/enum | 是 | 是/否 |

### 1.1 编号口径说明（必须区分）
1. `shipment_unit_code`：对应“单位信息”区域，只表示整票/整单位的代号，不随明细型号变化。
2. `customer_code`：对应“型号行”的客户编号，属于明细级字段，可能在不同型号行中不同。

## 2. 规则字段（装箱.xls）
| 字段 | 说明 |
| --- | --- |
| model | 型号 |
| unit_weight_kg | 单只重量（kg） |
| inner_box_spec | 默认内盒（支持 104*2 语义） |
| qty_per_carton | 默认每箱数量 |
| net_weight_kg | 默认净重 |
| gross_weight_kg | 默认毛重（优先用于计算） |
| carton_spec_cm | 默认外箱规格（cm） |

## 3. 规则字段（托盘，纸盒纸箱尺寸.xlsx）
| 字段 | 说明 |
| --- | --- |
| inner_box_code | 内盒编号 |
| inner_l_mm | 内盒长（mm） |
| inner_w_mm | 内盒宽（mm） |
| inner_h_mm | 内盒高（mm） |
| carton_spec_cm | 外箱规格（cm） |
| carton_empty_weight_kg | 内盒+外箱重量（kg） |
| carton_qty | 一箱总数（只） |
| carton_pattern | 内盒排列（横*竖*层） |
| pallet_spec_cm | 默认托盘规格（cm） |
| pallet_carton_qty | 默认每托外箱数 |
| pallet_pattern | 外箱排列（横*竖*层） |

## 4. 任务与方案字段（系统输出）
| 字段 | 说明 | 类型 |
| --- | --- | --- |
| plan_id | 任务ID | int |
| status | 状态（草稿/计算中/待确认/已确认） | string |
| box_count | 外箱总数 | int |
| pallet_count | 托盘总数 | int |
| gross_weight_kg | 总毛重（kg） | number |
| solution_name | 方案名（保守/均衡/极致省箱托） | string |
| score_rank | 方案排序 | int |
