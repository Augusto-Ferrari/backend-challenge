import { Money } from '../money/money.js';

import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../ledger/wallet-ledger-entry.js';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletMovement {
  ledgerId: string;
  transactionId: string;
  money: Money;
  at?: Date;
}

export class InsufficientBalanceError extends Error {
  readonly code = 'INSUFFICIENT_FUNDS';

  constructor() {
    super('Insufficient wallet balance');
    this.name = 'InsufficientBalanceError';
  }
}

export class WalletCurrencyMismatchError extends Error {
  readonly code = 'CURRENCY_MISMATCH';

  constructor() {
    super('Wallet currency does not match operation currency');
    this.name = 'WalletCurrencyMismatchError';
  }
}

export class Wallet {
  private _balance: Money;
  private _version: number;
  private _updatedAt: Date;
  private readonly _createdAt: Date;

  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    balance: Money,
    version: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this._balance = balance;
    this._version = version;
    this._createdAt = new Date(createdAt);
    this._updatedAt = new Date(updatedAt);
  }

  static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
    at?: Date;
  }): Wallet {
    if (!props.id?.trim() || !props.playerId?.trim()) {
      throw new Error('Wallet identifiers are required');
    }

    if (props.initialBalance.isNegative()) {
      throw new Error('Initial balance cannot be negative');
    }

    const now = props.at ?? new Date();

    if (Number.isNaN(now.getTime())) {
      throw new Error('Invalid wallet timestamp');
    }

    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  // Recupera o estado salvo no PostgreSQL.
  // Não executa novamente as regras de transição.
  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get createdAt(): Date {
    return new Date(this._createdAt);
  }

  get updatedAt(): Date {
    return new Date(this._updatedAt);
  }

  // Adiciona dinheiro à carteira.
  credit(props: WalletMovement): WalletLedgerEntry {
    this.assertSameCurrency(props.money);
    this.assertPositiveAmount(props.money);
    this.assertVersionAvailable();

    const before = this._balance;
    const after = before.add(props.money);
    const at = props.at ?? new Date();

    // Primeiro valida e constrói o lançamento.
    const entry = WalletLedgerEntry.create({
      id: props.ledgerId,
      walletId: this.id,
      transactionId: props.transactionId,
      direction: LedgerDirection.Credit,
      money: props.money,
      balanceBefore: before,
      balanceAfter: after,
      createdAt: at,
    });

    // Só atualiza o estado se o lançamento for válido.
    this._balance = after;
    this._version += 1;
    this._updatedAt = new Date(at);

    return entry;
  }

  // Retira dinheiro da carteira.
  debit(props: WalletMovement): WalletLedgerEntry {
    this.assertSameCurrency(props.money);
    this.assertPositiveAmount(props.money);
    this.assertVersionAvailable();

    if (this._balance.isLessThan(props.money)) {
      throw new InsufficientBalanceError();
    }

    const before = this._balance;
    const after = before.subtract(props.money);
    const at = props.at ?? new Date();

    const entry = WalletLedgerEntry.create({
      id: props.ledgerId,
      walletId: this.id,
      transactionId: props.transactionId,
      direction: LedgerDirection.Debit,
      money: props.money,
      balanceBefore: before,
      balanceAfter: after,
      createdAt: at,
    });

    this._balance = after;
    this._version += 1;
    this._updatedAt = new Date(at);

    return entry;
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new WalletCurrencyMismatchError();
    }
  }

  private assertPositiveAmount(money: Money): void {
    if (!money.isPositive()) {
      throw new Error(
        'Wallet movement amount must be positive'
      );
    }
  }

  private assertVersionAvailable(): void {
    if (!Number.isSafeInteger(this._version + 1)) {
      throw new Error('Wallet version limit reached');
    }
  }
}