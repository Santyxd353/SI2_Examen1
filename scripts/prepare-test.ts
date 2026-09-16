import 'dotenv/config';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { seed } from './seed';
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const exists = await client.query("SELECT to_regclass('public.usuario') AS name");
  if (!exists.rows[0].name)
    await client.query(readFileSync('prisma/documented-schema.sql', 'utf8'));
  await client.end();
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  await seed(db);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
