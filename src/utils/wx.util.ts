import axios from 'axios'
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common'

@Injectable()
export class WxUtil {
  private readonly appId = process.env.APPID
  private readonly secret = process.env.APPSECRET

  // 通过微信登录凭证换取会话信息。
  async getSession(code: string) {
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

    if (res.data.errcode) {
      throw new BadRequestException(`微信登录失败：${res.data.errmsg}`)
    }

    return res.data
  }

  // 校验微信配置并获取接口访问令牌。
  async getAccessToken() {
    if (!this.appId || !this.secret) {
      throw new InternalServerErrorException('微信配置缺失')
    }

    const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
      params: {
        grant_type: 'client_credential',
        appid: this.appId,
        secret: this.secret,
      },
      proxy: false,
    })

    if (res.data.errcode) {
      throw new BadRequestException(
        `获取微信 access_token 失败：${res.data.errmsg}`,
      )
    }

    return res.data.access_token
  }

  // 使用手机号授权凭证获取微信绑定手机号。
  async getPhoneNumber(phoneCode: string) {
    if (!phoneCode) {
      throw new BadRequestException('缺少手机号授权 code')
    }

    const accessToken = await this.getAccessToken()

    const res = await axios.post(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
      {
        code: phoneCode,
      },
      {
        proxy: false,
      },
    )

    if (res.data.errcode !== 0) {
      throw new BadRequestException(`获取手机号失败：${res.data.errmsg}`)
    }

    const phoneNumber = res.data?.phone_info?.phoneNumber

    if (!phoneNumber) {
      throw new BadRequestException('微信未返回手机号')
    }

    return phoneNumber
  }
}
