import { IsNumber, IsOptional, IsString } from 'class-validator'

// 用户身份请求参数及校验规则。
export class WxPhoneLoginDto {
  // 业务编号或错误码。
  @IsString()
  code: string

  // 微信手机号授权凭证。
  @IsString()
  phoneCode: string

  // 邀请人邀请码。
  @IsOptional()
  @IsString()
  inviterCode?: string
}
