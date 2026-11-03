import { Transform } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator'

// 用户身份请求参数及校验规则。
export class UpdateProfileDto {
  // 用户昵称。
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32)
  nickname: string

  // 用户年龄。
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  age: number | null

  // 用户性别编码。
  @IsInt()
  @IsIn([0, 1, 2])
  gender: number
}
