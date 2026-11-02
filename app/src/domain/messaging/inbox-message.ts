export interface InboxMessageState {
  messageId: string;
  consumerName: string;
  payloadHash: string;
  receivedAt: Date;
  processedAt?: Date;
}

export class InboxMessage {
  readonly messageId: string;
  readonly consumerName: string;
  readonly payloadHash: string;

  private readonly receivedAtMs: number;
  private processedAtMs?: number;

  private constructor(state: InboxMessageState) {
    this.messageId = state.messageId;
    this.consumerName = state.consumerName;
    this.payloadHash = state.payloadHash;
    this.receivedAtMs = state.receivedAt.getTime();
    this.processedAtMs = state.processedAt?.getTime();
  }

  static receive(
    props: Omit<InboxMessageState, 'processedAt'>,
  ): InboxMessage {

    if (
      !props.messageId?.trim() ||
      !props.consumerName?.trim()
    ) {
      throw new Error(
        'Inbox messageId and consumerName are required',
      );
    }

    if (!/^[a-f0-9]{64}$/.test(props.payloadHash)) {
      throw new Error('Invalid inbox payload hash');
    }

    if (
      !(props.receivedAt instanceof Date) ||
      Number.isNaN(props.receivedAt.getTime())
    ) {
      throw new Error('Invalid inbox receivedAt');
    }

    return new InboxMessage(props);
  }

  static rehydrate(
    state: InboxMessageState,
  ): InboxMessage {
    return new InboxMessage(state);
  }

  get receivedAt(): Date {
    return new Date(this.receivedAtMs);
  }

  get processedAt(): Date | undefined {
    return this.processedAtMs === undefined
      ? undefined
      : new Date(this.processedAtMs);
  }

  isProcessed(): boolean {
    return this.processedAtMs !== undefined;
  }

  markProcessed(at: Date): void {
    if (this.isProcessed()) {
      throw new Error('Inbox message already processed');
    }

    if (
      !(at instanceof Date) ||
      Number.isNaN(at.getTime())
    ) {
      throw new Error('Invalid inbox processedAt');
    }

    this.processedAtMs = at.getTime();
  }
}