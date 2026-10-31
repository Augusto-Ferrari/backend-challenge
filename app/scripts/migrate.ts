import { MikroORM } from '@mikro-orm/postgresql';
import ormConfig from '../mikro-orm.config.js';

type Action = 'up' | 'status' | 'down';

async function main(): Promise<void> {
  const action = (process.argv[2] ?? 'status') as Action;

  if (!['up', 'status', 'down'].includes(action)) {
    throw new Error(
      'Use: bun scripts/migrate.ts up | status | down'
    );
  }

  if (action === 'down' && !process.argv.includes('--confirm-drop')) {
    throw new Error(
      'O comando down apaga tabelas. Use --confirm-drop somente em banco de teste.'
    );
  }

  const orm = await MikroORM.init(ormConfig);

  try {
    if (action === 'up') {
      const applied = await orm.migrator.up();

      console.log('Migrations aplicadas:', applied.length);
    }

    if (action === 'status') {
      const executed = await orm.migrator.getExecuted();
      const pending = await orm.migrator.getPending();

      console.log(
        'Executadas:',
        executed.map(item => item.name)
      );

      console.log(
        'Pendentes:',
        pending.map(item => item.name)
      );
    }

    if (action === 'down') {
      const undone = await orm.migrator.down();

      console.log('Migrations revertidas:', undone.length);
    }
  } finally {
    await orm.close(true);
  }
}

main().catch(error => {
  console.error('Erro na migration:', error);
  process.exitCode = 1;
});
