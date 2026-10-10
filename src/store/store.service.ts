import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, Store } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import { QueryStoreDto } from './dto/query-store.dto';
import { StoreStatusDto } from './dto/store-status.dto';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { generateStoreCode } from '../utils/generate-store-code';
import { randomBytes } from 'node:crypto';

// 门店查询统一关联店长基本资料，不读取微信标识等无关用户信息。
const managerInclude = {
  manager: { select: { id: true, phone: true, nickname: true } },
} as const;
type StoreWithManager = Store & {
  managerId: number | null;
  manager: { id: number; phone: string; nickname: string | null } | null;
};

@Injectable()
export class StoreService {
  // 注入 Prisma 服务，供门店查询及用户身份事务使用。
  constructor(private readonly prisma: PrismaService) {}

  // 判断当前身份是否为有权维护全部门店的平台管理员。
  private isPlatform(admin: CurrentAdmin) {
    // 1. 仅超级管理员和平台管理员视为平台维护身份。
    return admin.role === 'SUPER_ADMIN' || admin.role === 'PLATFORM_ADMIN';
  }

  // 校验平台维护权限，非平台身份直接拒绝操作。
  private requirePlatform(admin: CurrentAdmin) {
    // 1. 判断当前角色，无平台权限时抛出禁止访问异常。
    if (!this.isPlatform(admin))
      throw new ForbiddenException('仅平台管理员可维护门店');
  }

  // 按当前登录身份构建可读取的门店范围。
  private readScope(admin: CurrentAdmin): Prisma.StoreWhereInput {
    // 1. 平台管理员可读取全部门店，不追加门店 ID 条件。
    if (this.isPlatform(admin)) return {};
    // 2. 小程序店长仅可读取服务端确认的全部负责门店。
    if (admin.role === 'STORE_MANAGER' && admin.storeIds?.length)
      return { id: { in: admin.storeIds } };
    // 3. 兼容旧后台门店账号，仅允许读取原绑定门店。
    if (admin.role === 'STORE_ADMIN' && admin.storeId)
      return { id: admin.storeId };
    // 4. 其余身份或未绑定门店的账号均拒绝访问。
    throw new ForbiddenException('无门店访问权限');
  }

  // 将门店及店长查询结果转换为接口展示结构。
  private serialize(store: StoreWithManager) {
    // 1. 显式返回允许展示的字段，并将店长资料展开为平级字段。
    return {
      id: store.id,
      managerId: store.managerId,
      managerPhone: store.manager?.phone ?? null,
      managerName: store.manager?.nickname ?? null,
      code: store.code,
      name: store.name,
      address: store.address,
      phone: store.phone,
      businessHours: store.businessHours,
      enabled: store.enabled,
      isOpen: store.isOpen,
      deliveryArea: store.deliveryArea,
      servicePhone: store.servicePhone,
      deliveryStaff: store.deliveryStaff,
      sortOrder: store.sortOrder,
      createdAt: store.createdAt,
      updatedAt: store.updatedAt,
      // 2. 将数据库中的 Decimal 元转换为接口约定的整数分。
      deliveryFee: Math.round(Number(store.deliveryFee) * 100),
    };
  }

  // 将提交字段转换为门店写入数据，店长关联由事务单独处理。
  private data(dto: UpdateStoreDto) {
    // 1. 分离配送费和店长手机号，手机号不能直接写入门店字段。
    const { deliveryFee, managerPhone: _managerPhone, ...rest } = dto;
    // 2. 保留普通字段，仅转换本次提交的可选字段。
    return {
      ...rest,
      // 3. 配送费从整数分转换为 Decimal 元，避免浮点运算写入。
      ...(deliveryFee !== undefined
        ? { deliveryFee: new Prisma.Decimal(deliveryFee).div(100) }
        : {}),
      // 4. 可选文本提交空字符串时写入 null，未提交时保持原值。
      ...(dto.deliveryArea !== undefined
        ? { deliveryArea: dto.deliveryArea || null }
        : {}),
      ...(dto.servicePhone !== undefined
        ? { servicePhone: dto.servicePhone || null }
        : {}),
      ...(dto.deliveryStaff !== undefined
        ? { deliveryStaff: dto.deliveryStaff || null }
        : {}),
    };
  }

