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

export class SaveProductDto {
  @IsOptional()
  @IsIn(['ORDINARY', 'CUSTOM'])
  type?: 'ORDINARY' | 'CUSTOM'

  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number | null

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  coverImage: string

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  images: string[]

  @IsOptional()
  @IsString()
  @MaxLength(50000)
  description?: string

  @IsBoolean()
  enabled: boolean

  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder: number

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecDto)
  specs: ProductSpecDto[]
}
