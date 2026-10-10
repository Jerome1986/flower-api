# 鲜花项目数据库初版设计

日期：2026-10-09。设计源文件：`prisma/schema.prisma`。数据库：MySQL。

本次仅修改数据库模型并补充设计说明，不执行 migrate、db push、db pull、generate，不修改数据库、生成客户端、种子数据或接口实现。已执行本地 Prisma validate，通过语法与模型关系校验。

## 1. 设计依据与范围

- 后端现状：仅有 Admin 模型和管理员登录/注册等基础接口，鲜花业务模型尚未实现。
- 小程序：门店选择、分类商品、确认订单、支付结果、用户/门店订单、优惠券、邀请、地址、门店销量；现有数据主要为本地模拟数据。
- 管理后台：门店、商品库、门店选品/库存、普通/定制订单、退款、券模板/活动/记录、邀请、销售/赠花/定制报表及账号配置。
- 业务依据：项目根目录《鲜花多门店业务需求文档.md》，结合两端页面字段。
- 不纳入模板中与当前鲜花业务无关的装修案例、施工、员工绩效、积分等表；不增加购物车、自由搭配花材、分销、合作方后台或结算系统。

## 2. 表与职责

| 模型 / 数据表 | 职责与关键关系 |
| --- | --- |
| Admin / admin | 平台后台账号；旧门店角色绑定Store仅保留兼容，新店长以User手机号关联门店 |
| Store / store | 门店地址、营业时间、电话、配送区域/费用、客服与配送人员；managerId关联User店长，一位用户可负责多家门店 |
| PlatformConfig / platform_config | 独立的定制服务配置与首页内容，约定 id=1 |
| ProductCategory / product_category | 商品分类，由平台维护名称、排序和启停 |
| Product / product | 平台统一商品库，按分类管理、图片、说明、上下架 |
| ProductSpec / product_spec | 商品多规格、统一售价、销售单位、每份支数 |
| StoreProduct / store_product | 门店选品、上下架、自取/配送标签，一店一商品唯一 |
| StoreStock / store_stock | 门店规格库存，可售/预留数量、并发版本号 |
| InventoryLog / inventory_log | 调整、盘点、预留、释放、消耗、恢复的前后库存流水 |
| User / user | 唯一手机号、微信身份、邀请码、注册时间、CUSTOMER/STORE_MANAGER身份；后台预注册店长的openId可为空 |
| UserAddress / user_address | 用户地址簿与默认地址 |
| Invitation / invitation | 邀请关系，被邀请者唯一，关联奖励券 |
| CouponTemplate / coupon_template | 现金券 / 指定规格兑换券，适用范围、有效小时数 |
| MarketingActivity / marketing_activity | 新人和邀请两项当前活动配置、是否赠花及每份报销单价 |
| UserCoupon / user_coupon | 用户持券、发放来源、不可变规则快照、状态及当前占用订单 |
| CouponEvent / coupon_event | 发放、占用、使用、释放、返还及过期历史 |
| Order / order | 订单归属、履约/支付状态、联系方式、金额、快照、关键时间 |
| OrderItem / order_item | 唯一规格明细，价格/规格/品种快照、兑换与赠花/成本数据 |
| Payment / payment | 微信支付尝试、商户单号、微信交易号、金额与状态 |
| Refund / refund | 整单退款、失败重试、微信退款号和返券完成时间 |
| OrderDispatch / order_dispatch | 定制人工派单的历次合作方、电话、操作人、备注 |
| OrderLog / order_log | 用户/管理员/系统操作和履约、支付状态变化历史 |

共 22 个模型。经营报表由订单、订单明细和券快照聚合，首期不设置容易失真的冗余汇总表。

## 3. 基本约定与约束

- 主键统一采用自增 Int；前端现有 store-1、rose 等为模拟标识，正式接口需要映射数据库 id/code，不直接当成数据库主键。
- 金额统一 Decimal(12,2)，不能使用 Float；接口输出/计算应使用十进制工具或整数分，避免 JS 浮点误差。
- 时间采用 DateTime(3)，统一按 UTC 写入和读取，报表按 Asia/Shanghai 切分日/月。
- 外键使用 Restrict，避免删除主体时级联抹去订单、库存、营销、支付历史。商品、规格、门店、模板、账号和用户采用启停。
- UserAddress 可删除，订单收货信息直接保存快照，不依赖地址外键。
- 产品 code、门店 code、微信 openId/unionId、手机号、邀请码、订单号、商户支付/退款号及操作幂等键有唯一约束。
- StoreStock 同时引用 (StoreProduct.id, productId) 与 (ProductSpec.id, productId)，数据库保证选品和规格属于同一商品。
- OrderItem.orderId 唯一，表示一单最多一项规格明细。必须通过事务确保每个有效订单实际有一项明细。
- UserCoupon.currentOrderId 唯一，当前一张券至多指向一个订单，一单最多占用一张券；Order.couponId 是历史关联，不能设唯一，否则返券后无法再次用于新订单。
- 表结构没有配置跨列 CHECK。以下角色、金额、范围、状态等业务约束需要后端校验，不能仅靠前端或本 schema 保证。

