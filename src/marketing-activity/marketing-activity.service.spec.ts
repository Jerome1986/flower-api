import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MarketingActivityService } from './marketing-activity.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CurrentAdmin } from '../common/guards/admin-auth.guard';

describe('MarketingActivityService', () => {
  const admin = { role: 'PLATFORM_ADMIN' } as CurrentAdmin;
  const dto = {
    name: ' 新人礼遇 ',
    templateId: 1,
    enabled: true,
    isFlowerGift: false,
    reimbursementPerUnit: null,
  };
  let service: MarketingActivityService;
  let db: any;
  let template: any;
  let activity: any;
  beforeEach(() => {
    template = {
      id: 1,
      name: '新人券',
      type: 'CASH',
      cashAmount: new Prisma.Decimal('10.50'),
      enabled: true,
      validityHours: 120,
      exchangeSpec: null,
      exchangeQuantity: null,
    };
    activity = {
      id: 1,
      trigger: 'NEW_USER',
      ...dto,
      template,
      updatedAt: new Date(),
    };
    db = {
      couponTemplate: { findUnique: jest.fn(async () => template) },
      marketingActivity: {
        findMany: jest.fn(async () => [activity]),
        findUnique: jest.fn(async () => activity),
        upsert: jest.fn(async (args) => ({ ...activity, ...args.update })),
        update: jest.fn(async (args) => ({ ...activity, ...args.data })),
      },
      $transaction: jest.fn(async (fn) => fn(db)),
    };
    service = new MarketingActivityService(db as PrismaService);
  });
  it('拒绝门店账号设置活动', async () => {
    await expect(
      service.list({ role: 'STORE_MANAGER' } as CurrentAdmin),
    ).rejects.toThrow(ForbiddenException);
    expect(db.marketingActivity.findMany).not.toHaveBeenCalled();
  });
  it('返回奖励券金额并保留未配置的报销单价', async () => {
    const result = await service.list(admin);
    expect(result[0].template.cashAmount).toBe(1050);
    expect(result[0].reimbursementPerUnit).toBeNull();
  });
  it('按触发方式保存唯一配置并修剪名称', async () => {
    await service.save('NEW_USER', dto, admin);
    expect(db.marketingActivity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { trigger: 'NEW_USER' },
        update: expect.objectContaining({ name: '新人礼遇' }),
      }),
    );
  });
  it('拒绝空名称', async () => {
    await expect(
      service.save('NEW_USER', { ...dto, name: ' ' }, admin),
    ).rejects.toThrow(BadRequestException);
  });
  it('拒绝不存在的奖励券', async () => {
    db.couponTemplate.findUnique.mockResolvedValue(null);
    await expect(service.save('NEW_USER', dto, admin)).rejects.toThrow(
      '请选择有效的奖励优惠券',
    );
  });
  it('赠花不能配置现金券', async () => {
    await expect(
      service.save('INVITATION', { ...dto, isFlowerGift: true }, admin),
    ).rejects.toThrow('赠花活动请选择商品兑换券');
  });
  it('非赠花不能配置报销金额', async () => {
    await expect(
      service.save('NEW_USER', { ...dto, reimbursementPerUnit: 100 }, admin),
    ).rejects.toThrow(BadRequestException);
  });
  it.each([24, 120, 720])('奖励券有效期 %i 小时可保存并启用两项活动', async (hours) => {
    template.validityHours = hours;
    for (const trigger of ['NEW_USER', 'INVITATION'] as const) {
      const saved = await service.save(trigger, dto, admin);
      expect(saved.template).toMatchObject({ validityHours: hours, available: true });
      await expect(service.status(trigger, true, admin)).resolves.toMatchObject({ enabled: true });
    }
  });
  it('停用奖励券不能启用活动，但允许保存停用配置', async () => {
    template.enabled = false;
    await expect(service.save('NEW_USER', dto, admin)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.save('NEW_USER', { ...dto, enabled: false }, admin),
    ).resolves.toBeDefined();
  });
  it('商品停售不能启用兑换活动', async () => {
    Object.assign(template, {
      type: 'EXCHANGE',
      exchangeSpec: {
        enabled: true,
        product: { enabled: false, name: '鲜花' },
      },
    });
    await expect(service.save('NEW_USER', dto, admin)).rejects.toThrow(
      BadRequestException,
    );
  });
  it('赠花报销金额精确转换为元', async () => {
    Object.assign(template, {
      type: 'EXCHANGE',
      exchangeSpec: {
        enabled: true,
        name: '一束',
        product: { enabled: true, name: '鲜花' },
      },
    });
    const result = await service.save(
      'INVITATION',
      { ...dto, isFlowerGift: true, reimbursementPerUnit: 125 },
      admin,
    );
    expect(result.reimbursementPerUnit).toBe(125);
    expect(
      db.marketingActivity.upsert.mock.calls[0][0].update.reimbursementPerUnit.toString(),
    ).toBe('1.25');
  });
  it('未配置活动不能直接启用', async () => {
    db.marketingActivity.findUnique.mockResolvedValue(null);
    await expect(service.status('NEW_USER', true, admin)).rejects.toThrow(
      NotFoundException,
    );
  });
  it('已失效的活动仍然可以停用', async () => {
    template.enabled = false;
    await expect(
      service.status('NEW_USER', false, admin),
    ).resolves.toMatchObject({ enabled: false });
    expect(db.couponTemplate.findUnique).not.toHaveBeenCalled();
  });
});
