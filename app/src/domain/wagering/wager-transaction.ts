import { Money } from '../money/money.js';
import { LedgerDirection } from '../ledger/wallet-ledger-entry.js';

export enum WagerTransactionKind {
  Opening = 'OPENING',
  Bet = 'BET',
  Win = 'WIN',
  Loss = 'LOSS',
  Refund = 'REFUND',
  Rollback = 'ROLLBACK',
}

export enum WagerTransactionStatus {
  Pending = 'PENDING',
  PendingReference = 'PENDING_REFERENCE',
  Processed = 'PROCESSED',
  Rejected = 'REJECTED',
  Failed = 'FAILED',
}

export enum FailureCode {
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
  ReversalInsufficientFunds = 'REVERSAL_INSUFFICIENT_FUNDS',
  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  InvalidReference = 'INVALID_REFERENCE',
  AlreadyReversed = 'ALREADY_REVERSED',
  CurrencyMismatch = 'CURRENCY_MISMATCH',
  InfrastructurePermanent = 'INFRASTRUCTURE_PERMANENT',
}

export class InvalidTransactionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransactionStateError';
  }
}

export class InvalidReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReferenceError';
  }
}

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt?: Date;
}

export interface WagerTransactionState
  extends Omit<CreateWagerTransactionProps, 'createdAt'> {
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
}

export class WagerTransaction {
  public readonly id: string;
  public readonly providerId: string;
  public readonly externalTransactionId: string;
  public readonly idempotencyKey: string;
  public readonly payloadHash: string;
  public readonly walletId: string;
  public readonly playerId: string;
  public readonly roundId: string;
  public readonly gameId: string;
  public readonly kind: WagerTransactionKind;
  public readonly money: Money;
  public readonly referenceExternalTransactionId?: string;

  private readonly createdAtMs: number;
  private _status: WagerTransactionStatus;
  private _referenceTransactionId?: string;
  private _failureCode?: FailureCode;
  private _processedAt?: Date;

  private constructor(state: WagerTransactionState) {
    this.id = state.id;
    this.providerId = state.providerId;
    this.externalTransactionId = state.externalTransactionId;
    this.idempotencyKey = state.idempotencyKey;
    this.payloadHash = state.payloadHash;
    this.walletId = state.walletId;
    this.playerId = state.playerId;
    this.roundId = state.roundId;
    this.gameId = state.gameId;
    this.kind = state.kind;
    this.money = state.money;

    this.referenceExternalTransactionId =
      state.referenceExternalTransactionId;

    this.createdAtMs = state.createdAt.getTime();
    this._status = state.status;
    this._referenceTransactionId = state.referenceTransactionId;
    this._failureCode = state.failureCode;
    this._processedAt = state.processedAt
      ? new Date(state.processedAt)
      : undefined;
  }

  // Factory para operações recebidas de provedores.
  static create(
    props: CreateWagerTransactionProps,
  ): WagerTransaction {
    return this.createInternal(props, false);
  }

  // Factory exclusiva para abertura de carteira.
  // Não deve ser exposta na API nem no consumer SQS.
  static createOpening(props: {
    id: string;
    walletId: string;
    playerId: string;
    money: Money;
    payloadHash: string;
    createdAt?: Date;
  }): WagerTransaction {
    return this.createInternal(
      {
        id: props.id,
        providerId: 'system',
        externalTransactionId: `opening:${props.walletId}`,
        idempotencyKey: `system:opening:${props.walletId}`,
        payloadHash: props.payloadHash,
        walletId: props.walletId,
        playerId: props.playerId,
        roundId: `opening:${props.walletId}`,
        gameId: 'internal',
        kind: WagerTransactionKind.Opening,
        money: props.money,
        createdAt: props.createdAt,
      },
      true,
    );
  }

