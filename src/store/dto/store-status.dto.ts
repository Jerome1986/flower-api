import { IsBoolean, ValidateIf } from 'class-validator'

// 门店请求参数及校验规则。
export class StoreStatusDto {
  // 是否启用。
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  enabled?: boolean

  // 门店是否营业。
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  isOpen?: boolean
}
