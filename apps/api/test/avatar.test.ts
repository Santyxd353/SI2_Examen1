import 'dotenv/config';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { copyFile, mkdir, access, readFile } from 'fs/promises';
import { resolve } from 'path';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app';
import { Db } from '../src/db';
import { AvatarJobs } from '../src/avatar-jobs';
import { storedPath } from '../src/storage';

let app: INestApplication, db: Db, jobs: AvatarJobs, owner: any, stranger: any, templateId: string;
async function register() {
  const r = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      nombres: 'Prueba',
      apellidos: 'Privacidad',
      correo: randomUUID() + '@grupo18.test',
      clave: 'PruebaSegura2026!',
    });
  expect(r.status).toBe(201);
  return r.body;
}
async function avatar() {
  const id = randomUUID(),
    key = 'private/fixtures/' + id + '.glb';
  await mkdir(storedPath('private/fixtures'), { recursive: true });
  await copyFile(resolve('.local/storage/public/reference.glb'), storedPath(key));
  const max = await db.avatar.aggregate({
    where: { usuario_id: owner.user.id },
    _max: { version: true },
  });
  return db.avatar.create({
    data: {
      id,
      usuario_id: owner.user.id,
      plantilla_id: templateId,
      version: (max._max.version || 0) + 1,
      estado: 'EN_REVISION',
      clave_glb: key,
      medidas: { altura: { valor_cm: 170 } },
      parametros_malla: { height: 1.7 },
      creado_en: new Date(),
    },
  });
}
function upload(idempotencia = randomUUID()) {
  // Three identical, structurally valid images: must be rejected by the real worker.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  );
  return request(app.getHttpServer())
    .post('/api/avatars')
    .auth(owner.accessToken, { type: 'bearer' })
    .field('altura', '170')
    .field('consentimiento', 'true')
    .field('adulto', 'true')
    .field('idempotencia', idempotencia)
    .attach('frente', png, { filename: 'frente.png', contentType: 'image/png' })
    .attach('perfil', png, { filename: 'perfil.png', contentType: 'image/png' })
    .attach('espalda', png, { filename: 'espalda.png', contentType: 'image/png' });
}
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  process.env.DATABASE_URL = url.toString();
  process.env.STORAGE_ROOT = '.local/test-storage';
  app = await createApp();
  db = app.get(Db);
  jobs = app.get(AvatarJobs);
  while (await db.trabajo_avatar.count({ where: { estado: 'EN_COLA' } })) await jobs.tick();
  owner = await register();
  stranger = await register();
  templateId = (await db.plantilla_corporal.findFirstOrThrow()).id;
});
afterEach(async () => {
  while (await db.trabajo_avatar.count({ where: { estado: 'EN_COLA' } })) await jobs.tick();
});
afterAll(async () => {
  await app.close();
});
test('un avatar existente es privado incluso con su identificador exacto', async () => {
  const a = await avatar();
  const own = await request(app.getHttpServer())
    .get(`/api/avatars/${a.id}/model`)
    .auth(owner.accessToken, { type: 'bearer' });
  expect(own.status).toBe(200);
  expect(own.headers['cache-control']).toContain('no-store');
  for (const [method, url] of [
    ['get', `/api/avatars/${a.id}/model`],
    ['post', `/api/avatars/${a.id}/approve`],
    ['delete', `/api/avatars/${a.id}`],
  ] as const) {
    expect(
      (
        await request(app.getHttpServer())
          [method](url)
          .auth(stranger.accessToken, { type: 'bearer' })
      ).status,
    ).toBe(404);
  }
  const list = await request(app.getHttpServer())
    .get('/api/avatars')
    .auth(stranger.accessToken, { type: 'bearer' });
  expect(list.body.avatars).toEqual([]);
  expect(
    (await request(app.getHttpServer()).get('/assets/../private/fixtures/' + a.id + '.glb')).status,
  ).toBe(404);
});
test('aprobar una versión sustituye la anterior y conserva solo una aprobada', async () => {
  const first = await avatar(),
    second = await avatar();
  for (const a of [first, second])
    expect(
      (
        await request(app.getHttpServer())
          .post(`/api/avatars/${a.id}/approve`)
          .auth(owner.accessToken, { type: 'bearer' })
      ).status,
    ).toBe(201);
  expect((await db.avatar.findUniqueOrThrow({ where: { id: first.id } })).estado).toBe(
    'SUSTITUIDO',
  );
  expect(await db.avatar.count({ where: { usuario_id: owner.user.id, estado: 'APROBADO' } })).toBe(
    1,
  );
});
test('borrar revoca acceso inmediato y purga GLB y medidas antes de confirmar ELIMINADO', async () => {
  const a = await avatar();
  expect(
    (
      await request(app.getHttpServer())
        .delete(`/api/avatars/${a.id}`)
        .auth(owner.accessToken, { type: 'bearer' })
    ).body.estado,
  ).toBe('ELIMINANDO');
  expect(
    (
      await request(app.getHttpServer())
        .get(`/api/avatars/${a.id}/model`)
        .auth(owner.accessToken, { type: 'bearer' })
    ).status,
  ).toBe(404);
  await jobs.tick();
  const deleted = await db.avatar.findUniqueOrThrow({ where: { id: a.id } });
  expect(deleted).toMatchObject({
    estado: 'ELIMINADO',
    clave_glb: null,
    medidas: null,
    parametros_malla: null,
  });
  await expect(access(storedPath(a.clave_glb!))).rejects.toThrow();
});
test('solo admite un trabajo activo por propietario, incluso ante solicitudes simultáneas', async () => {
  const results = await Promise.all([upload(), upload()]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  await jobs.tick();
});
test('reintento idempotente no duplica fotos y un fallo real purga todas las entradas', async () => {
  const key = randomUUID(),
    first = await upload(key),
    again = await upload(key);
  expect(first.status).toBe(201);
  expect(again.body.id).toBe(first.body.id);
  const job = await db.trabajo_avatar.findUniqueOrThrow({ where: { id: first.body.id } });
  const photos = await db.foto_temporal.findMany({ where: { captura_id: job.captura_id! } });
  expect(photos).toHaveLength(3);
  await jobs.tick();
  expect(await db.trabajo_avatar.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
    estado: 'FALLIDO',
    error_codigo: 'VISTAS_REPETIDAS',
    avatar_id: null,
  });
  const capture = await db.captura_corporal.findUniqueOrThrow({ where: { id: job.captura_id! } });
  expect(capture).toMatchObject({ estado: 'PURGADA', altura_cm: null });
  expect(capture.purgada_en).not.toBeNull();
  for (const p of photos) await expect(access(storedPath(p.clave_objeto!))).rejects.toThrow();
  expect(
    await db.foto_temporal.count({
      where: { captura_id: capture.id, clave_objeto: { not: null } },
    }),
  ).toBe(0);
  await expect(readFile(storedPath('private/jobs/' + job.id + '/input.json'))).rejects.toThrow();
});
test('reintentos simultáneos de prueba de prenda registran un único evento y rechazan otra carga', async () => {
  const a = await avatar();
  await request(app.getHttpServer())
    .post(`/api/avatars/${a.id}/approve`)
    .auth(owner.accessToken, { type: 'bearer' });
  const session = await request(app.getHttpServer())
    .post('/api/fitting')
    .auth(owner.accessToken, { type: 'bearer' })
    .send({ avatarId: a.id });
  expect(session.status).toBe(201);
  const models = await db.modelo_prenda.findMany({ where: { estado: 'PUBLICADO' }, take: 2 });
  const eventId = randomUUID();
  const send = (modelId: string) =>
    request(app.getHttpServer())
      .post(`/api/fitting/${session.body.id}/try`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ modeloId: modelId, eventoId: eventId });
  const responses = await Promise.all(Array.from({ length: 8 }, () => send(models[0].id)));
  expect(responses.map((r) => r.status)).toEqual(Array(8).fill(201));
  expect(await db.evento_vestidor.count({ where: { evento_cliente: eventId } })).toBe(1);
  expect((await send(models[1].id)).status).toBe(400);
});
