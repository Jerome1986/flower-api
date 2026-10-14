# 用户收货地址接口

前缀 /api；使用用户 JWT（Authorization: Bearer token）。普通用户与店长均可管理自己的收货地址。停用、已删除用户及无效 Token 返回 401。

## 路由

| 方法   | 路径                        | 成功 HTTP | data                                |
| ------ | --------------------------- | --------- | ----------------------------------- |
| GET    | /user/addresses             | 200       | Address[]，默认在前，其余按 id 升序 |
| POST   | /user/addresses             | 201       | 保存后的 Address                    |
| PUT    | /user/addresses/:id         | 200       | 完整替换后的 Address                |
| DELETE | /user/addresses/:id         | 200       | { id: number }                      |
| POST   | /user/addresses/:id/default | 200       | 设为默认后的 Address                |

成功统一包裹为 { code: 200, message: 'success', data }。错误使用现有 Nest 格式，HTTP 400/401/404/409。

## 创建/更新请求

```json
{
  "name": "收花人",
  "phone": "13800000000",
  "province": "浙江省",
  "city": "杭州市",
  "district": "西湖区",
  "detail": "花园路18号",
  "isDefault": false,
  "regionCode": "330106"
}
```

- name、province、city、district：去首尾空白，必填非空字符串，最多64字符。
- phone：去首尾空白，1开头的11位手机号。
- detail：去首尾空白，必填，最多500字符。
- isDefault：必填布尔值，不接受字符串或 null。
- regionCode：可省略，最多32字符的字符串；省略/空串保存为 null，不接受请求 null。
- 禁止 userId、id、region 等未声明 Body 字段；用户归属只取 Token。PUT 必须提供完整必填字段，不是 PATCH。
- 地址 ID 是 1～2147483647 的整数。不存在与他人地址统一返回404，避免暴露归属。

Address 为上述结构加数字 id，regionCode 返回 string 或 null。不返回 userId 及内部审计字段。前端将 id 转为字符串，将省市区组合为只用于展示的 region；不把组合 region 回传，也不拆分自然语言地区文本。

## 默认地址与事务规则

1. 第一条地址自动设为默认，即使 isDefault=false。
2. 新增/编辑传 true 或调用 default 路由时，其他地址取消默认。
3. 取消当前默认时，优先保留其他已有默认，否则提升其他最早 id；只有一条则仍保持默认。
4. 删除默认后提升剩余最早地址；删除最后一条后地址簿为空。
5. 同用户的所有写操作先锁定 user 行（参数化 SELECT ... FOR UPDATE），在同一 ReadCommitted 事务内检查归属、更新地址并归一默认状态；已有多个默认的历史状态在写入时修复。
6. Prisma P2034 事务冲突最多尝试三次，再返回409。客户端不得因未知网络结果自动重复创建地址；页面保留表单供用户确认。
7. 不修改数据库 schema，不执行迁移，不触碰旧本地演示数据。其他未来地址写入入口必须遵守同一用户锁协议。

## 验证（2026-10-11）

- pnpm test -- --runInBand addresses：2组、27项通过。覆盖校验、Token、用户隔离、默认选择、删除、事务回滚及冲突重试。
- pnpm build：通过。
- 构建后 node scripts/check-addresses.cjs：65次真实 HTTP/MySQL 检查通过，包含并发创建、并发设置默认、并发取消默认。脚本以随机密钥和独立端口加载真实控制器/服务，创建本次临时普通用户/店长，finally 精确清理这些用户和地址；不使用现有测试手机号，不创建订单，不调用支付。
- 脚本禁止 NODE_ENV=production，使用当前 DATABASE_URL；不会打印连接凭据。清理失败会输出本次专用用户 ID 以便核对。
- 全量后端 Jest：167项通过，1项已存在的模板测试失败：app.controller.spec.ts 期待 Hello World!，当前实现返回 jfx；本模块没有改动该实现或测试。
- 当前 localhost:3000/api/user/addresses 的无令牌请求返回401，说明运行服务已加载路由。

前端已接入相同协议；真机操作仍待验收。自动化真实 SQL 验证不等同于原生页面、事件通道和键盘体验的真机验收。
