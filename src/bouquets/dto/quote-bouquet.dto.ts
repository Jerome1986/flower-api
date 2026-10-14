import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class QuoteBouquetDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  bouquetId!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  specId!: number;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address!: string;
}
