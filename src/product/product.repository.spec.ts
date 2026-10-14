import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductRepository } from './product.repository';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('数据访问层事务契约', () => {
  it('查询原样返回延迟执行的 PrismaPromise，供数组事务使用', () => {
    const operation = {
      then: jest.fn(),
      [Symbol.toStringTag]: 'PrismaPromise',
    };
    const prisma = {
      product: { findMany: jest.fn(() => operation) },
      $transaction: jest.fn(),
    };
    const repo = new ProductRepository(prisma as unknown as PrismaService);

    const query = repo.findManyProduct({ where: { enabled: true } });
    expect(query).toBe(operation);
    expect(operation.then).not.toHaveBeenCalled();

    repo.transaction([query], { isolationLevel: 'Serializable' });
    expect(prisma.$transaction).toHaveBeenCalledWith([operation], {
      isolationLevel: 'Serializable',
    });
    expect(prisma.$transaction.mock.contexts[0]).toBe(prisma);
  });

  it('事务中的查询使用传入客户端，不回退到全局连接', async () => {
    const prisma = {
      product: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
    };
    prisma.$transaction.mockImplementation((action) => action(tx));
    const repo = new ProductRepository(prisma as unknown as PrismaService);

    const result = await repo.transaction(
      (db) => repo.findUniqueProduct({ where: { id: 7 } }, db),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    expect(result).toEqual({ id: 7 });
    expect(tx.product.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });
});