  private static createInternal(
    props: CreateWagerTransactionProps,
    allowOpening: boolean,
  ): WagerTransaction {
    const required: Array<[string, unknown]> = [
      ['id', props.id],
      ['providerId', props.providerId],
      ['externalTransactionId', props.externalTransactionId],
      ['idempotencyKey', props.idempotencyKey],
      ['walletId', props.walletId],
      ['playerId', props.playerId],
      ['roundId', props.roundId],
      ['gameId', props.gameId],
    ];

    for (const [field, value] of required) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`${field} is required`);
      }
    }

    if (
      typeof props.payloadHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(props.payloadHash)
    ) {
      throw new Error('Invalid SHA-256 payload hash');
    }

    if (
      !Object.values(WagerTransactionKind).includes(props.kind)
    ) {
      throw new Error('Invalid transaction kind');
    }

    if (
      props.kind === WagerTransactionKind.Opening &&
      !allowOpening
    ) {
      throw new Error(
        'OPENING is an internal-only transaction',
      );
    }

    if (!(props.money instanceof Money) ||
        !props.money.isPositive()) {
      throw new Error('Transaction amount must be positive');
    }

    const reference =
      props.referenceExternalTransactionId;

    if (
      reference !== undefined &&
      (typeof reference !== 'string' || !reference.trim())
    ) {
      throw new Error('Invalid external reference');
    }

    const requiresReference =
      props.kind === WagerTransactionKind.Refund ||
      props.kind === WagerTransactionKind.Rollback;

    if (requiresReference && !reference) {
      throw new Error(
        `${props.kind} requires an external transaction reference`,
      );
    }

    if (
      reference &&
      ![
        WagerTransactionKind.Win,
        WagerTransactionKind.Refund,
        WagerTransactionKind.Rollback,
      ].includes(props.kind)
    ) {
      throw new Error(
        `${props.kind} cannot contain a transaction reference`,
      );
    }

    const createdAt = props.createdAt ?? new Date();

    if (
      !(createdAt instanceof Date) ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new Error('Invalid transaction timestamp');
    }

    return new WagerTransaction({
      ...props,
      createdAt: new Date(createdAt),
      status: WagerTransactionStatus.Pending,
    });
  }

  // Reconstitui o estado já persistido no PostgreSQL.
  // Não repete as validações da factory de criação.
  static rehydrate(
    state: WagerTransactionState,
  ): WagerTransaction {
    return new WagerTransaction(state);
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get createdAt(): Date {
    return new Date(this.createdAtMs);
  }

  get processedAt(): Date | undefined {
    return this._processedAt
      ? new Date(this._processedAt)
      : undefined;
  }

  isTerminal(): boolean {
    return [
      WagerTransactionStatus.Processed,
      WagerTransactionStatus.Rejected,
      WagerTransactionStatus.Failed,
    ].includes(this._status);
  }

  // Indica se o tipo de operação pode mover saldo.
  // Não significa que o movimento já foi aplicado.
  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return (
      this.kind === WagerTransactionKind.Refund ||
      this.kind === WagerTransactionKind.Rollback
    );
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  // Usado quando uma transação referenciada ainda não existe.
  markPendingReference(): void {
    this.assertActive();

    if (this._status !== WagerTransactionStatus.Pending) {
      throw new InvalidTransactionStateError(
        'Only PENDING transactions may enter PENDING_REFERENCE',
      );
    }

    if (!this.referenceExternalTransactionId) {
      throw new InvalidTransactionStateError(
        'Transaction does not have a reference to await',
      );
    }

    this._status = WagerTransactionStatus.PendingReference;
  }

  markProcessed(
    referenceTransactionId?: string,
    at: Date = new Date(),
  ): void {
    this.assertActive();

    if (
      !(at instanceof Date) ||
      Number.isNaN(at.getTime())
    ) {
      throw new Error('Invalid processing timestamp');
    }

    if (
      referenceTransactionId !== undefined &&
      (typeof referenceTransactionId !== 'string' ||
        !referenceTransactionId.trim())
    ) {
      throw new InvalidReferenceError(
        'Invalid internal reference ID',
      );
    }

    if (
      this.referenceExternalTransactionId &&
      !referenceTransactionId
    ) {
      throw new InvalidReferenceError(
        'Referenced transaction must be resolved before processing',
      );
    }

    if (
      !this.referenceExternalTransactionId &&
      referenceTransactionId
    ) {
      throw new InvalidReferenceError(
        'Unexpected internal transaction reference',
      );
    }

    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = new Date(at);
  }

  reject(code: FailureCode): void {
    this.assertActive();
    this.assertFailureCode(code);

    if (code === FailureCode.InfrastructurePermanent) {
      throw new Error(
        'Infrastructure failures must use fail()',
      );
    }

    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
  }

  fail(code: FailureCode): void {
    this.assertActive();
    this.assertFailureCode(code);

    if (code !== FailureCode.InfrastructurePermanent) {
      throw new Error(
        'FAILED requires a permanent infrastructure failure',
      );
    }

    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
  }

  // Determina a movimentação financeira exigida.
  // Para reversões, a referência é obrigatória e validada.
  ledgerDirectionFor(
    reference?: WagerTransaction,
  ): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
        if (this.referenceExternalTransactionId) {
          this.validateReference(reference);
        }
        return LedgerDirection.Credit;

      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;

      case WagerTransactionKind.Loss:
        throw new Error('LOSS does not generate a ledger entry');

      case WagerTransactionKind.Refund:
        this.validateReference(reference);

        if (reference!.kind !== WagerTransactionKind.Bet) {
          throw new InvalidReferenceError(
            'REFUND can only reverse a BET',
          );
        }

        return LedgerDirection.Credit;

      case WagerTransactionKind.Rollback:
        this.validateReference(reference);

        if (reference!.kind === WagerTransactionKind.Bet) {
          return LedgerDirection.Credit;
        }

        if (
          reference!.kind === WagerTransactionKind.Win ||
          reference!.kind === WagerTransactionKind.Refund
        ) {
          return LedgerDirection.Debit;
        }

        throw new InvalidReferenceError(
          'ROLLBACK requires BET, WIN or REFUND',
        );
    }
  }

  // Verifica identidade, status, rodada, moeda e valor.
  private validateReference(
    reference?: WagerTransaction,
  ): void {
    if (
      !reference ||
      !this.referenceExternalTransactionId
    ) {
      throw new InvalidReferenceError(
        'Missing referenced transaction',
      );
    }

    if (reference.status !== WagerTransactionStatus.Processed) {
      throw new InvalidReferenceError(
        'Referenced transaction must be PROCESSED',
      );
    }

    if (
      reference.id === this.id ||
      reference.externalTransactionId !==
        this.referenceExternalTransactionId
    ) {
      throw new InvalidReferenceError(
        'Referenced transaction identity mismatch',
      );
    }

    if (
      reference.providerId !== this.providerId ||
      reference.playerId !== this.playerId ||
      reference.walletId !== this.walletId ||
      reference.roundId !== this.roundId ||
      reference.money.currency !== this.money.currency
    ) {
      throw new InvalidReferenceError(
        'Referenced transaction belongs to a different context',
      );
    }

    if (
      this.kind === WagerTransactionKind.Win &&
      reference.kind !== WagerTransactionKind.Bet
    ) {
      throw new InvalidReferenceError(
        'WIN may only reference a BET',
      );
    }

    if (
      this.requiresReference() &&
      !this.money.equals(reference.money)
    ) {
      throw new InvalidReferenceError(
        'Partial reversals are not supported',
      );
    }
  }

  private assertActive(): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateError(
        `Cannot transition terminal transaction: ${this._status}`,
      );
    }
  }

  private assertFailureCode(code: FailureCode): void {
    if (!Object.values(FailureCode).includes(code)) {
      throw new Error('Invalid failure code');
    }
  }
}