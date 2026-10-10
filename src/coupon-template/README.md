# 后台优惠券设置

入口：营销管理 → 优惠券设置（`/marketing/templates`）。接口前缀：`/api/admin/coupon-templates`。
所有接口通过现有 Bearer 登录鉴权，服务层再次校验 `SUPER_ADMIN` / `PLATFORM_ADMIN`；其他角色拒绝访问。
响应沿用 `{ code: 200, message, data }`，分页 `data` 为 `{ list, total, page, pageSize }`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/` | 优惠券模板分页、名称/类型/启停筛选 |
| GET | `/exchange-specs` | 商品名称或规格名称搜索可兑换的规格 |
| GET | `/:id` | 模板详情与已发放、关联活动数量 |
| POST | `/` | 新增优惠券模板 |
| PATCH | `/:id` | 完整编辑优惠券规则 |
| PATCH | `/:id/status` | 启停，提交 `{ "enabled": false }` |

列表参数：`page` 默认1，`pageSize` 默认10、最大100，`keyword`，`type`（CASH/EXCHANGE），`enabled`（true/false）。规格查询使用分页与 keyword 参数。

现金抵扣券提交示例：

```json
{ "name": "新人10元优惠券", "type": "CASH", "cashAmount": 1000, "exchangeSpecId": null, "exchangeQuantity": null, "validityHours": 120, "enabled": true }
```

商品兑换券提交示例：

```json
{ "name": "玫瑰鲜花兑换券", "type": "EXCHANGE", "cashAmount": null, "exchangeSpecId": 1, "exchangeQuantity": 1, "validityHours": 120, "enabled": true }
```

- 接口金额为整数分，数据库保存 Decimal 元；后台填写和显示元，自动转换。有效期接口为1至87600小时，后台可按天或小时填写。
- CASH 仅接受正面额；EXCHANGE 必须指定可售规格和正整数销售数量。商品范围统一 ALL，不区分旧商品类型。
- 停售的兑换商品可在停用模板中保留原关联用于回显；新选或启用时必须使用可售商品和启用规格。
- 关联赠花活动的兑换券不能直接改成现金券，需先调整活动配置。
- 修改、停用只更新模板，不回写 UserCoupon 已发券的金额、兑换规则及到期时间；不提供物理删除。
- 模板启停和规则校验在事务中处理。启停模板不自动修改关联活动配置；后续发券流程需校验活动及模板均启用。
- 本模块只提供优惠券模板设置，不发放优惠券，不修改新人或邀请活动，也不负责订单用券核销。

后端函数均包含用途单行注释，Service 函数包含处理步骤注释。
验证：`nest build`、`jest --runInBand coupon-template`、`node scripts/check-coupon-templates.cjs`（真实数据库测试全部回滚）；前端 `vue-tsc --build`、`vite build`。
