import { IsString, Length } from 'class-validator'

// 管理员账号请求参数及校验规则。
export class ResetAdminPasswordDto {
  // 登录密码。
  @IsString()
  @Length(6, 64)
  password: string
}
