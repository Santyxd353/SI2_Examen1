require('dotenv/config');
const { Client } = require('pg');
(async () => {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.port !== '55418' || url.pathname !== '/vestidor18')
    throw Error('Solo se permiten las bases locales del proyecto.');
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    for (const name of ['vestidor18', 'vestidor18_test']) {
      const r = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [name]);
      if (!r.rowCount) await client.query('CREATE DATABASE "' + name + '"');
    }
    console.log('Bases locales disponibles.');
  } finally {
    await client.end();
  }
})().catch(() => {
  console.error(
    'No se pudieron preparar las bases locales. Verifica la configuración de PostgreSQL.',
  );
  process.exitCode = 1;
});
