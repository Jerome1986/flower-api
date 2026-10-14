import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AddressesRepository } from './addresses.repository';
import { SaveAddressDto } from './dto/save-address.dto';
const select = {
  id: true,
  name: true,
  phone: true,
  province: true,
  city: true,
  district: true,
  regionCode: true,
  detail: true,
  isDefault: true,
} as const;
@Injectable()
export class AddressesService {
  // 注入收货地址数据访问层及业务依赖。
  constructor(private readonly repo: AddressesRepository) {}

  // 查询收货地址列表。
  async list(userId: number) {
    const user = await this.repo.findUniqueUser({
      where: { id: userId },
      select: { enabled: true },
    });
    if (!user?.enabled)
      throw new UnauthorizedException('账号不可用，请重新登录');
    return this.repo.findManyUserAddress({
      where: { userId },
      select,
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
  }

  // 锁定父用户行，串行化包括首次创建在内的全部地址写入，无需变更表结构。
  private async write<T>(
    userId: number,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // 1. 死锁或事务冲突最多重试三次，每次重新读取并锁定用户。
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.repo.transaction(
          async (tx) => {
            // 2. 锁定父用户行，防止并发创建地址时出现多个默认项。
            const rows = await this.repo.queryRaw<
              Array<{ id: number; enabled: boolean | number }>
            >(
              Prisma.sql(
                ['SELECT id, enabled FROM user WHERE id = ', ' FOR UPDATE'],
                userId,
              ),
              tx,
            );
            if (!rows[0]?.enabled)
              throw new UnauthorizedException('账号不可用，请重新登录');
            // 3. 在持锁事务中完成归属校验、地址修改和默认地址归一化。
            return action(tx);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
        );
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2034') throw error;
        if (attempt === 2) throw new ConflictException('地址正在更新，请重试');
      }
    }
    throw new ConflictException('地址正在更新，请重试');
  }

  // 校验收货地址是否属于当前用户。
  private async owned(
    tx: Prisma.TransactionClient,
    userId: number,
    id: number,
  ) {
    const address = await this.repo.findFirstUserAddress(
      {
        where: { id, userId },
        select,
      },
      tx,
    );
    if (!address) throw new NotFoundException('地址不存在');
    return address;
  }

  // 非空地址簿恰有一个默认地址；取消当前默认时优先选择其他最早地址。
  private async normalizeDefault(
    tx: Prisma.TransactionClient,
    userId: number,
    preferredId?: number,
    avoidId?: number,
  ) {
    // 1. 按创建顺序读取地址，优先使用指定项，其次保留其他默认项。
    const list = await this.repo.findManyUserAddress(
      {
        where: { userId },
        select: { id: true, isDefault: true },
        orderBy: { id: 'asc' },
      },
      tx,
    );
    const chosen =
      list.find((item) => item.id === preferredId) ||
      list.find((item) => item.isDefault && item.id !== avoidId) ||
      list.find((item) => item.id !== avoidId) ||
      list[0];
    if (!chosen) return;
    // 2. 在同一事务中清除其他默认标记，再设置选中的地址。
    await this.repo.updateManyUserAddress(
      {
        where: { userId, isDefault: true, id: { not: chosen.id } },
        data: { isDefault: false },
      },
      tx,
    );
    await this.repo.updateManyUserAddress(
      {
        where: { userId, id: chosen.id, isDefault: false },
        data: { isDefault: true },
      },
      tx,
    );
  }

  // 提取收货地址写入字段。
  private data(dto: SaveAddressDto) {
    return {
      name: dto.name,
      phone: dto.phone,
      province: dto.province,
      city: dto.city,
      district: dto.district,
      regionCode: dto.regionCode || null,
      detail: dto.detail,
      isDefault: dto.isDefault,
    };
  }

  // 新增收货地址。
  create(userId: number, dto: SaveAddressDto) {
    return this.write(userId, async (tx) => {
      const item = await this.repo.createUserAddress(
        {
          data: { ...this.data(dto), userId },
          select,
        },
        tx,
      );
      await this.normalizeDefault(
        tx,
        userId,
        dto.isDefault ? item.id : undefined,
      );
      return this.owned(tx, userId, item.id);
    });
  }

  // 更新收货地址。
  update(userId: number, id: number, dto: SaveAddressDto) {
    return this.write(userId, async (tx) => {
      await this.owned(tx, userId, id);
      await this.repo.updateManyUserAddress(
        {
          where: { id, userId },
          data: this.data(dto),
        },
        tx,
      );
      await this.normalizeDefault(
        tx,
        userId,
        dto.isDefault ? id : undefined,
        dto.isDefault ? undefined : id,
      );
      return this.owned(tx, userId, id);
    });
  }

  // 删除收货地址。
  remove(userId: number, id: number) {
    return this.write(userId, async (tx) => {
      await this.owned(tx, userId, id);
      await this.repo.deleteManyUserAddress({ where: { id, userId } }, tx);
      await this.normalizeDefault(tx, userId);
      return { id };
    });
  }

  // 设置默认地址并保持地址簿仅有一个默认项。
  setDefault(userId: number, id: number) {
    return this.write(userId, async (tx) => {
      await this.owned(tx, userId, id);
      await this.normalizeDefault(tx, userId, id);
      return this.owned(tx, userId, id);
    });
  }
}
