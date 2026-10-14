import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { testPhones } from './user-auth.constants';
import { UserAuthRepository } from './user-auth.repository';

export const userSelect = {
  id: true,
  phone: true,
  role: true,
  nickname: true,
  enabled: true,
  managedStores: { select: { id: true, name: true } },
} as const;

@Injectable()
export class UserAuthService {
  // 注入用户身份数据访问层及业务依赖。
  constructor(
    private readonly repo: UserAuthRepository,
    private readonly jwt: JwtService,
  ) {}

  // 校验测试登录资格并签发用户令牌。
  async testLogin(phone: string) {
    // 1. 测试登录仅限非生产环境中预设的手机号。
    if (process.env.NODE_ENV === 'production')
      throw new ForbiddenException('正式环境不开放测试登录');
    if (!testPhones.includes(phone))
      throw new ForbiddenException('该手机号未开放测试登录');
    // 2. 先检查已有账号状态，停用账号不更新登录时间。
    const existing = await this.repo.findUniqueUser({
      where: { phone },
      select: { enabled: true },
    });
    if (existing && !existing.enabled)
      throw new UnauthorizedException('账号已停用');
    // 3. 通过唯一手机号复用账号，不覆盖后台设置的身份。
    const user = await this.repo.upsertUser({
      where: { phone },
      create: {
        phone,
        role: 'CUSTOMER',
        nickname: '爱花的你',
        inviteCode: randomUUID().replace(/-/g, ''),
        lastLoginAt: new Date(),
      },
      update: { lastLoginAt: new Date() },
      select: userSelect,
    });
    if (!user.enabled) throw new UnauthorizedException('账号已停用');
    // 4. 再次确认账号可用，签发用户令牌并返回展示信息。
    return {
      token: this.jwt.sign({ userId: user.id, type: 'user' }),
      userInfo: user,
    };
  }

  // 查询当前用户并检查账号可用状态。
  async currentUser(id: number) {
    const user = await this.repo.findUniqueUser({
      where: { id },
      select: userSelect,
    });
    if (!user?.enabled)
      throw new UnauthorizedException('账号不可用，请重新登录');
    return user;
  }
}
