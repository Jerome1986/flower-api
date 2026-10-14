import { Module } from '@nestjs/common';
import { ShopController } from './shop.controller';
import { ShopRepository } from './shop.repository';
import { ShopService } from './shop.service';

@Module({
  controllers: [ShopController],
  providers: [ShopRepository, ShopService],
})
export class ShopModule {}

// 兼容原模块文件的导出，内部代码直接引用对应职责文件。
export { ShopController } from './shop.controller';
export { ShopService } from './shop.service';
