import { Type } from 'class-transformer';

import {
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class InitialBalanceDto {
  @IsString()
  @Matches(/^(0|[1-9]\d*)\.\d{2}$/)
  amount!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}

export class CreateWalletDto {
  @IsString()
  @Matches(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  )
  playerId!: string;

  @ValidateNested()
  @Type(() => InitialBalanceDto)
  initialBalance!: InitialBalanceDto;
}