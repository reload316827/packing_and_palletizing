# 错误码清单（V1）

| code | HTTP | 场景 | 说明 |
| --- | --- | --- | --- |
| INVALID_PAYLOAD | 400 | 通用 | 请求体不是 JSON 对象 |
| MISSING_CUSTOMER_CODE | 400 | 创建任务 | customer_code 缺失 |
| MISSING_SHIP_DATE | 400 | 创建任务 | ship_date 缺失 |
| INVALID_MERGE_MODE | 400 | 创建任务 | merge_mode 不是 合并/不合并 |
| INVALID_ORDERS | 400 | 创建任务 | orders 不是数组 |
| PLAN_NOT_FOUND | 404 | 查询/计算 | plan_id 不存在 |
| RULE_FILE_NOT_FOUND | 404 | 规则导入 | 规则文件不存在 |
| RULE_FILE_TYPE_NOT_SUPPORTED | 400 | 规则导入 | 文件类型不支持 |
| RULE_PARSE_FAILED | 422 | 规则导入 | 规则解析失败 |
| ENGINE_CALC_FAILED | 500 | 计算 | 计算引擎异常 |
| EXPORT_TEMPLATE_NOT_FOUND | 404 | 导出 | 导出模板缺失 |
| EXPORT_RENDER_FAILED | 500 | 导出 | 导出模板渲染失败 |

## 错误响应格式
```json
{
  "code": "INVALID_PAYLOAD",
  "message": "请求体必须为 JSON 对象",
  "detail": {}
}
```
