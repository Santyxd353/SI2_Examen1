import 'dotenv/config';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

let app: INestApplication;
let db: PrismaClient;
let sellerToken: string;
let clientToken: string;
let sellerId: string;
let locationId: string;
let variantId: string;
const stamp = Date.now();

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  process.env.DATABASE_URL = url.toString();
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const sellerRole = await db.rol.findUniqueOrThrow({ where: { nombre: 'Vendedor' } });
  const seller = await db.usuario.create({
    data: {
      nombres: 'Vendedor',
      apellidos: 'Mostrador',
      correo: `venta-${stamp}@grupo18.test`,
      clave_hash: await hash('VentaSegura2026!', 12),
      estado: 'ACTIVO',
      preferencias: {},
      creado_en: new Date(),
      usuario_rol: { create: { rol_id: sellerRole.id, asignado_en: new Date() } },
    },
  });
  sellerId = seller.id;
  const location = await db.ubicacion.create({
    data: {
      nombre: `Caja ${stamp}`,
      tipo: 'TIENDA',
      direccion: 'Sucursal de prueba',
      activa: true,
    },
  });
  locationId = location.id;
  await db.usuario_ubicacion.create({
    data: { usuario_id: sellerId, ubicacion_id: locationId },
  });
  variantId = (await db.variante.findFirstOrThrow()).id;
  await db.inventario.create({
    data: {
      variante_id: variantId,
      ubicacion_id: locationId,
      fisico: 5,
      reservado: 0,
      comprometido: 0,
      version: 1,
    },
  });
  app = await createApp();
  const sellerLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo: seller.correo, clave: 'VentaSegura2026!' });
  sellerToken = sellerLogin.body.accessToken;
  expect(sellerLogin.body.user.permissions).toContain('ventas:registrar');
  clientToken = (
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        nombres: 'Cliente',
        apellidos: 'Venta',
        correo: `cliente-venta-${stamp}@grupo18.test`,
        clave: 'ClienteSeguro2026!',
      })
  ).body.accessToken;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

test('vendedor solo recibe catálogo de sus ubicaciones asignadas', async () => {
  const response = await request(app.getHttpServer())
    .get('/api/sales/context')
    .auth(sellerToken, { type: 'bearer' });
  expect(response.status).toBe(200);
  expect(response.body.map((item: { id: string }) => item.id)).toEqual([locationId]);
  expect(response.body[0].variants).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: variantId, available: 5 })]),
  );
});

test('venta confirma pago, descuenta stock y registra movimiento una sola vez', async () => {
  const idempotency = randomUUID();
  const payload = {
    locationId,
    customerName: 'Cliente de prueba',
    paymentMethod: 'QR',
    idempotency,
    items: [{ variantId, quantity: 2 }],
  };
  const first = await request(app.getHttpServer())
    .post('/api/sales')
    .auth(sellerToken, { type: 'bearer' })
    .send(payload);
  expect(first.status).toBe(201);
  expect(first.body).toMatchObject({
    vendedor_id: sellerId,
    ubicacion_id: locationId,
    estado: 'CONFIRMADO',
  });
  expect(first.body.pago[0]).toMatchObject({ estado: 'CONFIRMADO', proveedor: 'POS_QR' });

  const retry = await request(app.getHttpServer())
    .post('/api/sales')
    .auth(sellerToken, { type: 'bearer' })
    .send(payload);
  expect(retry.status).toBe(201);
  expect(retry.body.id).toBe(first.body.id);
  const inventory = await db.inventario.findUniqueOrThrow({
    where: { variante_id_ubicacion_id: { variante_id: variantId, ubicacion_id: locationId } },
  });
  expect(inventory.fisico).toBe(3);
  expect(
    await db.movimiento_stock.count({ where: { pedido_id: first.body.id, tipo: 'SALIDA' } }),
  ).toBe(1);
});

test('stock insuficiente revierte pedido, pago y movimientos', async () => {
  const idempotency = randomUUID();
  const response = await request(app.getHttpServer())
    .post('/api/sales')
    .auth(sellerToken, { type: 'bearer' })
    .send({
      locationId,
      paymentMethod: 'EFECTIVO',
      idempotency,
      items: [{ variantId, quantity: 10 }],
    });
  expect(response.status).toBe(400);
  expect(await db.pedido.count({ where: { idempotencia: idempotency } })).toBe(0);
});

test('cliente no puede abrir el punto de venta ni registrar ventas', async () => {
  expect(
    (
      await request(app.getHttpServer())
        .get('/api/sales/context')
        .auth(clientToken, { type: 'bearer' })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app.getHttpServer())
        .post('/api/sales')
        .auth(clientToken, { type: 'bearer' })
        .send({})
    ).status,
  ).toBe(403);
});
