# 微信支付与整单原路退款

普通商户微信 V3、小程序 JSAPI 支付。普通及定制花束均支持待支付、原单续付、服务端支付确认；定制收款后进入待派单。按 jel 写法由 PaymentRepository.wxPay、WechatSign 和 createWechatPay 编排下单。用户只需填写环境变量及 `src/utils/wechat-pay.ts` 中留空的 `getPrivateKey()`，不要提交真实私钥。

## 配置与部署

将根目录 `.env.payment.example` 的条目合并到现有 `.env`，保留其他配置。

| 变量                          | 内容                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| `APPID`                       | 当前微信小程序 AppID，与登录一致且已绑定商户                              |
| `MCH_ID`                      | 微信支付商户号                                                            |
| `SERIALNO`                    | 商户 API 证书序列号，用于请求签名身份                                     |
| `API_V3_KEY`                  | 商户 API V3 密钥，32 字节                                                 |
| `PAY_URL` | 必填；`https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi` |
| `WECHATPAY_PUBLIC_KEY_ID` | 必填；微信支付公钥 ID，不是商户 API 证书序列号 |
| `WECHATPAY_PUBLIC_KEY` | 必填；对应的微信支付公钥 PEM，可用字面量 `\n` 表示换行 |
| `NOTIFY_URL`                  | `https://你的API域名/api/notify`；兼容旧 `/api/notify/wxPay` |
| `REFUND_NOTIFY_URL`           | `https://你的API域名/api/notify/wxRefund`                                 |

商户私钥仅由使用者在 getPrivateKey() 中本地补充，不提交仓库。反向代理应允许通知地址公网 POST，不添加登录或验证码，并保留原始请求体及 Wechatpay 请求头。更换密钥后重启服务。

本次迁移 `20261103000000_wechat_payment` 增加订单操作租约、支付人快照，并允许退款的管理员 ID 为空。部署前先检查目标数据库及全部待执行迁移（仓库还包含之前的用户资料、多商品订单迁移），然后执行：

```sh
pnpm exec prisma migrate status
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm run build
```

不要使用 `db push --accept-data-loss` 或重置数据库。交付时只生成客户端、验证迁移文件，不对已有数据库自动执行迁移。支付配置在首次支付/微信查询时校验，缺失返回 503 和缺失变量名，不影响普通业务启动。零元订单不要求微信商户配置。

## 接口协议

用户接口需要 `Authorization: Bearer <token>`，成功 HTTP 200，统一 `{ code: 200, message: 'success', data }`。

| 路径（含全局前缀）                | 请求                                    | data          |
| --------------------------------- | --------------------------------------- | ------------- |
| `POST /api/pay/commonPay`         | 原购物车订单字段 + `openid`             | 下表支付参数  |
| `POST /api/pay/orderPay`          | `{ orderId, openid }`                   | 下表支付参数  |
| `POST /api/order/createOrderFree` | `{ params: 原购物车订单字段 + openid }` | `{ orderId }` |

```ts
{
  orderId: string // 业务 orderNo，不是数据库 ID 或微信 out_trade_no
  timeStamp: string
  nonceStr: string
  packageValue: string // 前端映射到 wx.requestPayment.package
  signType: 'RSA'
  paySign: string
}
```

身份、价格、库存、优惠券由服务端校验；请求不明确时继续使用原 `requestKey`。新建支付与继续支付共用稳定的 32 位商户交易号。新支付记录先持久化，微信超时后先查单再使用原号重试。已付款或不可支付订单返回 409，客户端应重新读取订单。`/api/user/me` 返回当前用户 `openId`。

回调无需用户 token，由 `notify/notify.controller.ts` 调用 NotifyService.wxNotify。先校验原始请求体的 RSA-SHA256 签名、时间与微信公钥 ID，再用 API V3 Key 进行 AES-256-GCM 解密；微信接口响应同样验签。支付回调核对 AppID、商户号、订单应付金额、付款人和微信交易号。退款通知不含 currency 字段，按原人民币支付记录核对金额；退款查询响应必须为 CNY。成功落库后返回 HTTP 204 空响应，失败返回非 2xx `{ code: 'FAIL', message }`，不套业务响应包装。

## 状态和一致性

