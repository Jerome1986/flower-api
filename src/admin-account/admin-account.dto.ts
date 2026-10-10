import { Transform, Type } from 'class-transformer';
import { adminRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminAccountQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
  @IsOptional() @IsString() @MaxLength(64) keyword?: string;
  @IsOptional() @IsEnum(adminRole) role?: adminRole;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  status?: boolean;
}
export class SaveAdminAccountDto {
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: '账号仅支持字母、数字、下划线、点和短横线',
  })
  username: string;
  @IsOptional() @IsString() @MaxLength(64) displayName?: string | null;
  @IsIn(['SUPER_ADMIN', 'PLATFORM_ADMIN']) role:
    'SUPER_ADMIN' | 'PLATFORM_ADMIN';
  @IsBoolean() status: boolean;
}
export class CreateAdminAccountDto extends SaveAdminAccountDto {
  @IsString() @Length(6, 64) password: string;
}
export class ResetAdminPasswordDto {
  @IsString() @Length(6, 64) password: string;
}
export class AdminAccountStatusDto {
  @IsBoolean() status: boolean;
}
