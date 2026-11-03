import { IsString, Length } from 'class-validator'
import { SaveAdminAccountDto } from './save-admin-account.dto'

// 管理员账号请求参数及校验规则。
export class CreateAdminAccountDto extends SaveAdminAccountDto {
  // 登录密码。
  @IsString()
  @Length(6, 64)
  password: string
}
