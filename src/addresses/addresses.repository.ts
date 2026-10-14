import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AddressesRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 按唯一条件查询用户。
  findUniqueUser<T extends Prisma.UserFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.user.findUnique(args);
  }

  // 查询符合条件的收货地址。
  findManyUserAddress<T extends Prisma.UserAddressFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserAddressFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.userAddress.findMany(args);
  }

  // 查询首条符合条件的收货地址。
  findFirstUserAddress<T extends Prisma.UserAddressFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserAddressFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.userAddress.findFirst(args);
  }

  // 批量更新收货地址。
  updateManyUserAddress<T extends Prisma.UserAddressUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserAddressUpdateManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.userAddress.updateMany(args);
  }

  // 新增收货地址。
  createUserAddress<T extends Prisma.UserAddressCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserAddressCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.userAddress.create(args);
  }

  // 批量删除收货地址。
  deleteManyUserAddress<T extends Prisma.UserAddressDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserAddressDeleteManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.userAddress.deleteMany(args);
  }

  // 执行参数化查询，保留行锁及统计查询的事务上下文。
  queryRaw<T>(query: Prisma.Sql, db: Prisma.TransactionClient = this.prisma) {
    return db.$queryRaw<T>(query);
  }
}
