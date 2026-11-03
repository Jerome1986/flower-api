import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { UserRequest } from './user-auth.types'

// 用户身份数据与处理逻辑。
@Injectable()
export class UserAuthGuard implements CanActivate {
  // 注入令牌校验服务。
  constructor(
    // 身份令牌服务。
    private readonly jwt: JwtService,
  ) {}

  // 校验小程序访问令牌，并将用户 ID 写入当前请求。
  async canActivate(
    // 当前接口执行上下文。
    context: ExecutionContext,
  ) {
    // 1. 从请求头提取 Bearer 令牌。
    const req = context.switchToHttp().getRequest<UserRequest>()
    // 身份令牌。
    const token = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
    try {
      // 2. 验证签名、令牌类型和用户 ID，拒绝其他身份的令牌。
      if (!token) throw new Error()
      // 令牌中解析出的身份信息。
      const payload = await this.jwt.verifyAsync<{
        // 用户编号。
        userId: number
        // 业务类型。
        type: string
      }>(token)
      if (
        payload.type !== 'user' ||
        !Number.isSafeInteger(payload.userId) ||
        payload.userId <= 0
      )
        throw new Error()
      req.userId = payload.userId
      return true
    } catch {
      // 3. 将令牌缺失、过期或格式错误统一转换为未登录响应。
      throw new UnauthorizedException('登录已失效，请重新登录')
    }
  }
}
