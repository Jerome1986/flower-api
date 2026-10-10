import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProductQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) categoryId?: number;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  enabled?: boolean;
}

export class ProductSpecDto {
  @IsOptional() @IsInt() @Min(1) id?: number;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsString() @IsNotEmpty() @MaxLength(20) unit: string;
  /** 接口金额统一使用整数分。 */
  @IsInt() @Min(0) @Max(999999999999) price: number;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) stemsPerUnit?: number | null;
  @IsBoolean() enabled: boolean;
  @IsInt() @Min(0) @Max(2147483647) sortOrder: number;
}

export class SaveProductDto {
  @IsOptional() @IsInt() @Min(1) categoryId?: number | null;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsString() @IsNotEmpty() @MaxLength(1024) coverImage: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  images: string[];
  @IsOptional() @IsString() @MaxLength(50000) description?: string;
  @IsBoolean() enabled: boolean;
  @IsInt() @Min(0) @Max(2147483647) sortOrder: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecDto)
  specs: ProductSpecDto[];
}

export class ProductStatusDto {
  @IsBoolean() enabled: boolean;
}

export class SaveProductCategoryDto {
  @IsString() @IsNotEmpty() @MaxLength(64) name: string;
  @IsBoolean() enabled: boolean;
  @IsInt() @Min(0) @Max(2147483647) sortOrder: number;
}
