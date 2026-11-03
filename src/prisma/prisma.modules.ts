import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

// 数据库连接模块依赖注册。
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
