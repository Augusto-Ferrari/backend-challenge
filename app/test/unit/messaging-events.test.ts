import { describe, expect, test } from 'bun:test';

import { Money } from '../../src/domain/money/money.js';
import { Wallet } from '../../src/domain/wallet/wallet.js';

import {
  WagerTransaction,
  WagerTransactionKind as Kind,
  FailureCode,
} from '../../src/domain/wagering/wager-transaction.js';

import {
  InboxMessage,
} from '../../src/domain/messaging/inbox-message.js';

import {
  OutboxMessage,
} from '../../src/domain/messaging/outbox-message.js';

import {
  WagerTransactionProcessed,
  WagerTransactionRejected,
  WagerTransactionPendingReference,
  WalletBalanceChanged,
} from '../../src/domain/events/wager-events.js';

const HASH = 'a'.repeat(64);
const NOW = new Date('2026-11-02T10:00:00.000Z');

const PLAYER_ID = crypto.randomUUID();
const WALLET_ID = crypto.randomUUID();

const money = (amount: string) =>
  Money.from({ amount, currency: 'BRL' });

const ctx = () => ({
  eventId: crypto.randomUUID(),
  correlationId: 'request-123',
  occurredAt: NOW,
});

function transaction(
  kind: Kind = Kind.Bet,
): WagerTransaction {
  return WagerTransaction.create({
    id: crypto.randomUUID(),
    providerId: 'provider-a',
    externalTransactionId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    payloadHash: HASH,
    walletId: WALLET_ID,
    playerId: PLAYER_ID,
    roundId: 'round-1',
    gameId: 'game-1',
    kind,
    money: money('25.00'),
  });
}

// ========================================
// TESTES DA INBOX
// ========================================

describe('InboxMessage', () => {
  test('receives a new message', () => {
    const inbox = InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'wager-consumer',
      payloadHash: HASH,
      receivedAt: NOW,
    });

    expect(inbox.isProcessed()).toBe(false);
    expect(inbox.processedAt).toBeUndefined();
  });

  test('rejects missing identity or invalid hash', () => {
    expect(() => InboxMessage.receive({
      messageId: '',
      consumerName: 'wager-consumer',
      payloadHash: HASH,
      receivedAt: NOW,
    })).toThrow();

    expect(() => InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'wager-consumer',
      payloadHash: 'invalid',
      receivedAt: NOW,
    })).toThrow();
  });

  test('marks processed only once', () => {
    const inbox = InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'wager-consumer',
      payloadHash: HASH,
      receivedAt: NOW,
    });

    inbox.markProcessed(
      new Date(NOW.getTime() + 1000),
    );

    expect(inbox.isProcessed()).toBe(true);

    expect(() =>
      inbox.markProcessed(new Date())
    ).toThrow('already processed');
  });

  test('rehydrates an already processed message', () => {
    const inbox = InboxMessage.rehydrate({
      messageId: 'msg-1',
      consumerName: 'wager-consumer',
      payloadHash: HASH,
      receivedAt: NOW,
      processedAt: NOW,
    });

    expect(inbox.isProcessed()).toBe(true);
  });
});

// ========================================
// TESTES DOS EVENTOS
// ========================================

