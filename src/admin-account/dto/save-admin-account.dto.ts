import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator'

export class SaveAdminAccountDto {
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: '账号仅支持字母、数字、下划线、点和短横线',
  })
  username: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string | null

  @IsIn(['SUPER_ADMIN', 'PLATFORM_ADMIN'])
  role: 'SUPER_ADMIN' | 'PLATFORM_ADMIN'

  @IsBoolean()
  status: boolean
}
