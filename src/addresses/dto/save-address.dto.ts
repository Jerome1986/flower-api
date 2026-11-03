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
  // 业务名称。
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string

  // 手机号码。
  @Transform(trim)
  @IsString()
  @Matches(/^1\d{10}$/, { message: '请填写正确的手机号' })
  phone!: string

  // 所在省份。
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  province!: string

  // 所在城市。
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  city!: string

  // 所在区县。
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  district!: string

  // 行政区划编码。
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  regionCode?: string

  // 详细地址。
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  detail!: string

  // 是否为默认地址。
  @IsBoolean()
  isDefault!: boolean
}