  // 将已知数据库异常转换为业务异常，其余异常原样抛出。
  private rethrow(error: unknown): never {
    // 1. 识别 Prisma 已知异常，并转换唯一冲突或记录不存在的错误。
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new ConflictException('门店编号已存在');
      if (error.code === 'P2025') throw new NotFoundException('门店不存在');
    }
    // 2. 未匹配的异常继续向上抛出，交由统一异常处理。
    throw error;
  }

  // 在事务中按唯一手机号获取或创建店长用户，并返回用户 ID。
  private async resolveManager(tx: Prisma.TransactionClient, phone: string) {
    // 1. 已有用户仅赋予店长身份，未注册则创建用户并生成邀请码。
    const user = await tx.user.upsert({
      where: { phone },
      create: {
        phone,
        role: 'STORE_MANAGER',
        inviteCode: randomBytes(12).toString('hex'),
      },
      update: { role: 'STORE_MANAGER' },
      select: { id: true, enabled: true },
    });
    // 2. 停用用户禁止设置为店长，抛出异常使本次事务回滚。
    if (!user.enabled)
      throw new ConflictException(
        '该手机号用户已停用，请先启用用户再设置为店长',
      );
    // 3. 返回用户 ID，供门店建立店长关联。
    return user.id;
  }

  // 以可串行化事务执行写入，遇到唯一冲突或并发事务冲突时有限重试。
  private async write<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // 1. 最多尝试五次，确保门店、用户及身份变更作为整体提交或回滚。
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        // 2. 在可串行化隔离级别下执行传入的完整写入流程。
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        // 3. 唯一约束或并发事务冲突可重试，其他异常立即转换并抛出。
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        )
          continue;
        this.rethrow(error);
      }
    }
    // 4. 所有尝试均发生冲突时，提示调用方稍后重试。
    throw new ServiceUnavailableException('门店信息保存繁忙，请稍后重试');
  }

  // 新增门店：按手机号设置店长、自动生成编号并原子保存。
  async create(dto: CreateStoreDto, admin: CurrentAdmin) {
    // 1. 确认当前账号具有平台维护权限。
    this.requirePlatform(admin);
    // 2. 开启可重试事务，将店长用户处理与门店创建放在一起。
    const store = await this.write(async (tx) => {
      // 3. 按手机号复用或创建用户，并赋予店长身份。
      const managerId = await this.resolveManager(tx, dto.managerPhone);
      // 4. 转换提交字段、生成六位编号，并将门店关联到店长用户。
      return tx.store.create({
        data: {
          ...this.data(dto),
          code: generateStoreCode(),
          name: dto.name,
          address: dto.address,
          phone: dto.phone,
          businessHours: dto.businessHours,
          manager: { connect: { id: managerId } },
        },
        include: managerInclude,
      });
    });
    // 5. 事务成功后转换接口结构，返回门店及店长信息。
    return this.serialize(store);
  }

  // 分页查询权限范围内的门店，支持关键词与启用、营业状态筛选。
  async findAll(query: QueryStoreDto, admin: CurrentAdmin) {
    // 1. 清理关键词首尾空格，空关键词不追加模糊匹配条件。
    const keyword = query.keyword?.trim();
    // 2. 合并身份范围、状态条件及门店资料和店长手机号搜索条件。
    const where: Prisma.StoreWhereInput = {
      ...this.readScope(admin),
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
      ...(query.isOpen !== undefined ? { isOpen: query.isOpen } : {}),
      ...(keyword
        ? {
            OR: [
              ...['code', 'name', 'address', 'phone'].map((field) => ({
                [field]: { contains: keyword },
              })),
              { manager: { is: { phone: { contains: keyword } } } },
            ],
          }
        : {}),
    };
    // 3. 在同一查询事务中读取分页记录和总数，按排序值及 ID 排列。
    const [items, total] = await this.prisma.$transaction([
      this.prisma.store.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ sortOrder: 'asc' }, { id: 'desc' }],
        include: managerInclude,
      }),
      this.prisma.store.count({ where }),
    ]);
    // 4. 转换每条门店记录，返回列表、总数和分页信息。
    return {
      items: items.map((store) => this.serialize(store)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // 查询单家门店详情，并检查当前身份是否有权读取该门店。
  async findOne(id: number, admin: CurrentAdmin) {
    // 1. 确认当前账号拥有门店读取身份和有效门店范围。
    this.readScope(admin);
    // 2. 非平台身份必须命中旧账号绑定门店或店长负责门店列表。
    if (
      !this.isPlatform(admin) &&
      admin.storeId !== id &&
      !admin.storeIds?.includes(id)
    )
      throw new ForbiddenException('只能访问本店信息');
    // 3. 按主键读取门店并关联店长展示资料。
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: managerInclude,
    });
    // 4. 门店不存在时返回业务错误，存在时转换为详情结构。
    if (!store) throw new NotFoundException('门店不存在');
    return this.serialize(store);
  }

  // 部分编辑门店，按需更换店长并维护新旧店长身份。
  async update(id: number, dto: UpdateStoreDto, admin: CurrentAdmin) {
    // 1. 校验平台维护权限，拒绝没有任何更新字段的请求。
    this.requirePlatform(admin);
    if (!Object.keys(dto).length)
      throw new BadRequestException('请提供需要更新的门店信息');
    // 2. 将门店更新与新旧店长身份调整放入同一可重试事务。
    const store = await this.write(async (tx) => {
      // 3. 查询门店及原店长 ID，不存在则终止事务。
      const current = await tx.store.findUnique({
        where: { id },
        select: { managerId: true },
      });
      if (!current) throw new NotFoundException('门店不存在');
      // 4. 提交店长手机号时解析新店长，未提交时保留原关联。
      const managerId =
        dto.managerPhone !== undefined
          ? await this.resolveManager(tx, dto.managerPhone)
          : current.managerId;
      // 5. 仅更新提交的普通字段，按需连接新店长并读取展示资料。
      const updated = await tx.store.update({
        where: { id },
        data: {
          ...this.data(dto),
          ...(dto.managerPhone !== undefined
            ? { manager: { connect: { id: managerId! } } }
            : {}),
        },
        include: managerInclude,
      });
      // 6. 更换店长后检查旧店长是否仍有负责门店，无门店时恢复普通用户身份。
      if (
        current.managerId &&
        current.managerId !== managerId &&
        (await tx.store.count({ where: { managerId: current.managerId } })) ===
          0
      ) {
        await tx.user.updateMany({
          where: { id: current.managerId, role: 'STORE_MANAGER' },
          data: { role: 'CUSTOMER' },
        });
      }
      // 7. 返回事务内的更新结果，等待整个事务成功提交。
      return updated;
    });
    // 8. 事务成功后转换门店及店长信息，返回更新结果。
    return this.serialize(store);
  }

  // 更新门店启用或营业状态，复用完整编辑流程的权限与事务处理。
  async updateStatus(id: number, dto: StoreStatusDto, admin: CurrentAdmin) {
    // 1. 至少提交一种状态，避免执行无意义更新。
    if (dto.enabled === undefined && dto.isOpen === undefined)
      throw new BadRequestException('请提供启用或营业状态');
    // 2. 交给统一编辑流程校验权限并持久化状态。
    return this.update(id, dto, admin);
  }

  // 停用门店并设为休息，保留门店和全部历史业务关系。
  async remove(id: number, admin: CurrentAdmin) {
    // 1. 复用编辑流程关闭启用和营业状态，不执行物理删除。
    return this.update(id, { enabled: false, isOpen: false }, admin);
  }
}
