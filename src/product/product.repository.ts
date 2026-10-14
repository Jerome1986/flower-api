import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductRepository {
  // 注入数据库连接，集中管理本模块的数据读写。
  constructor(private readonly prisma: PrismaService) {}

  // 复用 Prisma 事务重载，保留数组事务的延迟执行和交互事务的隔离级别。
  get transaction(): PrismaService['$transaction'] {
    return this.prisma.$transaction.bind(this.prisma);
  }

  // 查询符合条件的商品分类。
  findManyProductCategory<T extends Prisma.ProductCategoryFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductCategoryFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productCategory.findMany(args);
  }

  // 新增商品分类。
  createProductCategory<T extends Prisma.ProductCategoryCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductCategoryCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productCategory.create(args);
  }

  // 更新商品分类。
  updateProductCategory<T extends Prisma.ProductCategoryUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductCategoryUpdateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productCategory.update(args);
  }

  // 查询符合条件的商品。
  findManyProduct<T extends Prisma.ProductFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductFindManyArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.findMany(args);
  }

  // 统计商品。
  countProduct<T extends Prisma.ProductCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductCountArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.count(args);
  }

  // 按唯一条件查询商品。
  findUniqueProduct<T extends Prisma.ProductFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.findUnique(args);
  }

  // 按唯一条件查询商品分类。
  findUniqueProductCategory<T extends Prisma.ProductCategoryFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductCategoryFindUniqueArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productCategory.findUnique(args);
  }

  // 新增商品。
  createProduct<T extends Prisma.ProductCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.create(args);
  }

  // 更新商品。
  updateProduct<T extends Prisma.ProductUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductUpdateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.update(args);
  }

  // 更新商品规格。
  updateProductSpec<T extends Prisma.ProductSpecUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductSpecUpdateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productSpec.update(args);
  }

  // 新增商品规格。
  createProductSpec<T extends Prisma.ProductSpecCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductSpecCreateArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.productSpec.create(args);
  }

  // 按唯一条件查询，不存在时抛出异常商品。
  findUniqueOrThrowProduct<T extends Prisma.ProductFindUniqueOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.ProductFindUniqueOrThrowArgs>,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    // 1. 优先使用调用方事务，保持关联读写处于同一事务中。
    return db.product.findUniqueOrThrow(args);
  }
}
