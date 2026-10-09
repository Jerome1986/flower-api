import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminRepository {
  constructor(private prisma: PrismaService) { }

  // 注册管理员
  async createAdmin(username: string, password: string) {
    return this.prisma.admin.create({ data: { username, password, role: 'CUSTOMER_SERVICE' } })
  }

  // 查询管理员账号
  async findOneAdmin(username: string) {
    return this.prisma.admin.findUnique({ where: { username } })
  }
}