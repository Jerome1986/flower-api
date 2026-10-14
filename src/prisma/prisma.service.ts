// Prisma 数据库服务：统一管理 MySQL 驱动、客户端及连接生命周期。
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // 根据 DATABASE_URL 创建 MariaDB/MySQL 驱动适配器和 Prisma 客户端。
  constructor() {
    // 1. 读取数据库连接配置，缺少配置时立即终止初始化。
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('未配置 DATABASE_URL');
    }

    // 2. 解析连接地址，取得主机、端口、账号、密码和数据库名称。
    const url = new URL(databaseUrl);
    // 3. 沿用现有连接配置调试日志。
    console.log(url);

    // 4. 创建驱动适配器，并解码连接地址中经过转义的凭据和数据库名称。
    const adapter = new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
    });

    // 5. 将适配器交给 Prisma 父类，完成客户端初始化。
    super({ adapter });
  }

  // Nest 模块初始化时建立数据库连接。
  async onModuleInit() {
    // 1. 沿用现有数据库连接配置调试日志。
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    // 2. 等待数据库连接建立，连接失败时由初始化流程抛出异常。
    await this.$connect();
  }

  // Nest 模块销毁时释放数据库连接资源。
  async onModuleDestroy() {
    // 1. 断开 Prisma 客户端连接，释放连接池资源。
    await this.$disconnect();
  }
}
