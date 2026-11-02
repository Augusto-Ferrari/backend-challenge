import { Money } from '../money/money.js';

export enum LedgerDirection {
  Debit = 'DEBIT',
  Credit = 'CREDIT',
}

export interface LedgerEntryState {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export class WalletLedgerEntry {
  private readonly createdAtMs: number;

  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    createdAt: Date,
  ) {
    this.createdAtMs = createdAt.getTime();
    Object.freeze(this);
  }

  static create(props: LedgerEntryState): WalletLedgerEntry {
    if (
      !props.id?.trim() ||
      !props.walletId?.trim() ||
      !props.transactionId?.trim()
    ) {
      throw new Error('Ledger identifiers are required');
    }

    if (
      !(props.createdAt instanceof Date) ||
      Number.isNaN(props.createdAt.getTime())
    ) {
      throw new Error('Invalid ledger timestamp');
    }

    if (!props.money.isPositive()) {
      throw new Error('Ledger amount must be positive');
    }

    const currency = props.money.currency;

    if (
      props.balanceBefore.currency !== currency ||
      props.balanceAfter.currency !== currency
    ) {
      throw new Error('Ledger currency mismatch');
    }

    if (
      props.balanceBefore.isNegative() ||
      props.balanceAfter.isNegative()
    ) {
      throw new Error('Ledger balance cannot be negative');
    }

    if (
      props.direction !== LedgerDirection.Debit &&
      props.direction !== LedgerDirection.Credit
    ) {
      throw new Error('Invalid ledger direction');
    }

    const expectedBalance =
      props.direction === LedgerDirection.Credit
        ? props.balanceBefore.add(props.money)
        : props.balanceBefore.subtract(props.money);

    if (!expectedBalance.equals(props.balanceAfter)) {
      throw new Error('Ledger arithmetic mismatch');
    }

    return new WalletLedgerEntry(
      props.id,
      props.walletId,
      props.transactionId,
      props.direction,
      props.money,
      props.balanceBefore,
      props.balanceAfter,
      props.createdAt,
    );
  }

  // Reconstrói dados persistidos sem executar
  // novamente as regras de criação.
  static rehydrate(
    state: LedgerEntryState,
  ): WalletLedgerEntry {
    return new WalletLedgerEntry(
      state.id,
      state.walletId,
      state.transactionId,
      state.direction,
      state.money,
      state.balanceBefore,
      state.balanceAfter,
      state.createdAt,
    );
  }

  get createdAt(): Date {
    return new Date(this.createdAtMs);
  }

  isBalanced(): boolean {
    if (
      this.money.currency !== this.balanceBefore.currency ||
      this.money.currency !== this.balanceAfter.currency ||
      !this.money.isPositive() ||
      this.balanceBefore.isNegative() ||
      this.balanceAfter.isNegative()
    ) {
      return false;
    }

    if (
      this.direction !== LedgerDirection.Credit &&
      this.direction !== LedgerDirection.Debit
    ) {
      return false;
    }

    const expected =
      this.direction === LedgerDirection.Credit
        ? this.balanceBefore.add(this.money)
        : this.balanceBefore.subtract(this.money);

    return expected.equals(this.balanceAfter);
  }
}