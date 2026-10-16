import { IsString, Length } from 'class-validator'

export class ResetAdminPasswordDto {
  @IsString()
  @Length(6, 64)
  password: string
}
