import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import {
  CouponTemplateQueryDto,
  SaveCouponTemplateDto,
} from './coupon-template.dto';

const specInclude = {
  product: {
    select: { id: true, name: true, coverImage: true, enabled: true },
  },
} satisfies Prisma.ProductSpecInclude;
const include = {
  exchangeSpec: { include: specInclude },
  _count: { select: { coupons: true, activities: true } },
} satisfies Prisma.CouponTemplateInclude;
type TemplateDetail = Prisma.CouponTemplateGetPayload<{
  include: typeof include;
}>;
type ExchangeSpec = Prisma.ProductSpecGetPayload<{
  include: typeof specInclude;
}>;

@Injectable()
export class CouponTemplateService {
  // 注入数据库服务，统一处理优惠券模板的查询和事务写入。
  constructor(private readonly prisma: PrismaService) {
    // 1. 由 Nest 注入 Prisma，复用项目的数据库连接。
  }

  // 校验当前账号是否具有平台优惠券设置权限。
  private authorize(admin: CurrentAdmin) {
    // 1. 只允许超级管理员和平台管理员维护优惠券模板。
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      throw new ForbiddenException('仅平台管理员可管理优惠券设置');
  }

  // 将兑换规格和商品信息转换为后台选择、展示所需的数据。
  private serializeSpec(spec: ExchangeSpec) {
    // 1. 返回必要的规格和商品字段，将价格转换为接口约定的整数分。
    return {
      id: spec.id,
      name: spec.name,
      unit: spec.unit,
      price: Math.round(Number(spec.price) * 100),
      enabled: spec.enabled,
      product: spec.product,
    };
  }

