import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @Min(0)
  @Max(2147483647)
  available: number;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  version: number;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsUUID()
  operationKey: string;
}
