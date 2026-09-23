import request from 'supertest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app';

const webRoot = resolve('.local/test-production-web');
let app: INestApplication;
const previous = {
  serveWeb: process.env.SERVE_WEB,
  webRoot: process.env.WEB_ROOT,
  jwtSecret: process.env.JWT_SECRET,
};

beforeAll(async () => {
  await rm(webRoot, { recursive: true, force: true });
  await mkdir(resolve(webRoot, 'assets'), { recursive: true });
  await writeFile(resolve(webRoot, 'index.html'), '<!doctype html><h1>Vestidor Grupo 18</h1>');
  await writeFile(resolve(webRoot, 'assets', 'app.js'), 'window.vestidor = true;');
  process.env.SERVE_WEB = 'true';
  process.env.WEB_ROOT = webRoot;
  process.env.JWT_SECRET = 'x'.repeat(64);
  app = await createApp();
});

afterAll(async () => {
  await app.close();
  await rm(webRoot, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previous)) {
    const envKey = key === 'serveWeb' ? 'SERVE_WEB' : key === 'webRoot' ? 'WEB_ROOT' : 'JWT_SECRET';
    if (value === undefined) delete process.env[envKey];
    else process.env[envKey] = value;
  }
});

test('sirve la aplicación web y sus recursos desde el API en producción', async () => {
  const home = await request(app.getHttpServer()).get('/');
  expect(home.status).toBe(200);
  expect(home.text).toContain('Vestidor Grupo 18');

  const asset = await request(app.getHttpServer()).get('/assets/app.js');
  expect(asset.status).toBe(200);
  expect(asset.text).toContain('window.vestidor');
});

test('recarga rutas SPA sin ocultar rutas API inexistentes', async () => {
  const spa = await request(app.getHttpServer()).get('/catalogo');
  expect(spa.status).toBe(200);
  expect(spa.text).toContain('Vestidor Grupo 18');

  const missingApi = await request(app.getHttpServer()).get('/api/no-existe');
  expect(missingApi.status).toBe(404);
  expect(missingApi.type).toMatch(/json/);
});
