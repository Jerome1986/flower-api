# 新人花礼用户接口

注册不再自动发券。当前资格规则：注册后连续 7 天内、没有历史新人奖励；不区分注册来源，不增加用户表字段。

- GET /api/marketing-activities/new-user-gift/status
- POST /api/marketing-activities/new-user-gift/claim（无请求体）

均需 Bearer 用户令牌，从登录身份取得 userId。沿用统一响应包装，data 返回 activity、activityAvailable、eligible、claimDeadline、claimed、canClaim、reasonCode、reason、coupon。领取额外返回 newlyClaimed。

原因码：NO_ACTIVITY、ACTIVITY_DISABLED、NOT_FLOWER_GIFT、REWARD_UNAVAILABLE、NOT_ELIGIBLE、ALREADY_CLAIMED；可领时为 null。账号不可用返回 401，领取条件不满足返回 409（code 为原因码，message 为中文原因）。

活动必须是启用的 NEW_USER 赠花活动，关联启用的兑换券、商品和规格。有效期从领取时开始，沿用模板 validityHours。券金额沿用 Prisma Decimal 的元字符串表示。

领取使用 Serializable 事务重新校验，券及 ISSUED 流水共同提交；保留 new-user:{userId} 唯一幂等键，P2002/P2034 冲突在事务外最多重试两次。重复领取返回原券，不重置有效期。历史自动发放的现金券也算已领取。活动停用后仍返回历史券；AVAILABLE 券到期时展示 EXPIRED。

前端 src/api/marketing.ts 当前仍是 pendingIntegration 占位，本次只修改后端，前端需另行对接。
