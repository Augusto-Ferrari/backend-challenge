import 'dotenv/config';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { WalletSchema, WagerTransactionSchema, WalletLedgerEntrySchema, InboxMessageSchema, OutboxMessageSchema, } from './infrastructure/persistence/records.js';
import { Migration20261031000000 } from './migrations/Migration20261031000000.js';
export default defineConfig({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? '5432'),
    user: process.env.DB_USER ?? 'wagering',
    password: process.env.DB_PASSWORD ?? '',
    dbName: process.env.DB_NAME ?? 'wagering',
    entities: [
        WalletSchema,
        WagerTransactionSchema,
        WalletLedgerEntrySchema,
        InboxMessageSchema,
        OutboxMessageSchema,
    ],
    extensions: [Migrator],
    migrations: {
        migrationsList: [Migration20261031000000],
        transactional: true,
        allOrNothing: true,
    },
});
//# sourceMappingURL=mikro-orm.config.js.map