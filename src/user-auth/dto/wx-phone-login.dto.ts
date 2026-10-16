import { IsNumber, IsOptional, IsString } from 'class-validator'

export class WxPhoneLoginDto {
  @IsString()
  code: string

  @IsString()
  phoneCode: string

  @IsOptional()
  @IsString()
  inviterCode?: string
}
