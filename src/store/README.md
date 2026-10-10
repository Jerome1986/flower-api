# 门店模块

所有接口以 `/api/store` 为前缀，使用后台登录令牌：`Authorization: Bearer <token>`。

| 方法   | 路径                    | 功能                                                    |
| ------ | ----------------------- | ------------------------------------------------------- |
| GET    | `/api/store`            | 分页列表，支持 page、pageSize、keyword、enabled、isOpen |
| GET    | `/api/store/:id`        | 门店详情                                                |
| POST   | `/api/store`            | 新增门店                                                |
| PATCH  | `/api/store/:id`        | 部分编辑门店                                            |
| PATCH  | `/api/store/:id/status` | 更新 enabled 或 isOpen，至少提供一个                    |
| DELETE | `/api/store/:id`        | 停用门店并设置休息，保留历史数据，不物理删除            |

返回沿用 `{ code: 200, message, data }`。列表 data 为 `{ items, total, page, pageSize }`。页码从1开始，默认每页10条，最多100条；按 sortOrder 升序、id 降序排序。关键词匹配编号、名称、地址、电话；布尔查询参数仅接受 `true` 或 `false`。

平台权限：SUPER_ADMIN、PLATFORM_ADMIN 可查询及维护全部门店。小程序店长使用type=user的JWT，通过User.role=STORE_MANAGER及Store.managerId读取全部负责门店；不能维护门店资料。旧Admin.STORE_ADMIN仅兼容读取原绑定门店。每次请求核验JWT、当前账号启用状态、身份和全部门店关联，不信任令牌内过时的权限。

新增必填：name、address、phone、businessHours、managerPhone。可选：enabled、isOpen、deliveryArea、deliveryFee、servicePhone、deliveryStaff、sortOrder。编辑时不传managerPhone保留原店长；传入有效手机号即更换店长，不接受空值。

- managerPhone为11位国内手机号，独立于门店联系电话。以User.phone唯一匹配：存在则赋予STORE_MANAGER身份，不重建用户、不改微信资料；不存在则创建店长用户，生成邀请码，openId留空。不创建Admin或默认密码，不触发新人发券与邀请奖励。
- 每家门店设置一位店长，同一用户可负责多家门店。更换店长只影响当前门店，旧店长若仍管理其他门店则保留身份；已无负责门店则恢复CUSTOMER。停用用户不能设置为店长，不会被自动重新启用。
- 关联用户、调整身份与保存门店在Serializable事务中完成，手机号唯一冲突、编号碰撞、事务死锁最多整体重试5次。门店保存失败时相关用户变更回滚。
- 列表和详情返回managerId、managerPhone、managerName；关键词支持搜索店长手机号。不返回微信标识或其他用户隐私字段。

- code 由后端自动生成六位大写字母数字组合，至少各含一个字母和数字；数据库唯一约束兜底，碰撞最多尝试5次，耗尽返回503。新增和编辑均不接受前端传入code，编号在列表和详情只读展示。历史门店编号保持原样。
- deliveryFee 接口使用整数分（如550表示5.50元），数据库保存Decimal元；禁止负数及小数分。
- 配送范围仅通过 deliveryArea 维护文字说明，无需填写配送行政区编码。
- 空字符串或null可清空 deliveryArea、servicePhone、deliveryStaff；其他可编辑字段不接受null。
- enabled 和 isOpen 是独立状态；实际业务可用需同时为true，后续下单服务必须检查两者。停用不取消已有订单。
- 更新时间及主键不可通过请求维护；未知参数和空更新被拒绝。
- 不存在返回404，身份失效返回401，越权返回403。

后台 `/stores/list` 已使用真实接口实现列表筛选、分页、新增、编辑、设置/更换店长、详情、启停用及营业切换。前端配送费输入/展示为元，提交转换为分。当前仅平台菜单有此入口；店长小程序登录、微信首次授权绑定及多店切换页面仍需在小程序业务开发时接入，不能通过后台账号密码登录直接使用User身份。

## 验证与数据库

`store.controller.spec.ts` 使用真实Nest HTTP路由、校验管道和响应拦截器，隔离模拟JWT验证与Prisma，不访问真实数据库。覆盖权限隔离、字段校验、分页筛选、金额转换、重复编号及软停用等。执行：`pnpm exec jest --runInBand store.controller.spec.ts`。

后台使用真实Vue页面脚本及隔离API验证列表、新增、编辑、金额转换、状态和失败恢复，执行：在 flower-admin 下运行 `node scripts/check-store-flow.cjs`。后台另需通过类型检查及构建。

本次模型新增UserRole、User.role、Store.managerId及双向关系，并将User.openId改为可空。未执行 Prisma 同步、迁移或生成；维护者需按自己的流程同步数据库并重新生成Prisma客户端，之后才能运行新接口。不要用伪造openId替代首次微信授权绑定；将来微信登录须按已验证手机号绑定现有User，禁止重复创建用户或覆盖已有微信绑定。小程序公开门店查询与下单接口不在本次范围内。
