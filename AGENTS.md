# flower-api 后端入口

## 必须先读取

先读取 [系统说明](../WORKSPACE.md) 和 [共享规则](../shared/AGENTS.md)，按任务读取 API、业务、数据库、安全摘要。路径相对于本文件；缺失或无权限时报告，不采用旧需求、旧模型设计和历史进度。

## 本仓库事实与约束

- NestJS / TypeScript / Prisma / MySQL；package.json 的 jfx-api 仅是当前包名。
- 运行入口为 src/main.ts 和 src/app.module.ts 及其间接导入模块；数据库代码以 prisma/schema.prisma、migrations 与实际查询为准。
- 沿用当前 Controller / Service / Repository / Module 与模块内 DTO；先核对真实实现再修改，不为套用规范重构无关模块。
- 全局 /api；普通成功包装 code=200/message/data；微信通知 RawResponse、成功 204，不套包装。未知 DTO 字段拒绝。
- 用户归属取 UserAuthGuard 上下文；管理范围继续落实到 Service / Repository。店长 user 身份与旧 STORE_ADMIN 不可混用。
- 普通订单保留多商品与旧单商品兼容、幂等、库存预留、券锁定及支付状态。数据库 Decimal 元与订单接口整数分转换需明确。
- 定制创建当前仍为测试下单语义；不可把普通订单支付能力推广到定制链路。
- 适用时加载 software-development、nestjs-development、mysql-development、api-design；审查时加载 code-review。

## 验证与边界

按修改选择 pnpm run build、针对性 Jest 或 pnpm test -- --runInBand；先检查测试是否隔离数据库。scripts/check-*.cjs 可能写库或调用外部服务，不能因名称为 check 就直接运行。lint 含 --fix。

未获对应授权不执行 migrate、db push、真实支付/退款、数据修复、生产部署、Git 提交或推送。迁移文件存在不等于线上已应用。交付区分代码、Mock、真实服务、数据库与微信验收。
