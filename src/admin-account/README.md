# 后台账号管理

平台设置 → 后台账号使用现有 Admin 表，无需新增数据库字段。店长继续通过门店信息中的手机号设置，不在这里新增店长账号。历史角色可查询、启停、重置密码，编辑保存后转换为所选平台角色并解除旧门店绑定。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/admin/accounts | 分页查询账号，支持 keyword、role、status、page、pageSize |
| GET | /api/admin/accounts/:id | 获取账号详情 |
| POST | /api/admin/accounts | 新增后台账号 |
| PATCH | /api/admin/accounts/:id | 编辑账号 |
| PATCH | /api/admin/accounts/:id/status | 启停账号，参数 status |
| PATCH | /api/admin/accounts/:id/password | 重置密码，参数 password |

新增字段：username、displayName（可为空）、role、status、password。编辑不接收 password；密码使用单独的重置接口。username 为3至64位字母、数字、下划线、点或短横线；密码为6至64位且 UTF-8 不超过72字节，使用 bcrypt 保存。所有账号响应均排除密码摘要。

权限：SUPER_ADMIN 和 PLATFORM_ADMIN 可查询；只有 SUPER_ADMIN 可操作超级管理员或授予超级管理员身份。当前登录账号不能停用自己或修改自己的角色；至少保留一个启用的超级管理员。维护事务使用 Serializable 隔离级别并有限重试，以防并发权限变更和重复账号。

账号停用、角色变更每次请求以数据库当前值为准。重置密码后旧 JWT 立即失效；令牌携带密码摘要的 SHA-256 指纹，鉴权时比对而不对外返回密码摘要。本次升级前未携带指纹的后台令牌需要重新登录，小程序店长令牌不受影响。

旧的匿名 POST /api/admin/register 入口已关闭，新增账号统一使用受鉴权保护的接口。默认账号仅在后台账号表为空时初始化，重命名原 admin 账号后不会再自动创建默认账号。登录成功更新 lastLoginAt。

验证：`npx jest --runInBand admin-account admin-auth`、`npx nest build`、`node scripts/check-admin-accounts.cjs`。数据库脚本仅在回滚事务中新增临时账号，测试完成后检查原账号状态未变。
