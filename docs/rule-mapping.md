# 规则映射清单（skill.md -> 系统实现）

## 1. 装箱规则映射
| 规则来源 | 规则内容 | 系统实现位点 |
| --- | --- | --- |
| skill.md 装箱规则-1 | 三层优先级：同型号 -> 同内盒 -> 兼容升级 | `engine/packing_solver.py`（待实现） |
| skill.md 装箱规则-2 | 从 `装箱.xls` 全sheet读取型号映射 | `services/rule_loader_box.py` |
| skill.md 装箱规则-3 | 从 `托盘，纸盒纸箱尺寸.xlsx`读取内盒/外箱/托盘映射 | `services/rule_loader_pallet.py` |
| skill.md 装箱规则-4 | 默认正放，特定条件允许侧放 | `engine/packing_solver.py`（待实现） |
| skill.md 装箱规则-5/6/8 | 在复杂度受控下优先减少箱数，并在多外箱规格中择优 | `engine/packing_solver.py`（待实现） |
| skill.md 装箱规则-7 | 样品箱可放入即可，尽量减少使用 | `engine/packing_solver.py`（待实现） |

## 2. 装托规则映射
| 规则来源 | 规则内容 | 系统实现位点 |
| --- | --- | --- |
| skill.md 装托规则-1 | 正放优先，剩余空间才竖放 | `engine/pallet_solver.py`（待实现） |
| skill.md 装托规则-2 | 同规格优先，其次相近规格拼托 | `engine/pallet_solver.py`（待实现） |
| skill.md 装托规则-3 | 托盘可用空间扣减（长宽-8，高-13） | `engine/pallet_solver.py`（待实现） |
| skill.md 装托规则-4 | 最后一托可加大加高（有条件） | `engine/pallet_solver.py`（待实现） |
| skill.md 装托规则-5/6 | 102托盘偏好与104/105/111拼托偏好 | `engine/pallet_solver.py`（待实现） |
| skill.md 装托规则-7/8 | 托盘自重30kg，限重1250kg | `engine/pallet_solver.py`（待实现） |
| skill.md 装托规则-9 | 复杂度受控下减少托盘数 | `engine/pallet_solver.py`（待实现） |

## 3. 输入输出规则映射
| 规则来源 | 规则内容 | 系统实现位点 |
| --- | --- | --- |
| 输入格式 | 导入 `导入模板.xlsx`，含头部+明细字段 | `services/import_loader.py`（待实现） |
| 输出内容 | 基于 `导出模板.xlsx` 填充，替换A1/合同/收货单位/N4等 | `demo/export_xlsx_server.py`（基础）+ `services/exporter.py`（待实现） |
| 输出样式 | 装箱/装托段落、拼箱合并单元格、每木托间隔3行 | `services/exporter.py`（待实现） |
