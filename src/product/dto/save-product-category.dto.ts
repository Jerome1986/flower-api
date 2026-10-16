import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class SaveProductCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name: string

  @IsBoolean()
  enabled: boolean

  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder: number
}
