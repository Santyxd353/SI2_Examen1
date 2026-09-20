import 'dotenv/config';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

let app: INestApplication;
let db: PrismaClient;
let adminToken: string;
let sellerToken: string;
let locationId: string;
let otherLocationId: string;
let variantId: string;
const stamp = Date.now();
const sellerEmail = `vendedor-${stamp}@grupo18.test`;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  process.env.DATABASE_URL = url.toString();
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const adminRole = await db.rol.findUniqueOrThrow({ where: { nombre: 'Administrador' } });
  const admin = await db.usuario.create({
    data: {
      nombres: 'Administrador',
      apellidos: 'Ubicaciones',
      correo: `admin-${stamp}@grupo18.test`,
      clave_hash: await hash('Administracion2026!', 12),
      estado: 'ACTIVO',
      preferencias: {},
      creado_en: new Date(),
      usuario_rol: { create: { rol_id: adminRole.id, asignado_en: new Date() } },
    },
  });
  variantId = (await db.variante.findFirstOrThrow()).id;
  app = await createApp();
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo: admin.correo, clave: 'Administracion2026!' });
  adminToken = login.body.accessToken;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

test('administrador crea una sucursal y un almacén', async () => {
  const branch = await request(app.getHttpServer())
    .post('/api/locations')
    .auth(adminToken, { type: 'bearer' })
    .send({ nombre: `Sucursal ${stamp}`, tipo: 'TIENDA', direccion: 'Av. Principal 123' });
  expect(branch.status).toBe(201);
  expect(branch.body.tipo).toBe('TIENDA');
  locationId = branch.body.id;

  const warehouse = await request(app.getHttpServer())
    .post('/api/locations')
    .auth(adminToken, { type: 'bearer' })
    .send({ nombre: `Almacén ${stamp}`, tipo: 'ALMACEN', direccion: 'Parque Industrial 45' });
  expect(warehouse.status).toBe(201);
  otherLocationId = warehouse.body.id;
});

test('crea vendedor y lo asigna únicamente a su sucursal', async () => {
  const created = await request(app.getHttpServer())
    .post('/api/staff')
    .auth(adminToken, { type: 'bearer' })
    .send({
      nombres: 'Venta',
      apellidos: 'Sucursal',
      correo: sellerEmail,
      clave: 'VendedorSeguro2026!',
      rol: 'Vendedor',
      ubicaciones: [locationId],
    });
  expect(created.status).toBe(201);
  expect(created.body.rol).toBe('Vendedor');

  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo: sellerEmail, clave: 'VendedorSeguro2026!' });
  expect(login.status).toBe(201);
  sellerToken = login.body.accessToken;
  expect(login.body.user.permissions).toContain('inventario:gestionar');

  const locations = await request(app.getHttpServer())
    .get('/api/locations')
    .auth(sellerToken, { type: 'bearer' });
  expect(locations.status).toBe(200);
  expect(locations.body.map((item: { id: string }) => item.id)).toEqual([locationId]);
  expect(
    (
      await request(app.getHttpServer())
        .get(`/api/locations/${otherLocationId}/inventory`)
        .auth(sellerToken, { type: 'bearer' })
    ).status,
  ).toBe(403);
});

test('ajuste de inventario se registra y aparece en el catálogo por sucursal', async () => {
  const adjustment = await request(app.getHttpServer())
    .post(`/api/locations/${locationId}/inventory/adjustments`)
    .auth(sellerToken, { type: 'bearer' })
    .send({ varianteId: variantId, delta: 7, motivo: 'Carga inicial de sucursal' });
  expect(adjustment.status).toBe(201);
  expect(adjustment.body.fisico).toBe(7);

  const catalog = await request(app.getHttpServer()).get('/api/catalog');
  expect(catalog.status).toBe(200);
  const variant = catalog.body.products
    .flatMap((product: { variantes: { id: string }[] }) => product.variantes)
    .find((item: { id: string }) => item.id === variantId);
  expect(variant.ubicaciones).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: locationId, tipo: 'TIENDA', disponible: 7 }),
    ]),
  );
});

