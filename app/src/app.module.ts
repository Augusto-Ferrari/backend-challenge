import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import ormConfig from '../mikro-orm.config.js';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    MikroOrmModule.forRoot(ormConfig),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
