import 'dotenv/config';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';
import { removeStored } from '../src/storage';

let app: INestApplication;
let db: PrismaClient;
let adminToken: string;
let variantId: string;
let resourceId: string | undefined;
let adminId: string;
const stamp = Date.now();
const previousStorageRoot = process.env.STORAGE_ROOT;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  process.env.DATABASE_URL = url.toString();
  process.env.STORAGE_ROOT = '.local/test-storage';
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  variantId = (await db.variante.findFirstOrThrow({ where: { sku: 'G18-1-S' } })).id;
  const role = await db.rol.findUniqueOrThrow({ where: { nombre: 'Administrador' } });
  const admin = await db.usuario.create({
    data: {
      nombres: 'Admin',
      apellidos: 'AR',
      correo: `admin-ar-${stamp}@grupo18.test`,
      clave_hash: await hash('PruebaSegura2026!', 12),
      estado: 'ACTIVO',
      preferencias: {},
      creado_en: new Date(),
      usuario_rol: { create: { rol_id: role.id, asignado_en: new Date() } },
    },
  });
  adminId = admin.id;
  app = await createApp();
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo: admin.correo, clave: 'PruebaSegura2026!' });
  adminToken = login.body.accessToken;
});

afterAll(async () => {
  if (resourceId) {
    const resource = await db.recurso_catalogo.findUnique({ where: { id: resourceId } });
    await db.recurso_catalogo.delete({ where: { id: resourceId } });
    if (resource) await removeStored(resource.clave_objeto);
  }
  if (adminId) {
    await db.sesion.deleteMany({ where: { usuario_id: adminId } });
    await db.usuario_rol.deleteMany({ where: { usuario_id: adminId } });
    await db.usuario.delete({ where: { id: adminId } });
  }
  await app?.close();
  await db?.$disconnect();
  if (previousStorageRoot === undefined) delete process.env.STORAGE_ROOT;
  else process.env.STORAGE_ROOT = previousStorageRoot;
});

test('imagen AR se carga como borrador y solo aparece en catálogo al publicarse', async () => {
  const anonymous = await request(app.getHttpServer()).get('/api/catalog/ar-resources');
  expect(anonymous.status).toBe(401);
  const invalid = await request(app.getHttpServer())
    .post('/api/catalog/ar-resources')
    .auth(adminToken, { type: 'bearer' })
    .field('varianteId', variantId)
    .field('textoAlternativo', 'Camiseta marfil vista de frente')
    .field('licencia', 'Muestra propia de prueba')
    .attach('imagen', Buffer.from('contenido no PNG'), 'imagen.png');
  expect(invalid.status).toBe(400);

  const upload = await request(app.getHttpServer())
    .post('/api/catalog/ar-resources')
    .auth(adminToken, { type: 'bearer' })
    .field('varianteId', variantId)
    .field('textoAlternativo', 'Camiseta marfil vista de frente')
    .field('licencia', 'Muestra propia de prueba')
    .attach('imagen', 'apps/mobile/assets/camiseta-marfil-muestra.png');
  expect(upload.status).toBe(201);
  expect(upload.body.estado).toBe('BORRADOR');
  resourceId = upload.body.id;

  const findImage = async () => {
    const catalog = await request(app.getHttpServer()).get('/api/catalog');
    expect(catalog.status).toBe(200);
    return catalog.body.products
      .find((product: { id: string }) => product.id === '20000000-0000-4000-8000-000000000001')
      .variantes.find((variant: { id: string }) => variant.id === variantId).arImagePath;
  };
  expect(await findImage()).toBeNull();

  const publish = await request(app.getHttpServer())
    .patch(`/api/catalog/ar-resources/${resourceId}`)
    .auth(adminToken, { type: 'bearer' })
    .send({ estado: 'PUBLICADO' });
  expect(publish.status).toBe(200);
  const path = await findImage();
  expect(path).toMatch(/^\/assets\/catalog-ar\/.+\.png$/);
  const image = await request(app.getHttpServer()).get(path);
  expect(image.status).toBe(200);
  expect(image.headers['content-type']).toMatch(/image\/png/);

  const withdraw = await request(app.getHttpServer())
    .patch(`/api/catalog/ar-resources/${resourceId}`)
    .auth(adminToken, { type: 'bearer' })
    .send({ estado: 'BORRADOR' });
  expect(withdraw.status).toBe(200);
  expect(await findImage()).toBeNull();
});
