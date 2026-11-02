import type { MoneyProps } from '../money/money.js';

import { Wallet } from '../wallet/wallet.js';

import {
  WalletLedgerEntry,
  type LedgerDirection,
} from '../ledger/wallet-ledger-entry.js';

import {
  WagerTransaction,
  WagerTransactionStatus,
  type WagerTransactionKind,
  type FailureCode,
} from '../wagering/wager-transaction.js';

import {
  IntegrationEvent,
  type EventContext,
  type IntegrationEventProps,
} from './integration-event.js';

// Monta as propriedades comuns de todos os eventos.
function propsFor<T extends object>(
  ctx: EventContext,
  aggregateId: string,
  data: T,
): IntegrationEventProps<T> {
  return { ...ctx, aggregateId, data };
}

// ========================================
// 1. WagerTransactionProcessed
// ========================================

interface WagerTransactionProcessedData {
  transactionId: string;
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  roundId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
}

export class WagerTransactionProcessed
  extends IntegrationEvent<WagerTransactionProcessedData> {

  readonly eventType = 'WagerTransactionProcessed';
  readonly version = 1;

  private constructor(
    props: IntegrationEventProps<WagerTransactionProcessedData>,
  ) {
    super(props);
  }

  static from(
    tx: WagerTransaction,
    ctx: EventContext,
  ): WagerTransactionProcessed {

    if (tx.status !== WagerTransactionStatus.Processed) {
      throw new Error('Transaction is not PROCESSED');
    }

    return new WagerTransactionProcessed(
      propsFor(ctx, tx.walletId, {
        transactionId: tx.id,
        providerId: tx.providerId,
        externalTransactionId: tx.externalTransactionId,
        walletId: tx.walletId,
        roundId: tx.roundId,
        kind: tx.kind,
        money: tx.money.toJSON(),
        ...(tx.referenceExternalTransactionId
          ? {
              referenceExternalTransactionId:
                tx.referenceExternalTransactionId,
            }
          : {}),
      }),
    );
  }
}

// ========================================
// 2. WagerTransactionRejected
// ========================================

interface WagerTransactionRejectedData {
  transactionId: string;
  providerId: string;
  walletId: string;
  kind: WagerTransactionKind;
  failureCode: FailureCode;
}

export class WagerTransactionRejected
  extends IntegrationEvent<WagerTransactionRejectedData> {

  readonly eventType = 'WagerTransactionRejected';
  readonly version = 1;

  private constructor(
    props: IntegrationEventProps<WagerTransactionRejectedData>,
  ) {
    super(props);
  }

  static from(
    tx: WagerTransaction,
    ctx: EventContext,
  ): WagerTransactionRejected {

    if (
      tx.status !== WagerTransactionStatus.Rejected ||
      !tx.failureCode
    ) {
      throw new Error(
        'Transaction is not REJECTED with failure code',
      );
    }

    return new WagerTransactionRejected(
      propsFor(ctx, tx.walletId, {
        transactionId: tx.id,
        providerId: tx.providerId,
        walletId: tx.walletId,
        kind: tx.kind,
        failureCode: tx.failureCode,
      }),
    );
  }
}

// ========================================
// 3. WagerTransactionPendingReference
// ========================================

interface WagerTransactionPendingReferenceData {
  transactionId: string;
  providerId: string;
  walletId: string;
  referenceExternalTransactionId: string;
}

export class WagerTransactionPendingReference
  extends IntegrationEvent<WagerTransactionPendingReferenceData> {

  readonly eventType = 'WagerTransactionPendingReference';
  readonly version = 1;

  private constructor(
    props: IntegrationEventProps<WagerTransactionPendingReferenceData>,
  ) {
    super(props);
  }

  static from(
    tx: WagerTransaction,
    ctx: EventContext,
  ): WagerTransactionPendingReference {

    if (
      tx.status !== WagerTransactionStatus.PendingReference ||
      !tx.referenceExternalTransactionId
    ) {
      throw new Error(
        'Transaction is not PENDING_REFERENCE',
      );
    }

    return new WagerTransactionPendingReference(
      propsFor(ctx, tx.walletId, {
        transactionId: tx.id,
        providerId: tx.providerId,
        walletId: tx.walletId,
        referenceExternalTransactionId:
          tx.referenceExternalTransactionId,
      }),
    );
  }
}

// ========================================
// 4. WalletBalanceChanged
// ========================================

interface WalletBalanceChangedData {
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  walletVersion: number;
}

export class WalletBalanceChanged
  extends IntegrationEvent<WalletBalanceChangedData> {

  readonly eventType = 'WalletBalanceChanged';
  readonly version = 1;

  private constructor(
    props: IntegrationEventProps<WalletBalanceChangedData>,
  ) {
    super(props);
  }

  static from(
    wallet: Wallet,
    entry: WalletLedgerEntry,
    ctx: EventContext,
  ): WalletBalanceChanged {

    if (
      wallet.id !== entry.walletId ||
      !wallet.balance.equals(entry.balanceAfter) ||
      !entry.isBalanced()
    ) {
      throw new Error(
        'Ledger entry does not match wallet state',
      );
    }

    return new WalletBalanceChanged(
      propsFor(ctx, wallet.id, {
        walletId: wallet.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        walletVersion: wallet.version,
      }),
    );
  }
}