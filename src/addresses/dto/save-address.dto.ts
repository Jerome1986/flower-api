import { Transform } from 'class-transformer'
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator'
import { trim } from '../addresses.utils'

// PUT 接收完整表单；用户归属取 Token，禁止传入 userId。
export class SaveAddressDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string

  @Transform(trim)
  @IsString()
  @Matches(/^1\d{10}$/, { message: '请填写正确的手机号' })
  phone!: string

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  province!: string

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  city!: string

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  district!: string

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  regionCode?: string

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  detail!: string

  @IsBoolean()
  isDefault!: boolean
}
