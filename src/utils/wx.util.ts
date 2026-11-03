import axios from 'axios'
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'

// 业务工具数据与处理逻辑。
@Injectable()
export class WxUtil {
  // 微信应用编号。
  private readonly appId = process.env.APPID
  // 微信应用密钥。
  private readonly secret = process.env.APPSECRET

  // 通过微信登录凭证换取会话信息。
  async getSession(
    // 业务编号或错误码。
    code: string,
  ) {
    // 1. 准备微信接口响应。
    const res = await axios.get(
      'https://api.weixin.qq.com/sns/jscode2session',
      {
        params: {
          appid: this.appId,
          secret: this.secret,
          js_code: code,
          grant_type: 'authorization_code',
        },
        proxy: false,
      },
    )

    // 2. 根据当前条件选择处理分支。
    if (res.data.errcode) {
      throw new BadRequestException(`微信登录失败：${res.data.errmsg}`)
    }

    // 3. 返回本次处理结果。
    return res.data
  }

  // 校验微信配置并获取接口访问令牌。
  async getAccessToken() {
    // 1. 不满足要求时提示：微信配置缺失。
    if (!this.appId || !this.secret) {
      throw new InternalServerErrorException('微信配置缺失')
    }

    // 2. 准备微信接口响应。
    const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: this.appId,
        secret: this.secret,
      },
      proxy: false,
    })

    // 3. 根据当前条件选择处理分支。
    if (res.data.errcode) {
      throw new BadRequestException(
        `获取微信 access_token 失败：${res.data.errmsg}`,
      )
    }

    // 4. 返回本次处理结果。
    return res.data.access_token
  }

  // 使用手机号授权凭证获取微信绑定手机号。
  async getPhoneNumber(
    // 微信手机号授权凭证。
    phoneCode: string,
  ) {
    // 1. 不满足要求时提示：缺少手机号授权 code。
    if (!phoneCode) {
      throw new BadRequestException('缺少手机号授权 code')
    }

    // 2. 准备微信接口访问令牌。
    const accessToken = await this.getAccessToken()

    // 3. 准备微信接口响应。
    const res = await axios.post(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
      {
        code: phoneCode,
      },
      {
        proxy: false,
      },
    )

    // 4. 根据当前条件选择处理分支。
    if (res.data.errcode !== 0) {
      throw new BadRequestException(`获取手机号失败：${res.data.errmsg}`)
    }

    // 5. 准备微信授权的手机号。
    const phoneNumber = res.data?.phone_info?.phoneNumber

    // 6. 不满足要求时提示：微信未返回手机号。
    if (!phoneNumber) {
      throw new BadRequestException('微信未返回手机号')
    }

    // 7. 返回本次处理结果。
    return phoneNumber
  }
}