## 4. 权限与商品库存

### 后台权限

平台后台角色使用 SUPER_ADMIN、PLATFORM_ADMIN。新店长使用 User.role=STORE_MANAGER，通过手机号关联 Store.managerId；每家门店设置一位店长，同一用户可管理多家门店，并保留普通用户购物能力。旧 Admin.STORE_ADMIN 与 storeId 仅兼容历史后台账号。

新增或编辑门店时按 managerPhone 唯一匹配用户：已有用户仅调整身份，未注册则创建用户并留空 openId，首次微信授权时按验证手机号绑定。用户身份与门店关联在同一事务保存。更换店长后，旧用户仍有其他负责门店则保留店长身份，没有则恢复 CUSTOMER。不得自动启用已停用用户，不触发营销奖励。

店长操作的 storeId 必须属于服务端从 Store.managerId 查询的当前门店列表，不能信任前端传入的门店或令牌中过时的绑定；普通订单、库存、报表等后续接口也必须遵守该范围。

旧 adminRole 名称及 CONTENT_ADMIN、CUSTOMER_SERVICE 保留，是为了兼容当前 AdminRepository 显式写入 CUSTOMER_SERVICE 的代码；本次不修改接口。默认角色仍为 CUSTOMER_SERVICE，后续实现账号管理时应明确指定新角色，并调整现有注册逻辑及权限映射。不能直接把旧角色自动视为平台全权限。

普通和定制订单使用同一订单表，依靠 type、storeId 和后端查询权限隔离。定制订单不能绑定门店，门店接口必须同时限定 type=ORDINARY 和店长当前负责的门店范围，不因合作方名称与门店相同而开放访问。

### 商品与库存规则

- 所有商品均可进入 StoreProduct，按门店独立维护库存与自取、配送配置，不设商品类型限制。
- 商品至少有一项规格；价格由平台统一维护，门店不能设置售价。
- 门店商品上架至少启用自取/配送一种方式；商品、规格、门店需均可售。
- available 与 reserved 均是非负销售份数。例如“8支”规格库存10，表示10份。
- 提交普通订单：available 减 quantity，reserved 加 quantity，同时写 RESERVE 流水。
- 支付成功/0元确认：reserved 减 quantity，写 CONSUME 流水；available 不再重复扣减。
- 未支付取消或超时：reserved 减 quantity，available 加 quantity，写 RELEASE 流水。
- 已确认取消的库存恢复不能机械执行；已交付/已制作鲜花是否恢复需按实际业务判断，使用 RESTORE 流水记录。退款成功不自动代表库存可以重新售卖。
- 盘点只修改 available，保留 reserved；以 version 和原值进行条件更新，事务内写日志，冲突刷新重试。
- 历史库存流水不能修改，每次业务操作使用稳定 operationKey；不同操作和不同库存记录须使用不同键。

## 5. 注册、邀请与优惠券

- User 仅在微信身份与手机号验证成功后创建，浏览不创建注册用户。
- phone 唯一用于防止同手机号重复注册领奖；当前按一个小程序设计 openId 唯一。多个 appId 的身份模型需另行扩展。
- Invitation.inviteeId 唯一，每个新用户最多一个邀请者；禁止自邀、注册后改绑、老用户重复奖励。
- 新用户创建、邀请绑定、新人券和邀请者奖励券发放必须在同一事务完成。
- grantKey 使用 new-user:{userId}、invite:{inviteeId} 等稳定业务键，不含模板版本，避免改券后重复发奖。活动关闭时不发券，但注册关系可保留。
- CouponTemplate 现金券：cashAmount > 0，exchangeSpecId/exchangeQuantity 为空，scope 为 ALL，不按商品类型限制。
- 兑换券：指定 exchangeSpecId，exchangeQuantity > 0，cashAmount 为空，scope 与指定规格所属类型一致。
- 新人及邀请活动的奖励有效期沿用所选优惠券的 validityHours，领取时计算到期时间，不限制为固定天数。
- UserCoupon 保存发放时的名称、面额、适用范围、兑换规格/数量、活动名及报销规则。模板或活动修改不能回写已发券。
- 兑换商品通过规格确定，产品名/规格名另存快照；持券指向原规格，不能因重命名被兑换为另一个规格。
- 一单最多一张券，优惠只抵商品，不抵配送费；现金优惠取 min(面额, 商品金额)，兑换优惠为单价 × 兑换份数。
- 占用券需同时校验所有权、状态、到期时间、适用范围和规格；使用条件更新避免并发占用。
- 取消/超时释放；支付成功/0元确认使用；退款成功/0元取消返还。清空当前占用指针但保留历史订单关联，并追加 CouponEvent。
- 初版按退款返券保留原 expiresAt 设计；未到期恢复可用，到期则过期，不延长。该规则仍可在同步前修改。

## 6. 订单、支付和履约

### 状态流转

| 类型 | 正常履约状态 |
| --- | --- |
| 普通自取 | PENDING_PAYMENT → PENDING_ACCEPTANCE → ACCEPTED → READY → COMPLETED |
| 普通配送 | PENDING_PAYMENT → PENDING_ACCEPTANCE → ACCEPTED → READY → DELIVERING → COMPLETED |
| 定制配送 | PENDING_PAYMENT → PENDING_DISPATCH → DISPATCHED → DELIVERING → COMPLETED |

