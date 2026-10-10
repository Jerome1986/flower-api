# 新人及邀请活动管理

仅 SUPER_ADMIN、PLATFORM_ADMIN 可访问，所有接口沿用后台登录鉴权和统一响应结构。

- `GET /api/admin/marketing-activities`：查询当前配置，未设置时返回空数组。
- `PUT /api/admin/marketing-activities/:trigger`：保存指定活动。trigger 只能为 NEW_USER 或 INVITATION，每种活动最多一条配置。
- `PATCH /api/admin/marketing-activities/:trigger/status`：启停活动，参数为 `{ "enabled": true }`。

保存参数：name、templateId、enabled、isFlowerGift、reimbursementPerUnit。报销单价为整数分，null 表示待配置；后台以元填写。赠花活动必须关联兑换券，非赠花不得配置报销单价。奖励有效期沿用所选优惠券的 validityHours，不限制固定天数。启用活动时奖励券、兑换商品及规格都必须启用，停用操作不受此限制。

配置使用现有 MarketingActivity 表，无需新增数据库字段。编辑活动仅更新当前配置，不修改 UserCoupon 历史快照。此模块提供后台活动设置接口；注册、邀请绑定及实际发券由小程序注册业务另行接入，不能仅凭活动启用视为已经发券。

验证：`npx jest --runInBand marketing-activity`、`npx nest build`。
