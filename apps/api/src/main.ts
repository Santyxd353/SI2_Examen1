import 'dotenv/config';
import { createApp } from './app';
import { AvatarJobs } from './avatar-jobs';
async function main() {
  const app = await createApp();
  app.get(AvatarJobs).start();
  await app.listen(Number(process.env.API_PORT || 3018), '127.0.0.1');
  console.log('API Grupo 18: http://localhost:3018');
}
void main();
