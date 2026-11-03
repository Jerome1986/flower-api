import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { ProductSpecDto } from './product-spec.dto'

// 商品请求参数及校验规则。
export class SaveProductDto {
  // 业务类型。
  @IsOptional()
  @IsIn(['ORDINARY', 'CUSTOM'])
  type?: 'ORDINARY' | 'CUSTOM'

  // 商品分类编号。
  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number | null

  // 业务名称。
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  // 商品封面图地址。
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  coverImage: string

  // 商品图片列表。
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  images: string[]

  // 商品描述。
  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string

  // 是否启用。
  @IsBoolean()
  enabled: boolean

  // 显示排序值。
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder: number

  // 商品规格列表。
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecDto)
  specs: ProductSpecDto[]
}
