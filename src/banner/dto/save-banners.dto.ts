import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { BannerDto } from './banner.dto'

// 轮播图请求参数及校验规则。
export class SaveBannersDto {
  // 轮播图配置列表。
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique((item: BannerDto) => item.id)
  @ValidateNested({ each: true })
  @Type(() => BannerDto)
  banners: BannerDto[]

  // 当前配置更新时间，首次配置为 null，防止覆盖他人修改。
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsISO8601()
  updatedAt: string | null
}
