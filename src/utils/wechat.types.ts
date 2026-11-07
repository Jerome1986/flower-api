/** 微信接口错误字段；错误响应可能没有成功字段。 */
export interface WechatErrorResponse {
  /** 微信错误码，0 或省略表示接口未报告错误。 */
  errcode?: number
  /** 微信错误描述。 */
  errmsg?: string
}

/** 微信登录凭证交换结果。 */
export interface WechatSessionResponse extends WechatErrorResponse {
  /** 当前小程序的用户标识。 */
  openid?: string
  /** 微信会话密钥，仅服务端使用。 */
  session_key?: string
  /** 开放平台统一用户标识。 */
  unionid?: string
}

/** 微信服务端调用令牌响应。 */
export interface WechatAccessTokenResponse extends WechatErrorResponse {
  /** 服务端访问令牌。 */
  access_token?: string
  /** 令牌有效时长，单位为秒。 */
  expires_in?: number
}

/** 手机号授权接口响应。 */
export interface WechatPhoneResponse extends WechatErrorResponse {
  /** 授权后的手机号资料。 */
  phone_info?: {
    /** 用户授权的手机号。 */
    phoneNumber?: string
  }
}
