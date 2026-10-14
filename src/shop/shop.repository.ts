import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShopRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 查询符合条件的门店。
  findManyStore<T extends Prisma.StoreFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.findMany(args);
  }

  // 查询首条符合条件的门店。
  findFirstStore<T extends Prisma.StoreFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.store.findFirst(args);
  }

  // 查询符合条件的门店商品。
  findManyStoreProduct<T extends Prisma.StoreProductFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreProductFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeProduct.findMany(args);
  }

  // 查询首条符合条件的门店商品。
  findFirstStoreProduct<T extends Prisma.StoreProductFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.StoreProductFindFirstArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.storeProduct.findFirst(args);
  }
}