describe('Integration events', () => {
  test('serializes a processed BET', () => {
    const tx = transaction();
    tx.markProcessed();

    const event = WagerTransactionProcessed.from(
      tx,
      ctx(),
    );

    const envelope = event.toJSON();

    expect(envelope.eventType).toBe(
      'WagerTransactionProcessed',
    );
    expect(envelope.version).toBe(1);
    expect(envelope.aggregateId).toBe(WALLET_ID);
    expect(envelope.data.money.amount).toBe('25.00');
    expect(envelope.occurredAt).toBe(
      NOW.toISOString(),
    );
  });

  test('publishes processed LOSS', () => {
    const tx = transaction(Kind.Loss);
    tx.markProcessed();

    const event = WagerTransactionProcessed.from(
      tx,
      ctx(),
    );

    expect(event.eventType).toBe(
      'WagerTransactionProcessed',
    );
  });

  test('rejects processed event for pending transaction', () => {
    expect(() =>
      WagerTransactionProcessed.from(
        transaction(),
        ctx(),
      )
    ).toThrow();
  });

  test('creates a rejected event', () => {
    const tx = transaction();
    tx.reject(FailureCode.InsufficientFunds);

    const event = WagerTransactionRejected.from(
      tx,
      ctx(),
    );

    expect(event.toJSON().data.failureCode).toBe(
      FailureCode.InsufficientFunds,
    );
  });

  test('creates pending reference event', () => {
    const tx = WagerTransaction.create({
      id: crypto.randomUUID(),
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      idempotencyKey: 'provider-a:refund-1',
      payloadHash: HASH,
      walletId: WALLET_ID,
      playerId: PLAYER_ID,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: Kind.Refund,
      money: money('25.00'),
      referenceExternalTransactionId: 'bet-1',
    });

    tx.markPendingReference();

    const event = WagerTransactionPendingReference.from(
      tx,
      ctx(),
    );

    expect(
      event.toJSON().data.referenceExternalTransactionId,
    ).toBe('bet-1');
  });

  test('creates WalletBalanceChanged', () => {
    const wallet = Wallet.open({
      id: WALLET_ID,
      playerId: PLAYER_ID,
      initialBalance: money('100.00'),
    });

    const ledger = wallet.debit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: money('25.00'),
    });

    const event = WalletBalanceChanged.from(
      wallet,
      ledger,
      ctx(),
    );

    expect(event.data.balanceAfter.amount).toBe('75.00');
    expect(event.data.walletVersion).toBe(2);
  });

  test('rejects mismatched wallet and ledger', () => {
    const wallet = Wallet.open({
      id: WALLET_ID,
      playerId: PLAYER_ID,
      initialBalance: money('100.00'),
    });

    const another = Wallet.open({
      id: crypto.randomUUID(),
      playerId: PLAYER_ID,
      initialBalance: money('100.00'),
    });

    const ledger = another.debit({
      ledgerId: crypto.randomUUID(),
      transactionId: crypto.randomUUID(),
      money: money('25.00'),
    });

    expect(() =>
      WalletBalanceChanged.from(
        wallet,
        ledger,
        ctx(),
      )
    ).toThrow();
  });
});

// ========================================
// TESTES DA OUTBOX
// ========================================

describe('OutboxMessage', () => {
  function pendingOutbox(): OutboxMessage {
    const tx = transaction();
    tx.markProcessed();

    const event = WagerTransactionProcessed.from(
      tx,
      ctx(),
    );

    return OutboxMessage.enqueue(event);
  }

  test('enqueues a serialized event', () => {
    const outbox = pendingOutbox();

    expect(outbox.isPending()).toBe(true);
    expect(outbox.attempts).toBe(0);

    expect(outbox.payload.eventType).toBe(
      'WagerTransactionProcessed',
    );

    expect(outbox.isDue(NOW)).toBe(true);
  });

  test('protects stored payload from mutation', () => {
    const outbox = pendingOutbox();

    const copy = outbox.payload as {
      data: { money: { amount: string } };
    };

    copy.data.money.amount = '999.00';

    const original = outbox.payload as {
      data: { money: { amount: string } };
    };

    expect(original.data.money.amount).toBe('25.00');
  });

  test('schedules exponential retry', () => {
    const outbox = pendingOutbox();

    outbox.scheduleRetry(NOW);

    expect(outbox.attempts).toBe(1);

    expect(outbox.nextAttemptAt?.getTime()).toBe(
      NOW.getTime() + 2000,
    );

    expect(
      outbox.isDue(
        new Date(NOW.getTime() + 1999),
      ),
    ).toBe(false);

    expect(
      outbox.isDue(
        new Date(NOW.getTime() + 2000),
      ),
    ).toBe(true);

    outbox.scheduleRetry(NOW);

    expect(outbox.attempts).toBe(2);

    expect(outbox.nextAttemptAt?.getTime()).toBe(
      NOW.getTime() + 4000,
    );
  });

  test('marks an event as published', () => {
    const outbox = pendingOutbox();

    outbox.markPublished(NOW);

    expect(outbox.isPending()).toBe(false);
    expect(outbox.isDue(NOW)).toBe(false);

    expect(() =>
      outbox.scheduleRetry(NOW)
    ).toThrow('already published');
  });

  test('rehydrates an outbox retry state', () => {
    const initial = pendingOutbox();

    const restored = OutboxMessage.rehydrate({
      id: initial.id,
      aggregateId: initial.aggregateId,
      eventType: initial.eventType,
      payload: initial.payload,
      occurredAt: initial.occurredAt,
      attempts: 3,
      nextAttemptAt: new Date(
        NOW.getTime() + 8000,
      ),
    });

    expect(restored.attempts).toBe(3);

    expect(
      restored.isDue(
        new Date(NOW.getTime() + 7999),
      ),
    ).toBe(false);
  });
});