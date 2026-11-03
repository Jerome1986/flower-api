import { PrismaService } from '../prisma/prisma.service'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { CurrentAdmin } from '../common/guards/admin-auth.guard'
import { CustomerUserRepository, select } from './customer-user.repository'
import { CustomerUserQueryDto } from './dto/customer-user-query.dto'

// 客户用户业务数据类型。
type CustomerUserRecord = Prisma.UserGetPayload<{
  // 查询返回的字段范围。
  select: typeof select
}>

// 客户用户业务服务。
@Injectable()
export class CustomerUserService {
  // 注入客户数据访问层及业务依赖。
  constructor(
    // 业务数据访问层。
    private readonly repo: CustomerUserRepository,
    // 数据库访问服务。
    private readonly prisma: PrismaService,
  ) {}

  // 校验当前账号的客户访问权限。
  private authorize(
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 不满足要求时提示：仅平台管理员可管理前端用户。
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      throw new ForbiddenException('仅平台管理员可管理前端用户')
  }

  // 查询客户记录并处理不存在的情况。
  private async find(
    // 当前操作的记录编号。
    id: number,
  ) {
    // 1. 不满足要求时提示：请选择有效的用户。
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647)
      throw new BadRequestException('请选择有效的用户')
    // 2. 查询当前用户信息。
    const user = await this.repo.findById(id)
    // 3. 不满足要求时提示：用户不存在。
    if (!user) throw new NotFoundException('用户不存在')
    // 4. 返回本次处理结果。
    return user
  }

  // 整理客户展示信息。
  private output(
    // 当前用户信息。
    user: CustomerUserRecord,
  ) {
    // 1. 返回本次处理结果。
    return {
      id: user.id,
      openid: user.openId,
      nickname: user.nickname,
      avatarUrl: user.avatar,
      mobile: user.phone,
      role: user.role,
      status: user.enabled ? 'ACTIVE' : 'INACTIVE',
      referralCode: user.inviteCode,
      registeredAt: user.registeredAt,
      lastLoginAt: user.lastLoginAt,
      updatedAt: user.updatedAt,
      managedStores: user.managedStores,
    }
  }

  // 查询客户列表。
  async list(
    // 列表查询条件。
    query: CustomerUserQueryDto,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 校验当前账号的客户访问权限。
    this.authorize(admin)

    // 2. 查询当前页的数据列表、汇总总数或总金额。
    const [list, total] = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => this.repo.findPage(query, tx),
    )
    // 3. 返回本次处理结果。
    return {
      list: list.map((item) => this.output(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  // 查询客户详情。
  async detail(
    // 当前操作的记录编号。
    id: number,
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 校验当前账号的客户访问权限。
    this.authorize(admin)
    // 2. 整理客户展示信息。
    return this.output(await this.find(id))
  }

  // 设置客户启用状态。
  async status(
    // 当前操作的记录编号。
    id: number,
    // 当前业务状态。
    status: 'ACTIVE' | 'INACTIVE',
    // 当前管理员信息。
    admin: CurrentAdmin,
  ) {
    // 1. 校验当前账号的客户访问权限。
    this.authorize(admin)
    // 2. 查询客户记录并处理不存在的情况。
    await this.find(id)
    // 3. 记录更新结果：当前用户信息。
    const user = await this.repo.updateStatus(id, {
      enabled: status === 'ACTIVE',
    })
    // 4. 整理客户展示信息。
    return this.output(user)
  }
}
