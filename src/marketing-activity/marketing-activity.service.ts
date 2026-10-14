import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityTrigger, Prisma } from '@prisma/client';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';
import { SaveMarketingActivityDto } from './dto/save-marketing-activity.dto';
import { MarketingActivityRepository } from './marketing-activity.repository';

const include = {
  template: { include: { exchangeSpec: { include: { product: true } } } },
} satisfies Prisma.MarketingActivityInclude;
type Activity = Prisma.MarketingActivityGetPayload<{ include: typeof include }>;

@Injectable()
export class MarketingActivityService {
  // 注入数据访问层，维护两项固定活动。
  constructor(private readonly repo: MarketingActivityRepository) {
    // 1. 复用全局数据库连接。
  }

  // 校验活动管理权限。
  private authorize(admin: CurrentAdmin) {
    // 1. 仅平台管理员可以设置活动。
    if (!['SUPER_ADMIN', 'PLATFORM_ADMIN'].includes(admin.role))
      throw new ForbiddenException('仅平台管理员可管理活动');
  }

  // 转换活动和奖励券信息供后台展示。
  private serialize(item: Activity) {
    // 1. 金额转换为整数分，保留停用券的回显信息。
    const t = item.template;
    return {
      id: item.id,
      trigger: item.trigger,
      name: item.name,
      templateId: item.templateId,
      enabled: item.enabled,
      isFlowerGift: item.isFlowerGift,
      reimbursementPerUnit:
        item.reimbursementPerUnit === null
          ? null
          : Math.round(Number(item.reimbursementPerUnit) * 100),
      updatedAt: item.updatedAt,
      template: {
        id: t.id,
        name: t.name,
        type: t.type,
        enabled: t.enabled,
        validityHours: t.validityHours,
        cashAmount:
          t.cashAmount === null ? null : Math.round(Number(t.cashAmount) * 100),
        exchangeQuantity: t.exchangeQuantity,
        exchangeProductName: t.exchangeSpec?.product.name ?? null,
        exchangeSpecName: t.exchangeSpec?.name ?? null,
        available:
          t.enabled &&
          (t.type === 'CASH' ||
            !!(t.exchangeSpec?.enabled && t.exchangeSpec.product.enabled)),
      },
    };
  }

  // 校验奖励券和赠花报销设置。
  private async rules(
    dto: SaveMarketingActivityDto,
    db: Prisma.TransactionClient,
  ) {
    // 1. 拒绝空活动名称和非赠花活动的报销配置。
    if (!dto.name.trim()) throw new BadRequestException('请填写活动名称');
    if (!dto.isFlowerGift && dto.reimbursementPerUnit != null)
      throw new BadRequestException('只有赠花活动需要填写报销单价');
    // 2. 校验报销单价，未配置保持为空，不使用零代替。
    if (
      dto.reimbursementPerUnit != null &&
      (!Number.isSafeInteger(dto.reimbursementPerUnit) ||
        dto.reimbursementPerUnit < 0 ||
        dto.reimbursementPerUnit > 999999999999)
    )
      throw new BadRequestException('请填写有效的报销单价');
    const template = await this.repo.findUniqueCouponTemplate(
      {
        where: { id: dto.templateId },
        include: { exchangeSpec: { include: { product: true } } },
      },
      db,
    );
    if (!template) throw new BadRequestException('请选择有效的奖励优惠券');
    // 3. 赠花必须使用兑换券，有效期沿用所选优惠券设置。
    if (dto.isFlowerGift && template.type !== 'EXCHANGE')
      throw new BadRequestException('赠花活动请选择商品兑换券');
    // 4. 启用前检查奖励券及兑换商品可用性，停用保存允许保留旧配置。
    if (
      dto.enabled &&
      (!template.enabled ||
        (template.type === 'EXCHANGE' &&
          (!template.exchangeSpec?.enabled ||
            !template.exchangeSpec.product.enabled)))
    )
      throw new BadRequestException(
        '奖励优惠券或兑换商品已停用，请调整后再启用活动',
      );
  }

  // 查询新人和邀请两项配置，未配置的活动由后台展示待设置入口。
  async list(admin: CurrentAdmin) {
    // 1. 校验权限并读取活动及奖励券。
    this.authorize(admin);
    const items = await this.repo.findManyMarketingActivity({
      include,
      orderBy: { id: 'asc' },
    });
    // 2. 统一转换金额和奖励券摘要。
    return items.map((item) => this.serialize(item));
  }

  // 保存指定触发方式的当前活动，不修改历史奖励券。
  async save(
    trigger: ActivityTrigger,
    dto: SaveMarketingActivityDto,
    admin: CurrentAdmin,
  ) {
    // 1. 校验权限，在事务中校验奖励规则。
    this.authorize(admin);
    return this.repo.transaction(async (tx) => {
      await this.rules(dto, tx);
      // 2. 每种触发方式仅保留一项配置，金额按十进制存储。
      const data = {
        name: dto.name.trim(),
        templateId: dto.templateId,
        enabled: dto.enabled,
        isFlowerGift: dto.isFlowerGift,
        reimbursementPerUnit:
          dto.reimbursementPerUnit == null
            ? null
            : new Prisma.Decimal(dto.reimbursementPerUnit).div(100),
      };
      const item = await this.repo.upsertMarketingActivity(
        {
          where: { trigger },
          create: { trigger, ...data },
          update: data,
          include,
        },
        tx,
      );
      // 3. 返回最新配置，不回写已发放优惠券快照。
      return this.serialize(item);
    });
  }

  // 单独启停活动，启用前重新检查关联奖励券。
  async status(
    trigger: ActivityTrigger,
    enabled: boolean,
    admin: CurrentAdmin,
  ) {
    // 1. 校验权限并在事务中读取当前配置。
    this.authorize(admin);
    return this.repo.transaction(async (tx) => {
      const old = await this.repo.findUniqueMarketingActivity(
        {
          where: { trigger },
          include,
        },
        tx,
      );
      if (!old) throw new NotFoundException('请先设置活动奖励');
      // 2. 停用始终允许，启用时校验当前规则。
      if (enabled)
        await this.rules(
          {
            ...old,
            reimbursementPerUnit:
              old.reimbursementPerUnit === null
                ? null
                : Math.round(Number(old.reimbursementPerUnit) * 100),
            enabled,
          },
          tx,
        );
      // 3. 仅更新活动状态，保留历史发券记录。
      return this.serialize(
        await this.repo.updateMarketingActivity(
          {
            where: { trigger },
            data: { enabled },
            include,
          },
          tx,
        ),
      );
    });
  }
}