test('transferencia es atómica, respeta el alcance y registra ambos movimientos', async () => {
  const forbidden = await request(app.getHttpServer())
    .post('/api/locations/transfers')
    .auth(sellerToken, { type: 'bearer' })
    .send({
      origenId: locationId,
      destinoId: otherLocationId,
      varianteId: variantId,
      cantidad: 3,
      motivo: 'Reposición del almacén',
    });
  expect(forbidden.status).toBe(403);

  const transfer = await request(app.getHttpServer())
    .post('/api/locations/transfers')
    .auth(adminToken, { type: 'bearer' })
    .send({
      origenId: locationId,
      destinoId: otherLocationId,
      varianteId: variantId,
      cantidad: 3,
      motivo: 'Reposición del almacén',
    });
  expect(transfer.status).toBe(201);
  expect(transfer.body.origen.fisico).toBe(4);
  expect(transfer.body.destino.fisico).toBe(3);

  const rejected = await request(app.getHttpServer())
    .post('/api/locations/transfers')
    .auth(adminToken, { type: 'bearer' })
    .send({
      origenId: locationId,
      destinoId: otherLocationId,
      varianteId: variantId,
      cantidad: 9999,
      motivo: 'Intento por encima del disponible',
    });
  expect(rejected.status).toBe(400);

  const originHistory = await request(app.getHttpServer())
    .get(`/api/locations/${locationId}/movements`)
    .auth(adminToken, { type: 'bearer' });
  const destinationHistory = await request(app.getHttpServer())
    .get(`/api/locations/${otherLocationId}/movements`)
    .auth(adminToken, { type: 'bearer' });
  expect(originHistory.status).toBe(200);
  expect(destinationHistory.status).toBe(200);
  expect(originHistory.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        grupoOperacion: transfer.body.grupoOperacion,
        deltaFisico: -3,
        contraparte: expect.objectContaining({ id: otherLocationId }),
      }),
    ]),
  );
  expect(destinationHistory.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        grupoOperacion: transfer.body.grupoOperacion,
        deltaFisico: 3,
        contraparte: expect.objectContaining({ id: locationId }),
      }),
    ]),
  );
});

test('administrador asigna y retira múltiples ubicaciones a personal existente', async () => {
  const seller = await db.usuario.findUniqueOrThrow({ where: { correo: sellerEmail } });
  const assigned = await request(app.getHttpServer())
    .post(`/api/locations/${otherLocationId}/assignments`)
    .auth(adminToken, { type: 'bearer' })
    .send({ usuarioId: seller.id });
  expect(assigned.status).toBe(201);

  const twoLocations = await request(app.getHttpServer())
    .get('/api/locations')
    .auth(sellerToken, { type: 'bearer' });
  expect(twoLocations.body.map((item: { id: string }) => item.id).sort()).toEqual(
    [locationId, otherLocationId].sort(),
  );

  const removed = await request(app.getHttpServer())
    .delete(`/api/locations/${otherLocationId}/assignments/${seller.id}`)
    .auth(adminToken, { type: 'bearer' });
  expect(removed.status).toBe(200);
  const oneLocation = await request(app.getHttpServer())
    .get('/api/locations')
    .auth(sellerToken, { type: 'bearer' });
  expect(oneLocation.body.map((item: { id: string }) => item.id)).toEqual([locationId]);
});

