# 门店销售统计接口

状态：后端实现、前端接入和隔离 HTTP/MySQL 联调完成；微信真机展示仍待验收。统计口径于 2026-10-11 由用户确认。本模块只读，无表结构迁移。

## 请求与权限

`GET /api/admin/sales?storeId=123&period=today`，Bearer Token，成功使用统一 `{ code: 200, message: "success", data }`。

- `storeId`：必填正整数，最大 2147483647；`period`：必填 `today | week | month`。
- 小程序店长只能查询当前负责的门店；旧后台 STORE_ADMIN 仅本店；SUPER_ADMIN / PLATFORM_ADMIN 可查指定店。客服不可查。
- 未登录/过期/禁用/不可用店长身份：401；无权限或不存在门店：403（不泄露门店存在性）；参数无效/多余字段：400。数据库错误按既有全局错误处理，前端显示失败及重试，不伪造零值。
- 管理门店列表仍为 `GET /api/admin/orders/stores`，不接受前端传入角色或负责人身份。

## 响应 data

所有金额为**整数分**，数量为整数。真实无数据返回零；有赠花但部分支数缺失返回 `giftStems: null`。

| 字段                            | 含义                                                                      |
| ------------------------------- | ------------------------------------------------------------------------- |
| store                           | `{ id, name }`                                                            |
| period / timezone               | 请求筛选；固定 `Asia/Shanghai`                                            |
| start / end                     | UTC ISO 时间；对应北京时间的 `[start, end)` 区间                          |
| amount                          | 已完成订单的实收商品金额，商品原价减优惠，不含配送费                      |
| deliveryAmount / receivedAmount | 同一销售订单范围的配送费及含配送费实收总额                                |
| salesCount                      | 计入实收范围的已完成订单数，含零元确认单，不含成功退款单                  |
| average                         | amount / salesCount，四舍五入到分；无销售订单时为 0                       |
| completed                       | 期间实际完成订单数，按 completedAt；退款后仍保留完成事实                  |
| count                           | 期间创建的普通订单数，按 createdAt                                        |
| pending                         | 期间创建、当前为待接单/备货/待自取或配送/配送中的订单数；不是跨期全部待办 |
| states                          | 期间创建订单的当前状态 `{ status, count }[]`；没有订单时为空数组          |
| giftQuantity                    | 指定活动已实际送出的免费兑换份数                                          |
| giftStems                       | 支数总计；任一计入的赠花明细缺支数时为 null                               |
| giftUnknownStemsCount           | 缺失赠花支数的订单数                                                      |
| giftAmount                      | 明细历史单价 × 活动赠花份数；商品原价价值，不是报销金额或实收             |
| giftExceptionCount              | 已送出赠花中退款处理中/成功/失败或取消中/已取消/关闭的订单数              |

## 时间、收入与退款口径

- 今日：北京时间今天 00:00 至明天 00:00。近七天：含今天的七个自然日。本月：本月 1 日 00:00 至明天 00:00。与服务器本地时区无关。
- 销售按 `completedAt`，归属 `storeId`；订单创建数及状态按 `createdAt`，页面分别标清，二者不必相等。
- 支付 PAID / REFUNDING / REFUND_FAILED 保留实收；零元订单仅在 NOT_REQUIRED 且 payableAmount=0 时计入销售订单数。
- 整单退款成功，从原完成期间扣除，不记作退款当天负收入。paymentStatus=REFUNDED 或已有 SUCCEEDED 退款记录均不计收入；后者可防止支付状态未同步时错计。
- CUSTOM 不计入门店统计。汇总使用数据库聚合和同一 RepeatableRead 快照，不从分页列表拼接，不读取全部订单到 Node 内存。

## 赠花口径与营销交接

- 按 `completedAt + fulfilledStoreId` 统计实际履约归属，不能回退到下单门店，未履约不计入。
- `OrderItem.giftQuantity` 是指定活动免费兑换份数的历史快照；现金券、非活动兑换及额外付费数量必须写 0 或不计入该字段。后续营销下单需原子写入 exchangeQuantity、giftQuantity、giftStems 等准确快照。
- 使用订单明细快照，不关联当前券模板/活动/商品价格重新推算历史。giftStems 缺失不按份数猜测。
- 退款后的已送出赠花保留事实并累加异常笔数。报销单价和结算周期尚未确认，本接口不提供报销结算功能。
- 现阶段营销发券/用券尚未接通；真实赠花产生闭环仍待后续营销联调，不能把隔离测试数据当运营数据。

## 验证

- `pnpm build`
- `pnpm exec jest src/sales --runInBand`：13 项日期边界、闰年、跨年及参数校验通过。
- `node scripts/check-sales.cjs`：105 项真实 HTTP/JWT/MySQL 断言通过，覆盖小程序/后台权限、参数、空值、分元精度、退款状态与成功记录、日期半开边界、测试单与定制单排除、跨店赠花、未知支数和价格快照。仅创建专用随机门店/用户/商品/订单并在 finally 精确清理，不修改现有业务记录。禁止 production 环境执行。
- 全量 Jest：180 通过，1 个既有失败（AppController 测试期待 Hello World!，当前实现返回 jfx），本次未修改该无关行为。
- 前端测试替身仅用于自动化回归；线上请求走真实接口。
