import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class StoreProductQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  storeId?: number;
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  enabled?: boolean;
}

export class CatalogQueryDto extends StoreProductQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) declare storeId: number;
}

export class StoreProductSettingsDto {
  @IsBoolean() enabled: boolean;
  @IsBoolean() pickupEnabled: boolean;
  @IsBoolean() deliveryEnabled: boolean;
}

export class SelectStoreProductDto extends StoreProductSettingsDto {
  @IsInt() @Min(1) @Max(2147483647) storeId: number;
  @IsInt() @Min(1) @Max(2147483647) productId: number;
}

export class AdjustStockDto {
  @IsInt() @Min(0) @Max(2147483647) available: number;
  @IsInt() @Min(0) @Max(2147483647) version: number;
  @IsString() @MaxLength(500) reason: string;
  @IsUUID() operationKey: string;
}