test('edita y desactiva una ubicación sin borrar su historial', async () => {
  const blocked = await request(app.getHttpServer())
    .patch(`/api/locations/${otherLocationId}`)
    .auth(adminToken, { type: 'bearer' })
    .send({ activa: false });
  expect(blocked.status).toBe(400);

  const emptied = await request(app.getHttpServer())
    .post('/api/locations/transfers')
    .auth(adminToken, { type: 'bearer' })
    .send({
      origenId: otherLocationId,
      destinoId: locationId,
      varianteId: variantId,
      cantidad: 3,
      motivo: 'Cierre controlado de ubicación',
    });
  expect(emptied.status).toBe(201);

  const updated = await request(app.getHttpServer())
    .patch(`/api/locations/${otherLocationId}`)
    .auth(adminToken, { type: 'bearer' })
    .send({ nombre: `Almacén editado ${stamp}`, direccion: 'Nueva dirección 789' });
  expect(updated.status).toBe(200);
  expect(updated.body.nombre).toContain('editado');

  const disabled = await request(app.getHttpServer())
    .patch(`/api/locations/${otherLocationId}`)
    .auth(adminToken, { type: 'bearer' })
    .send({ activa: false });
  expect(disabled.status).toBe(200);
  expect(disabled.body.activa).toBe(false);

  const history = await request(app.getHttpServer())
    .get(`/api/locations/${otherLocationId}/movements`)
    .auth(adminToken, { type: 'bearer' });
  expect(history.status).toBe(200);
  expect(history.body.length).toBeGreaterThanOrEqual(2);
});

test('detalle, conteo físico y alertas de stock mínimo quedan trazables', async () => {
  const detail = await request(app.getHttpServer())
    .get(`/api/locations/${locationId}/inventory`)
    .auth(adminToken, { type: 'bearer' });
  expect(detail.status).toBe(200);
  const row = detail.body.find((item: { variante_id: string }) => item.variante_id === variantId);
  expect(row).toMatchObject({
    fisico: 7,
    reservado: 0,
    comprometido: 0,
    disponible: 7,
  });

  const threshold = await request(app.getHttpServer())
    .patch(`/api/locations/${locationId}/inventory/${variantId}/threshold`)
    .auth(adminToken, { type: 'bearer' })
    .send({ stockSeguridad: 8, plazoReposicionDias: 4 });
  expect(threshold.status).toBe(200);
  expect(threshold.body).toMatchObject({ stock_seguridad: 8, alertaStock: true });

  const alerts = await request(app.getHttpServer())
    .get('/api/locations/inventory/alerts')
    .auth(sellerToken, { type: 'bearer' });
  expect(alerts.status).toBe(200);
  expect(alerts.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ubicacion_id: locationId,
        variante_id: variantId,
        disponible: 7,
        stock_seguridad: 8,
      }),
    ]),
  );
  expect(
    alerts.body.some((item: { ubicacion_id: string }) => item.ubicacion_id === otherLocationId),
  ).toBe(false);

  await db.inventario.update({
    where: { variante_id_ubicacion_id: { variante_id: variantId, ubicacion_id: locationId } },
    data: { reservado: 6 },
  });
  const invalidCount = await request(app.getHttpServer())
    .post(`/api/locations/${locationId}/inventory/counts`)
    .auth(sellerToken, { type: 'bearer' })
    .send({ varianteId: variantId, conteoObservado: 5, motivo: 'Conteo de control' });
  expect(invalidCount.status).toBe(400);
  await db.inventario.update({
    where: { variante_id_ubicacion_id: { variante_id: variantId, ubicacion_id: locationId } },
    data: { reservado: 0 },
  });

  const count = await request(app.getHttpServer())
    .post(`/api/locations/${locationId}/inventory/counts`)
    .auth(sellerToken, { type: 'bearer' })
    .send({ varianteId: variantId, conteoObservado: 5, motivo: 'Conteo de control' });
  expect(count.status).toBe(201);
  expect(count.body.fisico).toBe(5);

  const history = await request(app.getHttpServer())
    .get(`/api/locations/${locationId}/movements`)
    .auth(sellerToken, { type: 'bearer' });
  expect(history.body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ tipo: 'CONTEO', deltaFisico: -2, conteoObservado: 5 }),
    ]),
  );
});

test('un cliente no puede consultar ni modificar ubicaciones', async () => {
  const registration = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      nombres: 'Cliente',
      apellidos: 'Sin Acceso',
      correo: `cliente-ubicacion-${stamp}@grupo18.test`,
      clave: 'ClienteSeguro2026!',
    });
  expect(
    (
      await request(app.getHttpServer())
        .get('/api/locations')
        .auth(registration.body.accessToken, { type: 'bearer' })
    ).status,
  ).toBe(403);
});
