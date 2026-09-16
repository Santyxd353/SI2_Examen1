import 'dotenv/config';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app';
let app: INestApplication;
let token: string;
let cookies: string[];
const correo = `prueba-${Date.now()}@grupo18.test`;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  process.env.DATABASE_URL = url.toString();
  app = await createApp();
});
afterAll(async () => {
  await app.close();
});
test('registro público asigna Cliente y protege la contraseña', async () => {
  const r = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ nombres: 'Ana', apellidos: 'Prueba', correo, clave: 'PruebaSegura2026!' });
  expect(r.status).toBe(201);
  expect(r.body.user.roles).toEqual(['Cliente']);
  expect(r.body.user.clave_hash).toBeUndefined();
  token = r.body.accessToken;
  cookies = r.headers['set-cookie'] as unknown as string[];
});
test('rechaza elevación de rol en registro público', async () => {
  const r = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      nombres: 'Ana',
      apellidos: 'Prueba',
      correo: 'rol-' + correo,
      clave: 'PruebaSegura2026!',
      roles: ['Administrador'],
    });
  expect(r.status).toBe(400);
});
test('rechaza contraseñas que bcrypt truncaría al superar 72 bytes UTF-8', async () => {
  const r = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ nombres: 'Ana', apellidos: 'Prueba', correo: 'utf8-' + correo, clave: 'á'.repeat(40) });
  expect(r.status).toBe(400);
});
test('normaliza el correo y bloquea un duplicado', async () => {
  const r = await request(app.getHttpServer()).post('/api/auth/register').send({
    nombres: 'Ana',
    apellidos: 'Prueba',
    correo: correo.toUpperCase(),
    clave: 'PruebaSegura2026!',
  });
  expect(r.status).toBe(409);
});
test('no permite una contraseña incorrecta', async () => {
  const r = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo, clave: 'Incorrecta!2026' });
  expect(r.status).toBe(401);
});
test('perfil exige sesión válida y devuelve solo al propietario', async () => {
  expect((await request(app.getHttpServer()).get('/api/auth/me')).status).toBe(401);
  const r = await request(app.getHttpServer()).get('/api/auth/me').auth(token, { type: 'bearer' });
  expect(r.status).toBe(200);
  expect(r.body.correo).toBe(correo);
});
test('renovación es de un solo uso y revoca el token anterior', async () => {
  const r = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookies);
  expect(r.status).toBe(201);
  expect(
    (await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookies)).status,
  ).toBe(401);
  expect(
    (await request(app.getHttpServer()).get('/api/auth/me').auth(token, { type: 'bearer' })).status,
  ).toBe(401);
  token = r.body.accessToken;
  cookies = r.headers['set-cookie'] as unknown as string[];
});
test('un cliente no puede publicar catálogo', async () => {
  const r = await request(app.getHttpServer())
    .post('/api/catalog')
    .auth(token, { type: 'bearer' })
    .send({});
  expect(r.status).toBe(403);
});
test('catálogo devuelve precios y disponibilidad persistidos', async () => {
  const r = await request(app.getHttpServer()).get('/api/catalog');
  expect(r.status).toBe(200);
  expect(r.body.products.length).toBeGreaterThan(0);
  expect(r.body.products[0].variantes[0].precio).toBeGreaterThan(0);
  expect(r.body.products[0].variantes[0].disponible).toBeGreaterThanOrEqual(0);
});
test('captura rechaza falta de fotos o consentimiento', async () => {
  const r = await request(app.getHttpServer())
    .post('/api/avatars')
    .auth(token, { type: 'bearer' })
    .field('altura', '170');
  expect(r.status).toBe(400);
});
test('un identificador inexistente no permite abrir ni aprobar un avatar', async () => {
  const id = '00000000-0000-4000-8000-000000000000';
  expect(
    (
      await request(app.getHttpServer())
        .get('/api/avatars/' + id + '/model')
        .auth(token, { type: 'bearer' })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app.getHttpServer())
        .post('/api/avatars/' + id + '/approve')
        .auth(token, { type: 'bearer' })
    ).status,
  ).toBe(404);
});
test('cerrar sesión revoca inmediatamente el acceso', async () => {
  expect(
    (await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookies)).status,
  ).toBe(201);
  expect(
    (await request(app.getHttpServer()).get('/api/auth/me').auth(token, { type: 'bearer' })).status,
  ).toBe(401);
});
test('logout con la cookie previa revoca también una renovación que acaba de terminar', async () => {
  const registration = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      nombres: 'Carrera',
      apellidos: 'Sesión',
      correo: 'race-' + correo,
      clave: 'PruebaSegura2026!',
    });
  const oldCookie = registration.headers['set-cookie'] as unknown as string[];
  const renewed = await request(app.getHttpServer())
    .post('/api/auth/refresh')
    .set('Cookie', oldCookie);
  expect(renewed.status).toBe(201);
  // The logout request was prepared before the refresh Set-Cookie arrived.
  expect(
    (await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', oldCookie)).status,
  ).toBe(201);
  expect(
    (
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .auth(renewed.body.accessToken, { type: 'bearer' })
    ).status,
  ).toBe(401);
  expect(
    (
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', renewed.headers['set-cookie'] as unknown as string[])
    ).status,
  ).toBe(401);
});