  // 将优惠券模板转换为统一响应，保留已停用兑换规格的回显信息。
  private serialize(item: TemplateDetail) {
    // 1. 转换现金面额，并关联兑换规格以及使用统计。
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      cashAmount:
        item.cashAmount === null
          ? null
          : Math.round(Number(item.cashAmount) * 100),
      exchangeSpecId: item.exchangeSpecId,
      exchangeQuantity: item.exchangeQuantity,
      validityHours: item.validityHours,
      enabled: item.enabled,
      exchangeSpec: item.exchangeSpec
        ? this.serializeSpec(item.exchangeSpec)
        : null,
      issuedCount: item._count.coupons,
      activityCount: item._count.activities,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  // 根据有效模板 ID 查找完整记录，不存在时返回明确错误。
  private async find(id: number, db: Prisma.TransactionClient = this.prisma) {
    // 1. 拒绝无效 ID，避免数据库参数错误。
    if (!Number.isInteger(id) || id <= 0 || id > 2147483647)
      throw new BadRequestException('请选择有效的优惠券');
    // 2. 查询模板、兑换规格和关联统计，统一处理不存在的记录。
    const item = await db.couponTemplate.findUnique({ where: { id }, include });
    if (!item) throw new NotFoundException('优惠券不存在');
    return item;
  }

  // 按券类型校验抵扣金额或兑换规则，并转换为数据库写入字段。
  private async rules(
    dto: SaveCouponTemplateDto,
    old: TemplateDetail | null,
    db: Prisma.TransactionClient,
  ) {
    // 1. 校验名称和发券后的有效时长。
    if (!dto.name.trim()) throw new BadRequestException('请填写优惠券名称');
    if (
      !Number.isInteger(dto.validityHours) ||
      dto.validityHours < 1 ||
      dto.validityHours > 87600
    )
      throw new BadRequestException('请设置有效的优惠券有效期');
    // 2. 现金券必须有有效面额，不能同时配置商品兑换字段。
    if (dto.type === 'CASH') {
      if (
        !Number.isSafeInteger(dto.cashAmount) ||
        dto.cashAmount! <= 0 ||
        dto.cashAmount! > 999999999999
      )
        throw new BadRequestException('请填写大于零的抵扣金额');
      if (dto.exchangeSpecId != null || dto.exchangeQuantity != null)
        throw new BadRequestException('现金抵扣券不需要设置兑换商品');
      return {
        cashAmount: new Prisma.Decimal(dto.cashAmount!).div(100),
        exchangeSpecId: null,
        exchangeQuantity: null,
      };
    }
    // 3. 兑换券必须指定商品规格和兑换数量，不能同时配置现金面额。
    if (
      dto.type !== 'EXCHANGE' ||
      !Number.isInteger(dto.exchangeSpecId) ||
      dto.exchangeSpecId! <= 0 ||
      !Number.isInteger(dto.exchangeQuantity) ||
      dto.exchangeQuantity! < 1 ||
      dto.exchangeQuantity! > 2147483647
    )
      throw new BadRequestException('请选择兑换商品规格并填写兑换数量');
    if (dto.cashAmount != null)
      throw new BadRequestException('商品兑换券不需要设置抵扣金额');
    // 4. 新选或启用的兑换规格必须可售；停用模板可保留原来的失效规格。
    const spec = await db.productSpec.findUnique({
      where: { id: dto.exchangeSpecId! },
      include: specInclude,
    });
    if (!spec) throw new BadRequestException('兑换商品规格不存在');
    const unavailable = !spec.enabled || !spec.product.enabled;
    if (unavailable && (dto.enabled || old?.exchangeSpecId !== spec.id))
      throw new BadRequestException(
        '兑换商品或规格已停用，请重新选择或停用此优惠券',
      );
    return {
      cashAmount: null,
      exchangeSpecId: spec.id,
      exchangeQuantity: dto.exchangeQuantity!,
    };
  }

  // 按名称、券类型和启用状态分页查询优惠券模板。
  async list(query: CouponTemplateQueryDto, admin: CurrentAdmin) {
    // 1. 校验权限并构造筛选条件。
    this.authorize(admin);
    const where: Prisma.CouponTemplateWhereInput = {
      type: query.type,
      enabled: query.enabled,
      ...(query.keyword?.trim()
        ? { name: { contains: query.keyword.trim() } }
        : {}),
    };
    // 2. 同时读取分页记录和总数，按最近新增顺序展示。
    const [items, total] = await this.prisma.$transaction([
      this.prisma.couponTemplate.findMany({
        where,
        include,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { id: 'desc' },
      }),
      this.prisma.couponTemplate.count({ where }),
    ]);
    // 3. 转换金额和关联信息，返回标准分页结构。
    return {
      list: items.map((item) => this.serialize(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // 查询可用于兑换券的已上架商品规格，支持商品名和规格名搜索。
  async exchangeSpecs(query: CouponTemplateQueryDto, admin: CurrentAdmin) {
    // 1. 校验权限，仅提供已上架商品下的启用规格。
    this.authorize(admin);
    const keyword = query.keyword?.trim();
    const where: Prisma.ProductSpecWhereInput = {
      enabled: true,
      product: { enabled: true },
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { product: { name: { contains: keyword } } },
            ],
          }
        : {}),
    };
    // 2. 分页查询规格和总数，避免一次加载整个商品库。
    const [items, total] = await this.prisma.$transaction([
      this.prisma.productSpec.findMany({
        where,
        include: specInclude,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.productSpec.count({ where }),
    ]);
    // 3. 返回规格和商品名称、单位及售价，供后台选择。
    return {
      list: items.map((item) => this.serializeSpec(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // 获取模板详情，供后台查看和编辑回显。
  async detail(id: number, admin: CurrentAdmin) {
    // 1. 校验平台权限并读取完整模板。
    this.authorize(admin);
    const item = await this.find(id);
    // 2. 转换为统一展示结构，不修改已发放优惠券。
    return this.serialize(item);
  }

  // 新增或完整编辑模板，修改仅影响之后按该模板发放的优惠券。
  async save(dto: SaveCouponTemplateDto, admin: CurrentAdmin, id?: number) {
    // 1. 校验平台权限，模板与关联规则在同一事务中处理。
    this.authorize(admin);
    return this.prisma.$transaction(async (tx) => {
      // 2. 编辑时读取原模板，检查金额、兑换规格和有效期。
      const old = id === undefined ? null : await this.find(id, tx);
      const rules = await this.rules(dto, old, tx);
      // 3. 赠花活动不能切换成现金券，避免破坏既有活动配置。
      if (
        old &&
        dto.type === 'CASH' &&
        old.type !== dto.type &&
        (await tx.marketingActivity.count({
          where: { templateId: old.id, isFlowerGift: true },
        }))
      )
        throw new ConflictException(
          '该优惠券关联了赠花活动，请先调整活动后再修改券类型',
        );
      // 4. 明确写入模板字段，不回写用户已领券的规则快照。
      const data = {
        name: dto.name.trim(),
        type: dto.type,
        scope: 'ALL' as const,
        validityHours: dto.validityHours,
        enabled: dto.enabled,
        ...rules,
      };
      const saved =
        id === undefined
          ? await tx.couponTemplate.create({ data, include })
          : await tx.couponTemplate.update({ where: { id }, data, include });
      // 5. 返回更新后的模板及关联统计。
      return this.serialize(saved);
    });
  }

  // 单独启用或停用模板，保留已发放券和营销活动关联记录。
  async status(id: number, enabled: boolean, admin: CurrentAdmin) {
    // 1. 校验平台权限，在事务内读取原模板。
    this.authorize(admin);
    return this.prisma.$transaction(async (tx) => {
      const old = await this.find(id, tx);
      // 2. 启用前重新校验规则，拒绝启用兑换商品已停售的模板。
      if (enabled)
        await this.rules(
          {
            name: old.name,
            type: old.type,
            cashAmount:
              old.cashAmount === null
                ? null
                : Math.round(Number(old.cashAmount) * 100),
            exchangeSpecId: old.exchangeSpecId,
            exchangeQuantity: old.exchangeQuantity,
            validityHours: old.validityHours,
            enabled,
          },
          old,
          tx,
        );
      // 3. 仅更新模板启停状态，不变更历史已发券。
      return this.serialize(
        await tx.couponTemplate.update({
          where: { id },
          data: { enabled },
          include,
        }),
      );
    });
  }
}
