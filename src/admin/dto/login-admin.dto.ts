import { IsNotEmpty, IsString } from 'class-validator'

// 管理员身份请求参数及校验规则。
export class LoginAdminDto {
  // 管理员登录名。
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string

  // 登录密码。
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  password: string
}
