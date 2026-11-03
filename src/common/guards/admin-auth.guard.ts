import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { adminRole } from '@prisma/client'
import type { Request } from 'express'
import { createHash } from 'node:crypto'
import { AdminRepository } from '../../admin/admin.repository'

// 公共接口接口数据结构。
export interface CurrentAdmin {
  // 记录编号。
  id: number
  // 管理员登录名。
  username: string
  // 账号角色。
  role: adminRole | 'STORE_MANAGER'
  // 门店编号。
  storeId: number | null
  /** 小程序店长当前负责的全部门店，按每次请求的数据库结果加载 */
  storeIds?: number[]
}

// 公共接口接口数据结构。
export interface AdminRequest extends Request {
  // 当前管理员信息。
  admin: CurrentAdmin
}

// 公共接口数据与处理逻辑。
@Injectable()
export class AdminAuthGuard implements CanActivate {
  // 注入令牌验证和账号查询服务。
  constructor(
    // 身份令牌服务。
    private readonly jwt: JwtService,
    // 业务数据访问层。
    private readonly repo: AdminRepository,
  ) {}

  // 验证登录令牌及账号当前状态，密码重置后使旧令牌失效。
  async canActivate(
    // 当前接口执行上下文。
    context: ExecutionContext,
  ): Promise<boolean> {
    // 1. 获取请求令牌并验证签名及身份类型。
    const request = context.switchToHttp().getRequest<AdminRequest>()
    // 请求令牌匹配结果。
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '')
    if (!match) throw new UnauthorizedException('请先登录管理后台')

    // 用户编号。
    let userId: number
    // 业务类型。
    let type: string
    // 密码版本号。
    let passwordVersion: string | undefined
    try {
      // 令牌中解析出的身份信息。
      const payload = await this.jwt.verifyAsync<{
        // 用户编号。
        userId: number
        // 业务类型。
        type: string
        // 密码版本号。
        passwordVersion?: string
      }>(match[1])
      if (
        !['admin', 'user'].includes(payload.type) ||
        !Number.isSafeInteger(payload.userId) ||
        payload.userId <= 0
      ) {
        throw new Error('Invalid admin token')
      }
      userId = payload.userId
      type = payload.type
      passwordVersion = payload.passwordVersion
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录')
    }

    if (type === 'user') {
      // 2. 店长使用小程序身份，按当前负责门店校验权限。
      const user = await this.repo.findAuthManager(userId)
      if (
        !user?.enabled ||
        user.role !== 'STORE_MANAGER' ||
        !user.managedStores.length
      ) {
        throw new UnauthorizedException('店长身份不可用，请重新登录')
      }
      request.admin = {
        id: user.id,
        username: user.phone,
        role: 'STORE_MANAGER',
        storeId: null,
        storeIds: user.managedStores.map((store) => store.id),
      }
      return true
    }

    // 3. 后台账号以数据库当前身份为准，停用、角色变更或密码重置即时生效。
    const admin = await this.repo.findAuthAdmin(userId)
    if (!admin?.status)
      throw new UnauthorizedException('账号不可用，请重新登录')
    if (
      passwordVersion !==
      createHash('sha256').update(admin.password).digest('hex')
    )
      throw new UnauthorizedException('登录已失效，请重新登录')
    // 4. 只将业务所需账号信息附加到请求，不传播密码摘要。
    request.admin = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      storeId: admin.storeId,
    }
    return true
  }
}
