import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  // 返回根接口的固定响应文本，用于基础访问检查。
  getHello(): string {
    // 1. 返回当前项目约定的响应内容。
    return 'jfx';
  }
}
