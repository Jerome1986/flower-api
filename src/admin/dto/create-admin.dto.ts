import { IsNotEmpty, IsString, Length } from 'class-validator'

export class CreateAdminDto {
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  @Length(3, 20, { message: '用户名长度必须在3-20位之间' })
  username: string

  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @Length(3, 20, { message: '密码长度必须在3-20位之间' })
  password: string
}
