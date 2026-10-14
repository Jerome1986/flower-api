import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class BouquetSettingsDto {
  @IsBoolean()
  customEnabled!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  deliveryArea!: string;

  /** 整数分。 */
  @IsInt()
  @Min(0)
  @Max(999999999)
  deliveryFee!: number;

  @IsString()
  @MaxLength(255)
  businessHours!: string;

  @IsString()
  @MaxLength(32)
  servicePhone!: string;

  @IsString()
  @MaxLength(255)
  deliveryStaff!: string;
}
