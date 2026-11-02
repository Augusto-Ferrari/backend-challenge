import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  BadRequestException,
} from '@nestjs/common';

import {
  WalletsService,
} from '../../application/wallets/wallets.service.js';

import {
  CreateWalletDto,
} from './dto/create-wallet.dto.js';

@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
  ) {}

  @Post()
  async create(@Body() body: CreateWalletDto) {
    return this.walletsService.createWallet(body);
  }

  @Get(':walletId')
  async findOne(@Param('walletId') walletId: string) {
    const uuidPattern =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

    if (!uuidPattern.test(walletId)) {
      throw new BadRequestException('Invalid wallet ID');
    }

    return this.walletsService.getWallet(walletId);
  }
}