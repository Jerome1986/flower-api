import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import { CustomerUserRepository } from './customer-user.repository';
import { CustomerUserQueryDto } from './dto/customer-user-query.dto';
const select = {
  id: true,
  openId: true,
  phone: true,
  role: true,
  nickname: true,
  avatar: true,
  inviteCode: true,
  enabled: true,
  registeredAt: true,
  lastLoginAt: true,
  updatedAt: true,
  managedStores: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

type CustomerUserRecord = Prisma.UserGetPayload<{ select: typeof select }>;

@Injectable()
export class CustomerUserService {
  // 注入客户数据访问层及业务依赖。
  constructor(private readonly repo: CustomerUserRepository) {}

  // 校验当前账号的客户访问权限。
  private authorize(admin: CurrentAdmin) {
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      throw new ForbiddenException('仅平台管理员可管理前端用户');
  }

  // 查询客户记录并处理不存在的情况。
  private async find(id: number) {
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647)
      throw new BadRequestException('请选择有效的用户');
    const user = await this.repo.findUniqueUser({ where: { id }, select });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  // 整理客户展示信息。
  private output(user: CustomerUserRecord) {
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
    };
  }

  // 查询客户列表。
  async list(query: CustomerUserQueryDto, admin: CurrentAdmin) {
    this.authorize(admin);
    const keyword = query.keyword?.trim();
    const enabled =
      query.status === 'ACTIVE'
        ? true
        : query.status === 'INACTIVE'
          ? false
          : undefined;
    const where: Prisma.UserWhereInput = {
      enabled,
      ...(keyword
        ? {
            OR: [
              { phone: { contains: keyword } },
              { nickname: { contains: keyword } },
              { openId: { contains: keyword } },
              { inviteCode: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [list, total] = await this.repo.transaction([
      this.repo.findManyUser({
        where,
        select,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { registeredAt: 'desc' },
      }),
      this.repo.countUser({ where }),
    ]);
    return {
      list: list.map((item) => this.output(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // 查询客户详情。
  async detail(id: number, admin: CurrentAdmin) {
    this.authorize(admin);
    return this.output(await this.find(id));
  }

  // 设置客户启用状态。
  async status(id: number, status: 'ACTIVE' | 'INACTIVE', admin: CurrentAdmin) {
    this.authorize(admin);
    await this.find(id);
    const user = await this.repo.updateUser({
      where: { id },
      data: { enabled: status === 'ACTIVE' },
      select,
    });
    return this.output(user);
  }
}
