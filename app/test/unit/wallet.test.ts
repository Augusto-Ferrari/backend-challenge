import { describe, expect, test } from 'bun:test';

import { Money } from '../../src/domain/money/money.js';

import {
  Wallet,
  InsufficientBalanceError,
  WalletCurrencyMismatchError,
} from '../../src/domain/wallet/wallet.js';

import {
  WalletLedgerEntry,
  LedgerDirection,
} from '../../src/domain/ledger/wallet-ledger-entry.js';

const WALLET_ID = '0192f291-27dd-7d3f-8071-5f8685deef37';
const PLAYER_ID = '0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1';

function brl(amount: string): Money {
  return Money.from({ amount, currency: 'BRL' });
}

function createWallet(initialBalance = '100.00'): Wallet {
  return Wallet.open({
    id: WALLET_ID,
    playerId: PLAYER_ID,
    initialBalance: brl(initialBalance),
  });
}

describe('Wallet', () => {
  test('opens with initial balance and version 1', () => {
    const wallet = createWallet();

    expect(wallet.balance.toJSON().amount).toBe('100.00');
    expect(wallet.currency).toBe('BRL');
    expect(wallet.version).toBe(1);
  });

  test('opens with zero balance', () => {
    const wallet = createWallet('0.00');

    expect(wallet.balance.isZero()).toBe(true);
    expect(wallet.version).toBe(1);
  });

  test('rejects negative initial balance', () => {
    const negative = brl('10.00').negate();

    expect(() =>
      Wallet.open({
        id: WALLET_ID,
        playerId: PLAYER_ID,
        initialBalance: negative,
      })
    ).toThrow();
  });

  test('credits money and generates ledger', () => {
    const wallet = createWallet();

    const ledger = wallet.credit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: brl('50.00'),
    });

    expect(wallet.balance.toJSON().amount).toBe('150.00');
    expect(wallet.version).toBe(2);

    expect(ledger.direction).toBe(LedgerDirection.Credit);
    expect(ledger.balanceBefore.toJSON().amount).toBe('100.00');
    expect(ledger.balanceAfter.toJSON().amount).toBe('150.00');
    expect(ledger.isBalanced()).toBe(true);
  });

  test('debits money and generates ledger', () => {
    const wallet = createWallet();

    const ledger = wallet.debit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: brl('25.00'),
    });

    expect(wallet.balance.toJSON().amount).toBe('75.00');
    expect(wallet.version).toBe(2);

    expect(ledger.direction).toBe(LedgerDirection.Debit);
    expect(ledger.balanceBefore.toJSON().amount).toBe('100.00');
    expect(ledger.balanceAfter.toJSON().amount).toBe('75.00');
    expect(ledger.isBalanced()).toBe(true);
  });

  test('allows using the entire available balance', () => {
    const wallet = createWallet();

    wallet.debit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: brl('100.00'),
    });

    expect(wallet.balance.isZero()).toBe(true);
    expect(wallet.version).toBe(2);
  });

  test('rejects insufficient funds without changing state', () => {
    const wallet = createWallet();

    expect(() =>
      wallet.debit({
        ledgerId: crypto.randomUUID(),
        transactionId: crypto.randomUUID(),
        money: brl('150.00'),
      })
    ).toThrow(InsufficientBalanceError);

    expect(wallet.balance.toJSON().amount).toBe('100.00');
    expect(wallet.version).toBe(1);
  });

  test('rejects different currency', () => {
    const wallet = createWallet();

    expect(() =>
      wallet.credit({
        ledgerId: crypto.randomUUID(),
        transactionId: crypto.randomUUID(),
        money: Money.from({
          amount: '10.00',
          currency: 'USD',
        }),
      })
    ).toThrow(WalletCurrencyMismatchError);

    expect(wallet.version).toBe(1);
  });

  test('rejects zero-value movement', () => {
    const wallet = createWallet();

    expect(() =>
      wallet.debit({
        ledgerId: crypto.randomUUID(),
        transactionId: crypto.randomUUID(),
        money: brl('0.00'),
      })
    ).toThrow();

    expect(wallet.version).toBe(1);
  });

  test('rejects invalid ledger without changing wallet', () => {
    const wallet = createWallet();

    expect(() =>
      wallet.credit({
        ledgerId: '',
        transactionId: crypto.randomUUID(),
        money: brl('25.00'),
      })
    ).toThrow();

    expect(wallet.balance.toJSON().amount).toBe('100.00');
    expect(wallet.version).toBe(1);
  });

  test('increments version for each balance change', () => {
    const wallet = createWallet();

    wallet.credit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: brl('30.00'),
    });

    wallet.debit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: brl('50.00'),
    });

    expect(wallet.balance.toJSON().amount).toBe('80.00');
    expect(wallet.version).toBe(3);
  });

  test('reconstructs a previously persisted wallet', () => {
    const wallet = Wallet.rehydrate({
      id: WALLET_ID,
      playerId: PLAYER_ID,
      currency: 'BRL',
      balance: brl('75.00'),
      version: 5,
      createdAt: new Date('2026-10-01T12:00:00Z'),
      updatedAt: new Date('2026-10-02T12:00:00Z'),
    });

    expect(wallet.balance.toJSON().amount).toBe('75.00');
    expect(wallet.version).toBe(5);
  });
});

describe('WalletLedgerEntry', () => {
  test('rejects incorrect ledger arithmetic', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: crypto.randomUUID(),
        walletId: WALLET_ID,
        transactionId: crypto.randomUUID(),
        direction: LedgerDirection.Debit,
        money: brl('30.00'),
        balanceBefore: brl('100.00'),
        balanceAfter: brl('80.00'),
        createdAt: new Date(),
      })
    ).toThrow('Ledger arithmetic mismatch');
  });

  test('rejects a ledger with negative final balance', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: crypto.randomUUID(),
        walletId: WALLET_ID,
        transactionId: crypto.randomUUID(),
        direction: LedgerDirection.Debit,
        money: brl('150.00'),
        balanceBefore: brl('100.00'),
        balanceAfter: brl('50.00').negate(),
        createdAt: new Date(),
      })
    ).toThrow();
  });

  test('supports an opening ledger entry', () => {
    const wallet = createWallet();

    const opening = WalletLedgerEntry.create({
      id: crypto.randomUUID(),
      walletId: wallet.id,
      transactionId: crypto.randomUUID(),
      direction: LedgerDirection.Credit,
      money: wallet.balance,
      balanceBefore: Money.zero('BRL'),
      balanceAfter: wallet.balance,
      createdAt: wallet.createdAt,
    });

    expect(opening.isBalanced()).toBe(true);
    expect(wallet.version).toBe(1);
  });

  test('creates an immutable ledger entry', () => {
    const wallet = createWallet();

    const ledger = wallet.debit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: brl('20.00'),
    });

    expect(Object.isFrozen(ledger)).toBe(true);

    const date = ledger.createdAt;
    date.setFullYear(2000);

    expect(ledger.createdAt.getFullYear()).not.toBe(2000);
  });

  test('ledger movements reconstruct the wallet balance', () => {
    const wallet = createWallet();

    const credit = wallet.credit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: brl('40.00'),
    });

    const debit = wallet.debit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: brl('65.00'),
    });

    const entries = [credit, debit];

    let calculated = brl('100.00');

    for (const entry of entries) {
      calculated =
        entry.direction === LedgerDirection.Credit
          ? calculated.add(entry.money)
          : calculated.subtract(entry.money);
    }

    expect(calculated.equals(wallet.balance)).toBe(true);
    expect(wallet.balance.toJSON().amount).toBe('75.00');
  });
});