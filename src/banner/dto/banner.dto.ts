import {
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

export class BannerDto {
  @IsUUID()
  id: string

  @IsString()
  @MaxLength(100)
  title: string

  @IsString()
  @MaxLength(1024)
  image: string

  @IsBoolean()
  enabled: boolean

  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder: number
}
