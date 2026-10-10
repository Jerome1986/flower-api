import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { Request } from 'express';
import type { adminRole } from '@prisma/client';
import { createHash } from 'node:crypto';

export interface CurrentAdmin {
  id: number;
  username: string;
  role: adminRole | 'STORE_MANAGER';
  storeId: number | null;
  /** 小程序店长当前负责的全部门店，按每次请求的数据库结果加载 */
  storeIds?: number[];
}

export interface AdminRequest extends Request {
  admin: CurrentAdmin;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  // 注入令牌验证和账号查询服务。
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // 验证登录令牌及账号当前状态，密码重置后使旧令牌失效。
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. 获取请求令牌并验证签名及身份类型。
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('请先登录管理后台');

    let userId: number;
    let type: string;
    let passwordVersion: string | undefined;
    try {
      const payload = await this.jwt.verifyAsync<{
        userId: number;
        type: string;
        passwordVersion?: string;
      }>(match[1]);
      if (
        !['admin', 'user'].includes(payload.type) ||
        !Number.isSafeInteger(payload.userId) ||
        payload.userId <= 0
      ) {
        throw new Error('Invalid admin token');
      }
      userId = payload.userId;
      type = payload.type;
      passwordVersion = payload.passwordVersion;
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }

    if (type === 'user') {
      // 2. 店长使用小程序身份，按当前负责门店校验权限。
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          phone: true,
          role: true,
          enabled: true,
          managedStores: { select: { id: true } },
        },
      });
      if (
        !user?.enabled ||
        user.role !== 'STORE_MANAGER' ||
        !user.managedStores.length
      ) {
        throw new UnauthorizedException('店长身份不可用，请重新登录');
      }
      request.admin = {
        id: user.id,
        username: user.phone,
        role: 'STORE_MANAGER',
        storeId: null,
        storeIds: user.managedStores.map((store) => store.id),
      };
      return true;
    }

    // 3. 后台账号以数据库当前身份为准，停用、角色变更或密码重置即时生效。
    const admin = await this.prisma.admin.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        storeId: true,
        status: true,
        password: true,
      },
    });
    if (!admin?.status)
      throw new UnauthorizedException('账号不可用，请重新登录');
    if (
      passwordVersion !==
      createHash('sha256').update(admin.password).digest('hex')
    )
      throw new UnauthorizedException('登录已失效，请重新登录');
    // 4. 只将业务所需账号信息附加到请求，不传播密码摘要。
    request.admin = {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      storeId: admin.storeId,
    };
    return true;
  }
}
