import 'dotenv/config';
import request from 'supertest';
import { io } from 'socket.io-client';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AddressInfo } from 'net';
import { createApp } from '../src/app';

let app: INestApplication;
let db: PrismaClient;
let baseUrl: string;
let correo: string;
let accessToken: string;
let refreshToken: string;
const stamp = Date.now();

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  process.env.DATABASE_URL = url.toString();
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  app = await createApp();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  correo = `mobile-${stamp}@grupo18.test`;
  await request(app.getHttpServer()).post('/api/auth/register').send({
    nombres: 'Cliente',
    apellidos: 'Móvil',
    correo,
    clave: 'MovilSeguro2026!',
  });
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

test('login móvil entrega tokens y permite renovar la sesión una sola vez', async () => {
  const login = await request(app.getHttpServer())
    .post('/api/auth/mobile/login')
    .send({ correo, clave: 'MovilSeguro2026!' });
  expect(login.status).toBe(201);
  expect(login.body.user.correo).toBe(correo);
  expect(login.body.accessToken).toEqual(expect.any(String));
  expect(login.body.refreshToken).toEqual(expect.any(String));
  accessToken = login.body.accessToken;
  refreshToken = login.body.refreshToken;

  const renewed = await request(app.getHttpServer())
    .post('/api/auth/mobile/refresh')
    .send({ refreshToken });
  expect(renewed.status).toBe(201);
  expect(renewed.body.refreshToken).not.toBe(refreshToken);
  expect(
    (await request(app.getHttpServer()).get('/api/auth/me').auth(accessToken, { type: 'bearer' }))
      .status,
  ).toBe(401);
  expect(
    (await request(app.getHttpServer()).post('/api/auth/mobile/refresh').send({ refreshToken }))
      .status,
  ).toBe(401);
  accessToken = renewed.body.accessToken;
  refreshToken = renewed.body.refreshToken;
});

test('WebSocket autentica y permite suscribirse a una ubicación activa', async () => {
  const location = await db.ubicacion.findFirstOrThrow({ where: { activa: true } });
  const socket = io(`${baseUrl}/realtime`, {
    transports: ['websocket'],
    auth: { token: accessToken },
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket no respondió.')), 5000);
    socket.once('realtime:ready', () => {
      socket.emit('inventory:subscribe', { locationId: location.id }, (response: unknown) => {
        clearTimeout(timeout);
        expect(response).toMatchObject({ ok: true, locationId: location.id });
        resolve();
      });
    });
    socket.once('connect_error', reject);
  });
  socket.disconnect();
});

test('logout móvil revoca el token de renovación', async () => {
  const logout = await request(app.getHttpServer())
    .post('/api/auth/mobile/logout')
    .send({ refreshToken });
  expect(logout.status).toBe(201);
  expect(
    (await request(app.getHttpServer()).post('/api/auth/mobile/refresh').send({ refreshToken }))
      .status,
  ).toBe(401);
});
