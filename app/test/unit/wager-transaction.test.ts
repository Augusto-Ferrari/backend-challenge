import { describe, expect, test } from 'bun:test';

import { Money } from '../../src/domain/money/money.js';
import { LedgerDirection } from '../../src/domain/ledger/wallet-ledger-entry.js';

import {
  WagerTransaction,
  WagerTransactionKind as Kind,
  WagerTransactionStatus as Status,
  FailureCode,
  InvalidReferenceError,
  InvalidTransactionStateError,
  type CreateWagerTransactionProps,
} from '../../src/domain/wagering/wager-transaction.js';

const HASH = 'a'.repeat(64);

const PLAYER_ID = crypto.randomUUID();
const WALLET_ID = crypto.randomUUID();

function brl(amount: string): Money {
  return Money.from({ amount, currency: 'BRL' });
}

function createTransaction(
  overrides: Partial<CreateWagerTransactionProps> = {},
): WagerTransaction {
  return WagerTransaction.create({
    id: crypto.randomUUID(),
    providerId: 'provider-a',
    externalTransactionId: 'transaction-123',
    idempotencyKey: 'provider-a:transaction-123',
    payloadHash: HASH,
    walletId: WALLET_ID,
    playerId: PLAYER_ID,
    roundId: 'round-987',
    gameId: 'fortune-chimp',
    kind: Kind.Bet,
    money: brl('20.00'),
    ...overrides,
  });
}

function processedBet(): WagerTransaction {
  const bet = createTransaction({
    externalTransactionId: 'bet-1',
    kind: Kind.Bet,
  });

  bet.markProcessed();
  return bet;
}

function createRefund(): WagerTransaction {
  return createTransaction({
    externalTransactionId: 'refund-1',
    kind: Kind.Refund,
    referenceExternalTransactionId: 'bet-1',
  });
}

describe('WagerTransaction - criação e estados', () => {
  test('BET starts as PENDING', () => {
    const tx = createTransaction();

    expect(tx.status).toBe(Status.Pending);
    expect(tx.isTerminal()).toBe(false);
    expect(tx.affectsBalance()).toBe(true);
  });

  test('rejects external OPENING', () => {
    expect(() =>
      createTransaction({ kind: Kind.Opening })
    ).toThrow('internal-only');
  });

  test('creates an internal OPENING', () => {
    const tx = WagerTransaction.createOpening({
      id: crypto.randomUUID(),
      walletId: WALLET_ID,
      playerId: PLAYER_ID,
      money: brl('100.00'),
      payloadHash: HASH,
    });

    expect(tx.kind).toBe(Kind.Opening);
    expect(tx.status).toBe(Status.Pending);
    expect(tx.ledgerDirectionFor()).toBe(
      LedgerDirection.Credit
    );
  });

  test('requires reference for REFUND and ROLLBACK', () => {
    for (const kind of [Kind.Refund, Kind.Rollback]) {
      expect(() =>
        createTransaction({ kind })
      ).toThrow('requires an external transaction reference');
    }
  });

  test('rejects invalid and zero amounts', () => {
    expect(() =>
      createTransaction({ money: brl('0.00') })
    ).toThrow();

    expect(() =>
      createTransaction({
        money: brl('10.00').negate(),
      })
    ).toThrow();
  });

  test('validates payload hash', () => {
    expect(() =>
      createTransaction({ payloadHash: 'invalid' })
    ).toThrow();
  });

  test('detects payload differences', () => {
    const tx = createTransaction();

    expect(tx.matchesPayload(HASH)).toBe(true);
    expect(tx.matchesPayload('b'.repeat(64))).toBe(false);
  });

  test('processes a BET', () => {
    const tx = createTransaction();

    tx.markProcessed();

    expect(tx.status).toBe(Status.Processed);
    expect(tx.isTerminal()).toBe(true);
    expect(tx.processedAt).toBeInstanceOf(Date);
  });

  test('LOSS has no balance movement', () => {
    const tx = createTransaction({ kind: Kind.Loss });

    expect(tx.affectsBalance()).toBe(false);

    expect(() =>
      tx.ledgerDirectionFor()
    ).toThrow('LOSS does not generate');

    tx.markProcessed();

    expect(tx.status).toBe(Status.Processed);
  });

  test('rejects a transaction with a failure code', () => {
    const tx = createTransaction();

    tx.reject(FailureCode.InsufficientFunds);

    expect(tx.status).toBe(Status.Rejected);
    expect(tx.failureCode).toBe(
      FailureCode.InsufficientFunds
    );
    expect(tx.isTerminal()).toBe(true);
  });

  test('records a permanent infrastructure failure', () => {
    const tx = createTransaction();

    tx.fail(FailureCode.InfrastructurePermanent);

    expect(tx.status).toBe(Status.Failed);
    expect(tx.isTerminal()).toBe(true);
  });

  test('prevents transitions from terminal states', () => {
    const tx = createTransaction();

    tx.markProcessed();

    expect(() => tx.markProcessed()).toThrow(
      InvalidTransactionStateError
    );

    expect(() =>
      tx.reject(FailureCode.InsufficientFunds)
    ).toThrow(InvalidTransactionStateError);

    expect(() =>
      tx.fail(FailureCode.InfrastructurePermanent)
    ).toThrow(InvalidTransactionStateError);
  });

  test('rehydrates an already processed transaction', () => {
    const tx = WagerTransaction.rehydrate({
      id: crypto.randomUUID(),
      providerId: 'provider-a',
      externalTransactionId: 'old-transaction',
      idempotencyKey: 'provider-a:old-transaction',
      payloadHash: HASH,
      walletId: WALLET_ID,
      playerId: PLAYER_ID,
      roundId: 'round-987',
      gameId: 'fortune-chimp',
      kind: Kind.Bet,
      money: brl('25.00'),
      status: Status.Processed,
      createdAt: new Date('2026-10-01T10:00:00Z'),
      processedAt: new Date('2026-10-01T10:00:01Z'),
    });

    expect(tx.status).toBe(Status.Processed);
    expect(tx.isTerminal()).toBe(true);
  });
});