- 支付成功：`PENDING_PAYMENT / PENDING` → `PENDING_ACCEPTANCE / PAID`，记录微信交易号、确认时间，锁定券变为已使用；库存仍为预留，完成履约才消耗。
- 未支付取消：先进入 `CANCELLING`，查询并关闭微信交易，确认后释放库存、返券并进入 `CANCELLED / CLOSED`。超时任务最终为 `CLOSED / CLOSED`。
- 已支付取消：按现有权限进入 `CANCELLING / REFUNDING`，发起整单退款。退款受理不代表成功，确认成功才进入 `CANCELLED / REFUNDED` 并释放库存、返券。
- 用户仅可取消未接单订单；管理员/门店仍遵守现有可见范围和阶段限制。用户、店长发起的退款 `adminId` 为空，实际身份写入 `CANCEL_REQUEST` 日志。
- 同一订单的下单与取消使用数据库租约协调，多实例共用；事务中使用订单版本、唯一商户号和唯一事件键抵御竞争。回调与补偿共用同一事务方法，重复执行不重复核销、释放或退款。
- 退款请求先查原单；明确不存在才使用同一退款单号提交，最多 8 次。网络不明不当作失败退款；退款 `ABNORMAL/CLOSED` 或超过请求上限记为 `REFUND_FAILED`，保留库存和券，输出日志，不无限重新提交。
- 定时每分钟分页查询支付与取消中的订单；订单详情对待支付交易每进程每订单限频 10 秒查单。应用重启后数据库中的待处理记录可继续恢复。

发生退款异常时，在微信商户平台核对并处理原退款单，严禁重复创建不相关退款单或直接改订单为已取消。`ABNORMAL` 经商户平台处理成功的回调仍可完成本地退款；若回调已丢失，应核对原退款单并执行受控恢复。`CLOSED` 是终态，需要人工处理后按实际资金结果恢复业务。本次不新增银行卡异常退款表单、部分退款或每日账单下载。

## 验证与真机联调

自动测试使用模拟微信响应及隔离的内存事务，不调用真实微信、不扣款、不改现有业务数据库：

```sh
pnpm exec jest --runInBand src/orders src/payment
pnpm run build
```

配置与迁移完成后，在真实小程序中验证：

1. 微信登录并确认资料有 `openId`，下单成功后取消收银台；详情页继续支付应使用同一业务订单。
2. 支付成功后查询订单为 `PAID / PENDING_ACCEPTANCE`，确认付款金额、交易号及优惠券；回调重复发送不增加业务流水。
3. 用优惠券使应付为零，直接创建待接单订单，不调微信支付。
4. 用户在接单前取消已付款订单，观察退款中，最终确认原路到账、`REFUNDED`、库存和优惠券只返还一次。
5. 超时未支付订单确认微信已关单、库存释放；微信请求超时或暂时不可达时应保持处理中，恢复后补偿。
6. 管理端验证接单、备货、核销不受影响；退款中订单不能继续履约。测试用券过期后退款不会延长有效期。

官方依据：[JSAPI 开发指引](https://pay.wechatpay.cn/doc/v3/merchant/4012791870)、[退款指引](https://pay.wechatpay.cn/doc/v3/merchant/4013071031)、[退款通知字段](https://pay.wechatpay.cn/doc/v3/merchant/4013071196)。

## jel 配置方式

基础配置与 jel 一致：APPID、MCH_ID、SERIALNO、API_V3_KEY 及 getPrivateKey() 提供的商户私钥。
不依赖微信公钥，不配置公钥 ID/路径，也不发送 Wechatpay-Serial 头。通知强制校验事件类型并进行 AES-256-GCM 认证解密，业务层继续核验订单、商户、金额和幂等状态。

NOTIFY_URL 仅在发起支付时必填；REFUND_NOTIFY_URL 仅在申请退款时必填，未配置退款不再阻塞支付。
支付回调为 https://当前API域名/api/notify/wxPay；退款回调为 https://当前API域名/api/notify/wxRefund。
旧项目的域名不可照搬，当前 .env 若未提供域名则保持留空，部署前填写并重启服务。
本次只修改本地代码和配置示例，不复制旧商户密钥、不执行迁移或发布服务器。