0元直接确认并进入待接单/待派单，paymentStatus=NOT_REQUIRED。未支付取消进入 CLOSED；已确认取消进入 CANCELLING，退款成功或0元取消完成后进入 CANCELLED。支付状态独立记录退款中、失败、完成，不能用履约状态替代。

- 同一用户与 requestKey 唯一，实现提交订单幂等；expiresAt 是未支付关闭时间，具体时长待业务配置。
- 下单事务包含金额/库存/券校验、订单/明细快照、预留库存和占用券。任何一步失败全部回滚。
- addressSnapshot 保存收货人、电话、行政区、regionCode、详细地址；storeSnapshot 保存门店名、地址、营业时间、电话；serviceSnapshot 保存服务区域、配送费、客服/配送信息。订单联系人字段单独供筛选和展示。
- couponSnapshot 保存券 id/code、来源、模板/活动 id及名称、类型、范围、兑换规则、赠花和报销单价，不能在报表中读取当前模板规则代替。
- OrderItem 保存商品/品种名称、类型、封面、规格、单位、单价、数量、支数和优惠。订单金额必须与明细一致：payableAmount=productAmount-discountAmount+deliveryFee。
- PICKUP 使用取货码，在归属门店人工核销；取货码不做全局唯一，由订单与门店共同定位。完成时记录 completedAt、completedById、fulfilledStoreId，普通订单实际履约门店首期必须等于归属门店。
- 支付回调验签后校验订单、金额和交易号，更新 Payment、Order、库存、券和流水须具备事务/幂等保障。客户端支付成功提示不能作为真实入账依据。
- 同一订单可多次发起支付，但必须避免并存多个可支付商户单；重试优先复用有效支付尝试，重开前确认旧单已关闭。schema 本身不保证每单仅一次成功支付，迟到回调和重复支付需后端补偿处理。
- 整单退款必须校验 Payment 属于该 Order、已成功支付，退款额等于实际支付额。同一订单一条逻辑退款，失败使用同一 outRefundNo 重试，不重复退款。
- 0元取消不创建 Refund/Payment，返券记录写 CouponEvent，取消原因与操作者写 OrderLog。
- 人工派单只用于定制；确认合作方承接才写入 DISPATCHED。再次派单新增记录，保留历史。
- 状态修改使用 version 或当前状态条件更新，OrderLog 留操作人、前后履约及支付状态；不允许直接跳过必需阶段。

## 7. 报表与赠花成本

- 只统计已完成且支付状态为 PAID/NOT_REQUIRED 的订单，按 completedAt 转北京时间归属日/月；取消/退款订单剔除，历史期间可能变化。
- 普通报表按 storeId 分组，定制按 type=CUSTOM 独立汇总。
- 销售份数=sum(quantity)，规格支数=quantity × stemsPerUnit；未知支数不按0估算。
- exchangeQuantity 为券兑换份数；giftQuantity 仅计指定赠花活动兑换份数，现金券和额外原价购买不计赠花。
- giftStems=giftQuantity × stemsPerUnit；报销金额=giftQuantity × reimbursementPerUnit。下单保存快照，完成后才计实际赠送，按 fulfilledStoreId 归属。
- 每份支数或报销单价未配置时保留 null，报表标记“待配置”，不生成虚假的零成本。
- 商品营业额=sum(productAmount-discountAmount)，配送收入=sum(deliveryFee)，实收=sum(payableAmount)。免费订单计销量但实收可能为0。
- 当前仅成本核算字段，不增加门店报销审批、打款、合作方结算功能。

## 8. 同步前可调整事项

1. 退款返券保留原有效期，还是按发放时的有效时长重新计算。
2. 哪些兑换活动计为赠花、每份报销单价及规格每份支数；初版不填实际业务价格。
3. 已支付/已备货/已完成退款是否恢复库存，应区别实际花材可否继续售卖。
4. 配送范围仅维护文字说明，不配置配送行政区编码；如后续需要自动判断配送范围，再扩展数据结构。
5. 未支付关闭时长、默认地址唯一性（通过事务保证）、手机号变更与微信身份合并策略。
6. 旧后台角色与新角色映射、账号创建入口；保留旧值仅用于接口兼容。
7. 默认首期每单一个规格、单一活动配置；购物车、多活动并行、部分退款等不在此版。
8. 数据库 MySQL 版本与字符集尚未读取线上配置；建议正式库使用 utf8mb4，字符串唯一字段的大小写规则需按实际排序规则确认。

## 9. 本次交付与验证边界

修改仅涉及 schema.prisma 与本说明。Prisma validate 已通过，表示语法、类型、索引声明与关系声明有效；未验证真实数据库迁移、现有数据兼容或接口运行。

当前 Prisma 客户端仍是旧版生成结果；本次不运行 generate，也不开发新增模型接口。你调整确认后再执行所需同步和客户端生成。历史模板迁移文件保留，未新建迁移或修改线上数据。

