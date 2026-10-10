import { BadRequestException, Injectable } from '@nestjs/common';
import { AdminRepository } from './admin.repository';
import * as bcrypt from 'bcrypt';
import { LoginAdminDto } from './dto/login-admin.dto';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';

@Injectable()
export class AdminService {
  // 注入管理员数据访问层和 JWT 服务，供登录流程使用。
  constructor(
    private adminRepo: AdminRepository,
    private jwtService: JwtService,
  ) {
    // 1. 复用账号查询与令牌签发服务。
  }

  // 管理员登录：初始化默认账号、校验身份并签发后台访问令牌。
  async login(loginDto: LoginAdminDto) {
    // 1. 提取本次登录提交的账号与密码。
    const { username, password } = loginDto;

    // 2. 仅在账号表为空时初始化默认管理员，账号改名后不重复创建。
    let defaultAdmin = await this.adminRepo.findOneAdmin('admin');
    if (!defaultAdmin && (await this.adminRepo.countAdmins()) === 0) {
      // 默认账号初始化也先加密密码，再保存到数据库。
      const hashPassword = await bcrypt.hash('123456', 10);
      defaultAdmin = await this.adminRepo.createDefaultAdmin(hashPassword);
    }

    // 3. 查询本次登录账号；登录默认账号时复用上一步的查询结果。
    const admin =
      username === 'admin'
        ? defaultAdmin
        : await this.adminRepo.findOneAdmin(username);

    if (!admin) {
      // 账号不存在时终止登录，不进入密码校验和令牌签发。
      throw new BadRequestException('账号不存在');
    }

    // 4. 比较提交密码与数据库密码哈希，不匹配时终止登录。
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      throw new BadRequestException('密码错误');
    }

    // 5. 检查账号启用状态，禁止停用账号登录。
    if (!admin.status) {
      throw new BadRequestException('账号已停用，请联系平台管理员');
    }

    // 6. 记录最近登录时间，令牌绑定当前密码摘要以支持重置密码后失效。
    await this.adminRepo.recordLogin(admin.id);
    const token = this.jwtService.sign({
      userId: admin.id,
      username: admin.username,
      role: admin.role,
      type: 'admin',
      storeId: admin.storeId,
      passwordVersion: createHash('sha256')
        .update(admin.password)
        .digest('hex'),
    });

    // 7. 返回令牌与账号展示信息，供后台保存会话和显示菜单。
    return {
      token,
      userInfo: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        displayName: admin.displayName,
        storeId: admin.storeId,
      },
    };
  }
}
