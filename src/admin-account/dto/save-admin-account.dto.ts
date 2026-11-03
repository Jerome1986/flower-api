import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator'

// 管理员账号请求参数及校验规则。
export class SaveAdminAccountDto {
  // 管理员登录名。
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: '账号仅支持字母、数字、下划线、点和短横线',
  })
  username: string

  // 管理员显示名称。
  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string | null

  // 账号角色。
  @IsIn(['SUPER_ADMIN', 'PLATFORM_ADMIN'])
  role: 'SUPER_ADMIN' | 'PLATFORM_ADMIN'

  // 当前业务状态。
  @IsBoolean()
  status: boolean
}
