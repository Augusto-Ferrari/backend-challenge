import { MikroORM } from '@mikro-orm/postgresql';
import ormConfig from '../mikro-orm.config.js';

async function main(): Promise<void> {
  const orm = await MikroORM.init(ormConfig);

  try {
    const rows = await orm.em.getConnection().execute<
      Array<{ tablename: string }>
    >(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN (
          'wallets',
          'wager_transactions',
          'wallet_ledger_entries',
          'inbox_messages',
          'outbox_messages'
        )
      ORDER BY tablename
    `);

    const tables = rows.map(row => row.tablename);

    for (const table of tables) {
      console.log('[OK]', table);
    }

    if (tables.length !== 5) {
      throw new Error(
        `Esperadas 5 tabelas, encontradas ${tables.length}`
      );
    }

    const triggers = await orm.em.getConnection().execute<
      Array<{ exists: boolean }>
    >(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_prevent_ledger_mutation'
          AND NOT tgisinternal
      ) AS exists
    `);

    if (!triggers[0]?.exists) {
      throw new Error(
        'Trigger de imutabilidade do ledger não encontrado'
      );
    }

    console.log('[OK] Trigger do ledger');
    console.log('Banco de dados validado com sucesso!');
  } finally {
    await orm.close(true);
  }
}

main().catch(error => {
  console.error('Erro na verificação:', error);
  process.exitCode = 1;
});