describe('WagerTransaction - referências', () => {
  test('waits for a missing reference', () => {
    const refund = createRefund();

    refund.markPendingReference();

    expect(refund.status).toBe(Status.PendingReference);

    expect(() =>
      refund.markProcessed()
    ).toThrow(InvalidReferenceError);

    expect(refund.status).toBe(Status.PendingReference);
  });

  test('processes a REFUND after reference arrives', () => {
    const bet = processedBet();
    const refund = createRefund();

    refund.markPendingReference();

    expect(refund.ledgerDirectionFor(bet)).toBe(
      LedgerDirection.Credit
    );

    refund.markProcessed(bet.id);

    expect(refund.status).toBe(Status.Processed);
    expect(refund.referenceTransactionId).toBe(bet.id);
  });

  test('REFUND cannot reverse a WIN', () => {
    const win = createTransaction({
      kind: Kind.Win,
      externalTransactionId: 'bet-1',
    });

    win.markProcessed();

    expect(() =>
      createRefund().ledgerDirectionFor(win)
    ).toThrow(InvalidReferenceError);
  });

  test('rejects reference from another provider', () => {
    const bet = processedBet();

    const refund = createTransaction({
      kind: Kind.Refund,
      referenceExternalTransactionId: 'bet-1',
      providerId: 'provider-b',
    });

    expect(() =>
      refund.ledgerDirectionFor(bet)
    ).toThrow(InvalidReferenceError);
  });

  test('rejects reference from another wallet', () => {
    const bet = processedBet();

    const refund = createTransaction({
      kind: Kind.Refund,
      referenceExternalTransactionId: 'bet-1',
      walletId: crypto.randomUUID(),
    });

    expect(() =>
      refund.ledgerDirectionFor(bet)
    ).toThrow(InvalidReferenceError);
  });

  test('rejects reference from another round', () => {
    const bet = processedBet();

    const refund = createTransaction({
      kind: Kind.Refund,
      referenceExternalTransactionId: 'bet-1',
      roundId: 'another-round',
    });

    expect(() =>
      refund.ledgerDirectionFor(bet)
    ).toThrow(InvalidReferenceError);
  });

  test('rejects different reversal amounts', () => {
    const bet = processedBet();

    const refund = createTransaction({
      kind: Kind.Refund,
      referenceExternalTransactionId: 'bet-1',
      money: brl('10.00'),
    });

    expect(() =>
      refund.ledgerDirectionFor(bet)
    ).toThrow('Partial reversals are not supported');
  });

  test('rejects a reference that is not processed', () => {
    const bet = createTransaction({
      kind: Kind.Bet,
      externalTransactionId: 'bet-1',
    });

    expect(() =>
      createRefund().ledgerDirectionFor(bet)
    ).toThrow('must be PROCESSED');
  });

  test('ROLLBACK of BET generates CREDIT', () => {
    const bet = processedBet();

    const rollback = createTransaction({
      kind: Kind.Rollback,
      referenceExternalTransactionId: 'bet-1',
    });

    expect(rollback.ledgerDirectionFor(bet)).toBe(
      LedgerDirection.Credit
    );
  });

  test('ROLLBACK of WIN generates DEBIT', () => {
    const win = createTransaction({
      kind: Kind.Win,
      externalTransactionId: 'win-1',
    });

    win.markProcessed();

    const rollback = createTransaction({
      kind: Kind.Rollback,
      referenceExternalTransactionId: 'win-1',
    });

    expect(rollback.ledgerDirectionFor(win)).toBe(
      LedgerDirection.Debit
    );
  });

  test('ROLLBACK of REFUND generates DEBIT', () => {
    const bet = processedBet();
    const refund = createRefund();

    refund.ledgerDirectionFor(bet);
    refund.markProcessed(bet.id);

    const rollback = createTransaction({
      kind: Kind.Rollback,
      referenceExternalTransactionId: 'refund-1',
    });

    expect(rollback.ledgerDirectionFor(refund)).toBe(
      LedgerDirection.Debit
    );
  });

  test('ROLLBACK cannot reverse LOSS', () => {
    const loss = createTransaction({
      kind: Kind.Loss,
      externalTransactionId: 'loss-1',
    });

    loss.markProcessed();

    const rollback = createTransaction({
      kind: Kind.Rollback,
      referenceExternalTransactionId: 'loss-1',
    });

    expect(() =>
      rollback.ledgerDirectionFor(loss)
    ).toThrow(InvalidReferenceError);
  });

  test('WIN can reference a BET', () => {
    const bet = processedBet();

    const win = createTransaction({
      kind: Kind.Win,
      money: brl('75.00'),
      referenceExternalTransactionId: 'bet-1',
    });

    expect(win.ledgerDirectionFor(bet)).toBe(
      LedgerDirection.Credit
    );

    win.markProcessed(bet.id);

    expect(win.referenceTransactionId).toBe(bet.id);
    expect(win.status).toBe(Status.Processed);
  });
});