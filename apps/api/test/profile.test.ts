import 'dotenv/config';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

let app: INestApplication;
let db: PrismaClient;
let token: string;
let otherToken: string;
const stamp = Date.now();

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  process.env.DATABASE_URL = url.toString();
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  app = await createApp();
  const first = await request(app.getHttpServer())
    .post('/api/auth/mobile/register')
    .send({
      nombres: 'Perfil',
      apellidos: 'Principal',
      correo: `perfil-${stamp}@grupo18.test`,
      clave: 'PerfilSeguro2026!',
    });
  const other = await request(app.getHttpServer())
    .post('/api/auth/mobile/register')
    .send({
      nombres: 'Otro',
      apellidos: 'Cliente',
      correo: `perfil-otro-${stamp}@grupo18.test`,
      clave: 'PerfilSeguro2026!',
    });
  token = first.body.accessToken;
  otherToken = other.body.accessToken;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

test('el cliente actualiza su perfil y administra direcciones propias', async () => {
  const updated = await request(app.getHttpServer())
    .patch('/api/profile')
    .auth(token, { type: 'bearer' })
    .send({ nombres: 'Perfil Editado', telefono: '+591 70000001', push: true });
  expect(updated.status).toBe(200);
  expect(updated.body.nombres).toBe('Perfil Editado');
  expect(updated.body.telefono).toBe('+591 70000001');
  expect(updated.body.preferencias).toMatchObject({ push: true });
  expect(updated.body.identity.nombres).toBe('Perfil Editado');

  const home = await request(app.getHttpServer())
    .post('/api/profile/addresses')
    .auth(token, { type: 'bearer' })
    .send({
      alias: 'Casa',
      destinatario: 'Perfil Editado Principal',
      telefono: '+591 70000001',
      ciudad: 'La Paz',
      zona: 'Sopocachi',
      detalle: 'Calle de prueba número 123',
      predeterminada: false,
    });
  expect(home.status).toBe(201);
  expect(home.body.direccion).toHaveLength(1);
  expect(home.body.direccion[0].predeterminada).toBe(true);
  const homeId = home.body.direccion[0].id as string;

  const work = await request(app.getHttpServer())
    .post('/api/profile/addresses')
    .auth(token, { type: 'bearer' })
    .send({
      alias: 'Trabajo',
      destinatario: 'Perfil Editado Principal',
      telefono: '+591 70000001',
      ciudad: 'La Paz',
      zona: 'Centro',
      detalle: 'Avenida de prueba número 456',
      predeterminada: true,
    });
  expect(work.status).toBe(201);
  expect(work.body.direccion[0].alias).toBe('Trabajo');
  expect(work.body.direccion[0].predeterminada).toBe(true);
  expect(work.body.direccion.find((row: { id: string }) => row.id === homeId).predeterminada).toBe(
    false,
  );
  const workId = work.body.direccion[0].id as string;

  const forbidden = await request(app.getHttpServer())
    .patch(`/api/profile/addresses/${workId}`)
    .auth(otherToken, { type: 'bearer' })
    .send({ alias: 'Ajena' });
  expect(forbidden.status).toBe(404);

  const removed = await request(app.getHttpServer())
    .delete(`/api/profile/addresses/${workId}`)
    .auth(token, { type: 'bearer' });
  expect(removed.status).toBe(200);
  expect(removed.body.direccion).toHaveLength(1);
  expect(removed.body.direccion[0].id).toBe(homeId);
  expect(removed.body.direccion[0].predeterminada).toBe(true);

  const auditCount = await db.auditoria.count({
    where: { actor_id: updated.body.id, entidad: { in: ['usuario', 'direccion'] } },
  });
  expect(auditCount).toBeGreaterThanOrEqual(4);
});
