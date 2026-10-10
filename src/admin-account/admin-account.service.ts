import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import {
  AdminAccountQueryDto,
  CreateAdminAccountDto,
  SaveAdminAccountDto,
} from './admin-account.dto';

const select = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  storeId: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdminSelect;

@Injectable()
export class AdminAccountService {
  // 注入数据库服务，统一维护后台账号。
  constructor(private readonly prisma: PrismaService) {
    // 1. 复用项目数据库连接。
  }

  // 校验平台后台账号管理权限。
  private authorize(admin: CurrentAdmin) {
    // 1. 拒绝门店和历史业务角色访问账号设置。
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      throw new ForbiddenException('仅平台管理员可管理后台账号');
  }

  // 查询目标账号，响应中不读取密码摘要。
  private async find(id: number, db: Prisma.TransactionClient = this.prisma) {
    // 1. 检查账号编号并查询当前记录。
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647)
      throw new BadRequestException('请选择有效的后台账号');
    const item = await db.admin.findUnique({ where: { id }, select });
    // 2. 对不存在的账号返回明确提示。
    if (!item) throw new NotFoundException('后台账号不存在');
    return item;
  }

  // 控制超级管理员账号的维护权限。
  private checkRole(
    admin: CurrentAdmin,
    targetRole: string,
    newRole = targetRole,
  ) {
    // 1. 普通平台管理员不能操作超级管理员或将账号升级为超级管理员。
    if (
      admin.role !== 'SUPER_ADMIN' &&
      (targetRole === 'SUPER_ADMIN' || newRole === 'SUPER_ADMIN')
    )
      throw new ForbiddenException('仅超级管理员可维护超级管理员账号');
  }

  // 校验账号信息并清理显示名称。
  private fields(dto: SaveAdminAccountDto) {
    // 1. 校验账号格式及可分配的两种平台角色。
    if (!/^[a-zA-Z0-9_.-]{3,64}$/.test(dto.username))
      throw new BadRequestException(
        '账号需为3至64位字母、数字、下划线、点或短横线',
      );
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(dto.role))
      throw new BadRequestException('请选择有效的平台账号角色');
    // 2. 仅写入明确的账号信息，店长绑定继续由门店管理处理。
    return {
      username: dto.username,
      displayName: dto.displayName?.trim() || null,
      role: dto.role,
      status: dto.status,
    };
  }

  // 校验密码并生成不可逆密码摘要。
  private async password(value: string) {
    // 1. bcrypt 最多处理72字节，拒绝超长密码避免截断。
    if (
      typeof value !== 'string' ||
      value.length < 6 ||
      value.length > 64 ||
      Buffer.byteLength(value, 'utf8') > 72 ||
      !value.trim()
    )
      throw new BadRequestException('密码需为6至64位，且不能超过72字节');
    // 2. 使用与现有登录一致的 bcrypt 算法加密。
    return bcrypt.hash(value, 10);
  }

  // 串行化账号维护事务，避免并发停用最后一位超级管理员。
  private async write<T>(action: (tx: Prisma.TransactionClient) => Promise<T>) {
    // 1. 串行事务冲突时有限重试，统一转换账号重复错误。
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002')
            throw new ConflictException('该账号已存在');
          if (error.code === 'P2034' && attempt < 2) continue;
          if (error.code === 'P2034')
            throw new ConflictException('账号正在被修改，请稍后重试');
        }
        throw error;
      }
    }
    // 2. 重试耗尽时提示重新操作。
    throw new ConflictException('账号正在被修改，请稍后重试');
  }

  // 在事务内确认操作人当前身份，避免权限变更后的并发写入。
  private async actor(admin: CurrentAdmin, tx: Prisma.TransactionClient) {
    // 1. 以当前数据库角色和状态校验操作权限。
    const current = await this.find(admin.id, tx);
    if (!current.status) throw new ForbiddenException('当前账号已停用');
    this.authorize(current);
    return current;
  }

  // 防止误停用当前账号及清空可用超级管理员。
  private async protect(
    old: Awaited<ReturnType<AdminAccountService['find']>>,
    role: string,
    status: boolean,
    admin: CurrentAdmin,
    tx: Prisma.TransactionClient,
  ) {
    // 1. 当前登录账号不能停用自己或修改自己的角色。
    if (old.id === admin.id && (!status || role !== old.role))
      throw new BadRequestException('不能停用当前登录账号或修改自己的角色');
    // 2. 降级或停用超级管理员前确认仍有其他启用的超级管理员。
    if (
      old.role === 'SUPER_ADMIN' &&
      old.status &&
      (role !== 'SUPER_ADMIN' || !status)
    ) {
      const count = await tx.admin.count({
        where: { role: 'SUPER_ADMIN', status: true, id: { not: old.id } },
      });
      if (!count)
        throw new BadRequestException('至少需要保留一个启用的超级管理员');
    }
  }

  // 按账号、显示名称、角色和状态分页查询后台账号。
  async list(query: AdminAccountQueryDto, admin: CurrentAdmin) {
    // 1. 校验权限并构造筛选条件。
    this.authorize(admin);
    const keyword = query.keyword?.trim();
    const where: Prisma.AdminWhereInput = {
      role: query.role,
      status: query.status,
      ...(keyword
        ? {
            OR: [
              { username: { contains: keyword } },
              { displayName: { contains: keyword } },
            ],
          }
        : {}),
    };
    // 2. 查询分页账号及总数，不返回密码或令牌。
    const [list, total] = await this.prisma.$transaction([
      this.prisma.admin.findMany({
        where,
        select,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.admin.count({ where }),
    ]);
    return { list, total, page: query.page, pageSize: query.pageSize };
  }

  // 查询账号详情供编辑回显。
  async detail(id: number, admin: CurrentAdmin) {
    // 1. 校验权限并返回安全的账号信息。
    this.authorize(admin);
    return this.find(id);
  }

  // 创建平台后台账号并安全保存初始密码。
  async create(dto: CreateAdminAccountDto, admin: CurrentAdmin) {
    // 1. 校验字段、操作权限并加密密码。
    this.authorize(admin);
    const data = this.fields(dto);
    this.checkRole(admin, dto.role);
    const password = await this.password(dto.password);
    // 2. 在事务中重新检查权限后新增账号，数据库约束防止重复。
    return this.write(async (tx) => {
      const actor = await this.actor(admin, tx);
      this.checkRole(actor, dto.role);
      return tx.admin.create({ data: { ...data, password }, select });
    });
  }

  // 编辑账号名称、角色和状态，不修改密码。
  async update(id: number, dto: SaveAdminAccountDto, admin: CurrentAdmin) {
    // 1. 校验权限及提交字段，在事务中读取当前身份和目标账号。
    this.authorize(admin);
    const data = this.fields(dto);
    return this.write(async (tx) => {
      const actor = await this.actor(admin, tx);
      const old = await this.find(id, tx);
      // 2. 检查角色权限及账号保护规则，切换为平台角色后清除旧门店绑定。
      this.checkRole(actor, old.role, dto.role);
      await this.protect(old, dto.role, dto.status, actor, tx);
      return tx.admin.update({
        where: { id },
        data: { ...data, storeId: null },
        select,
      });
    });
  }

  // 单独启用或停用后台账号，保留历史业务记录。
  async status(id: number, status: boolean, admin: CurrentAdmin) {
    // 1. 校验权限，在事务中确认目标和操作人当前状态。
    this.authorize(admin);
    return this.write(async (tx) => {
      const actor = await this.actor(admin, tx);
      const old = await this.find(id, tx);
      // 2. 校验超级管理员权限与自停用保护，仅更新状态。
      this.checkRole(actor, old.role);
      await this.protect(old, old.role, status, actor, tx);
      return tx.admin.update({ where: { id }, data: { status }, select });
    });
  }

  // 重置后台登录密码，不在响应中返回密码摘要。
  async resetPassword(id: number, value: string, admin: CurrentAdmin) {
    // 1. 校验权限及密码格式并生成新摘要。
    this.authorize(admin);
    const password = await this.password(value);
    return this.write(async (tx) => {
      // 2. 确认当前角色权限后更新密码，原登录令牌由鉴权逻辑失效。
      const actor = await this.actor(admin, tx);
      const old = await this.find(id, tx);
      this.checkRole(actor, old.role);
      return tx.admin.update({ where: { id }, data: { password }, select });
    });
  }
}
