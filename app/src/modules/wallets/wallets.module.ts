import { Module } from '@nestjs/common';

import {
  WalletsController,
} from './wallets.controller.js';

import {
  WalletsService,
} from '../../application/wallets/wallets.service.js';

@Module({
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}