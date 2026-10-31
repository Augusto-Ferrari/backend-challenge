import { Migration } from '@mikro-orm/migrations';

export class Migration20261031000000 extends Migration {
  override name = 'Migration20261031000000';

  override async up(): Promise<void> {

    // 1. Wallets
    this.addSql(`
      CREATE TABLE wallets (
        id uuid PRIMARY KEY,
        player_id uuid NOT NULL,
        currency varchar(3) NOT NULL,
        balance numeric(20,2) NOT NULL DEFAULT 0,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT uq_wallet_player_currency
          UNIQUE (player_id, currency),

        CONSTRAINT chk_wallet_balance_nonnegative
          CHECK (balance >= 0),

        CONSTRAINT chk_wallet_version
          CHECK (version >= 1),

        CONSTRAINT chk_wallet_currency
          CHECK (currency ~ '^[A-Z]{3}$')
      );
    `);

    // 2. Wager Transactions
    this.addSql(`
      CREATE TABLE wager_transactions (
        id uuid PRIMARY KEY,
        provider_id varchar(128) NOT NULL,
        external_transaction_id varchar(255) NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        payload_hash varchar(64) NOT NULL,
        wallet_id uuid NOT NULL
          REFERENCES wallets(id) ON DELETE RESTRICT,
        player_id uuid NOT NULL,
        round_id varchar(255) NOT NULL,
        game_id varchar(255) NOT NULL,
        kind varchar(16) NOT NULL,
        amount numeric(20,2) NOT NULL,
        currency varchar(3) NOT NULL,
        reference_external_transaction_id varchar(255),
        reference_transaction_id uuid
          REFERENCES wager_transactions(id) ON DELETE RESTRICT,
        status varchar(24) NOT NULL DEFAULT 'PENDING',
        failure_code varchar(100),
        observed_balance numeric(20,2),
        processed_at timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT uq_wager_provider_external
          UNIQUE (provider_id, external_transaction_id),

        CONSTRAINT uq_wager_idempotency_key
          UNIQUE (idempotency_key),

        CONSTRAINT chk_wager_amount
          CHECK (amount > 0),

        CONSTRAINT chk_wager_kind
          CHECK (kind IN (
            'OPENING','BET','WIN','LOSS',
            'REFUND','ROLLBACK'
          )),

        CONSTRAINT chk_wager_status
          CHECK (status IN (
            'PENDING','PENDING_REFERENCE',
            'PROCESSED','REJECTED','FAILED'
          )),

        CONSTRAINT chk_wager_reference
          CHECK (
            kind NOT IN ('REFUND','ROLLBACK')
            OR reference_external_transaction_id IS NOT NULL
          ),

        CONSTRAINT chk_wager_currency
          CHECK (currency ~ '^[A-Z]{3}$'),

        CONSTRAINT chk_wager_hash
          CHECK (payload_hash ~ '^[a-f0-9]{64}$'),

        CONSTRAINT chk_wager_attempts
          CHECK (attempts >= 0),

        CONSTRAINT chk_wager_observed_balance
          CHECK (
            observed_balance IS NULL
            OR observed_balance >= 0
          )
      );
    `);

    this.addSql(`
      CREATE INDEX idx_wager_pending
      ON wager_transactions (next_attempt_at, created_at)
      WHERE status = 'PENDING_REFERENCE';
    `);

    this.addSql(`
      CREATE INDEX idx_wager_wallet
      ON wager_transactions (wallet_id, created_at, id);
    `);

    this.addSql(`
      CREATE INDEX idx_wager_reference
      ON wager_transactions (
        provider_id,
        reference_external_transaction_id
      );
    `);

    this.addSql(`
      CREATE UNIQUE INDEX uq_wager_processed_reversal
      ON wager_transactions (
        provider_id, kind, reference_transaction_id
      )
      WHERE status = 'PROCESSED'
        AND kind IN ('REFUND', 'ROLLBACK')
        AND reference_transaction_id IS NOT NULL;
    `);

    // 3. Financial Ledger
    this.addSql(`
      CREATE TABLE wallet_ledger_entries (
        id uuid PRIMARY KEY,
        wallet_id uuid NOT NULL
          REFERENCES wallets(id) ON DELETE RESTRICT,
        transaction_id uuid NOT NULL
          REFERENCES wager_transactions(id) ON DELETE RESTRICT,
        direction varchar(6) NOT NULL,
        amount numeric(20,2) NOT NULL,
        currency varchar(3) NOT NULL,
        balance_before numeric(20,2) NOT NULL,
        balance_after numeric(20,2) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT uq_ledger_wallet_transaction
          UNIQUE (wallet_id, transaction_id),

        CONSTRAINT uq_ledger_transaction
          UNIQUE (transaction_id),

        CONSTRAINT chk_ledger_direction
          CHECK (direction IN ('DEBIT','CREDIT')),

        CONSTRAINT chk_ledger_amount
          CHECK (amount > 0),

        CONSTRAINT chk_ledger_balances
          CHECK (
            balance_before >= 0
            AND balance_after >= 0
          ),

        CONSTRAINT chk_ledger_currency
          CHECK (currency ~ '^[A-Z]{3}$'),

        CONSTRAINT chk_ledger_arithmetic
          CHECK (
            (
              direction = 'DEBIT'
              AND balance_after = balance_before - amount
            )
            OR
            (
              direction = 'CREDIT'
              AND balance_after = balance_before + amount
            )
          )
      );
    `);

    this.addSql(`
      CREATE INDEX idx_ledger_wallet_cursor
      ON wallet_ledger_entries (wallet_id, created_at, id);
    `);

    // Impede UPDATE e DELETE no ledger
    this.addSql(`
      CREATE FUNCTION prevent_ledger_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION
          'wallet_ledger_entries is append-only';
      END;
      $$;
    `);

    this.addSql(`
      CREATE TRIGGER trg_prevent_ledger_mutation
      BEFORE UPDATE OR DELETE
      ON wallet_ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION prevent_ledger_mutation();
    `);

    // 4. Inbox
    this.addSql(`
      CREATE TABLE inbox_messages (
        consumer_name varchar(128) NOT NULL,
        message_id varchar(255) NOT NULL,
        payload_hash varchar(64) NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,

        PRIMARY KEY (consumer_name, message_id),

        CONSTRAINT chk_inbox_hash
          CHECK (payload_hash ~ '^[a-f0-9]{64}$')
      );
    `);

    // 5. Outbox
    this.addSql(`
      CREATE TABLE outbox_messages (
        id uuid PRIMARY KEY,
        aggregate_id uuid NOT NULL,
        event_type varchar(128) NOT NULL,
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        attempts integer NOT NULL DEFAULT 0,
        next_attempt_at timestamptz,
        published_at timestamptz,
        claim_owner varchar(128),
        claim_until timestamptz,

        CONSTRAINT chk_outbox_attempts
          CHECK (attempts >= 0),

        CONSTRAINT chk_outbox_payload
          CHECK (jsonb_typeof(payload) = 'object')
      );
    `);

    this.addSql(`
      CREATE INDEX idx_outbox_due
      ON outbox_messages (next_attempt_at, occurred_at)
      WHERE published_at IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('DROP TABLE IF EXISTS outbox_messages;');
    this.addSql('DROP TABLE IF EXISTS inbox_messages;');
    this.addSql('DROP TRIGGER IF EXISTS trg_prevent_ledger_mutation ON wallet_ledger_entries;');
    this.addSql('DROP FUNCTION IF EXISTS prevent_ledger_mutation();');
    this.addSql('DROP TABLE IF EXISTS wallet_ledger_entries;');
    this.addSql('DROP TABLE IF EXISTS wager_transactions;');
    this.addSql('DROP TABLE IF EXISTS wallets;');
  }
}
