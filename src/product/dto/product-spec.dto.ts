import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ProductSpecDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  id?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  unit: string;

  /** 接口金额统一使用整数分。 */
  @IsInt()
  @Min(0)
  @Max(999999999999)
  price: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  stemsPerUnit?: number | null;

  @IsBoolean()
  enabled: boolean;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder: number;
}
