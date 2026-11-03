import {
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// 轮播图请求参数及校验规则。
export class BannerDto {
  // 记录编号。
  @IsUUID()
  id: string

  // 展示标题。
  @IsString()
  @MaxLength(100)
  title: string

  // 图片地址。
  @IsString()
  @MaxLength(1024)
  image: string

  // 是否启用。
  @IsBoolean()
  enabled: boolean

  // 显示排序值。
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder: number
}
