import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AdminController } from './admin.controller'
import { AdminRepository } from './admin.repository'
import { AdminService } from './admin.service'

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.SECRET ?? 'jerome1986',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
  exports: [JwtModule, AdminRepository],
})
export class AdminModule {}
