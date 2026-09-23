import 'dotenv/config';
import request from 'supertest';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

let app: INestApplication;
let db: PrismaClient;
let adminToken: string;
let clientToken: string;
let orderId: string;
const stamp = Date.now();

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = '/vestidor18_test';
  process.env.DATABASE_URL = url.toString();
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const adminRole = await db.rol.findUniqueOrThrow({ where: { nombre: 'Administrador' } });
  const admin = await db.usuario.create({
    data: {
      nombres: 'Administrador',
      apellidos: 'Pedidos',
      correo: `pedidos-admin-${stamp}@grupo18.test`,
      clave_hash: await hash('Administracion2026!', 12),
      estado: 'ACTIVO',
      preferencias: {},
      creado_en: new Date(),
      usuario_rol: { create: { rol_id: adminRole.id, asignado_en: new Date() } },
    },
  });
  app = await createApp();
  const adminLogin = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ correo: admin.correo, clave: 'Administracion2026!' });
  adminToken = adminLogin.body.accessToken;
  expect(adminLogin.body.user.permissions).toContain('pedidos:gestionar');

  const client = await request(app.getHttpServer())
    .post('/api/auth/mobile/register')
    .send({
      nombres: 'Cliente',
      apellidos: 'Pedido',
      correo: `pedidos-cliente-${stamp}@grupo18.test`,
      clave: 'ClienteSeguro2026!',
    });
  clientToken = client.body.accessToken;
  const order = await db.pedido.create({
    data: {
      usuario_id: client.body.user.id,
      numero: `APP-TEST-${stamp}`,
      canal: 'APP',
      moneda: 'BOB',
      subtotal: 100,
      descuento: 0,
      impuesto: 0,
      entrega: 0,
      total: 100,
      direccion_snapshot: { detalle: 'Dirección de prueba' },
      reglas_snapshot: { tipo: 'COMPRA_APP' },
      estado: 'CONFIRMADO',
      creado_en: new Date(),
      idempotencia: randomUUID(),
      historial_pedido: {
        create: {
          actor_id: client.body.user.id,
          estado_anterior: 'PENDIENTE_PAGO',
          estado_nuevo: 'CONFIRMADO',
          motivo: 'Pago aprobado en prueba.',
          creado_en: new Date(),
        },
      },
    },
  });
  orderId = order.id;
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

test('solo el administrador consulta y avanza el ciclo del pedido', async () => {
  const denied = await request(app.getHttpServer())
    .get('/api/admin/orders')
    .auth(clientToken, { type: 'bearer' });
  expect(denied.status).toBe(403);

  const list = await request(app.getHttpServer())
    .get('/api/admin/orders?channel=APP&status=CONFIRMADO')
    .auth(adminToken, { type: 'bearer' });
  expect(list.status).toBe(200);
  expect(list.body.some((row: { id: string }) => row.id === orderId)).toBe(true);

  for (const [status, extra] of [
    ['PREPARANDO', {}],
    ['DESPACHADO', { tracking: 'GUIA-TEST-001' }],
    ['ENTREGADO', {}],
    ['CERRADO', {}],
  ] as const) {
    const changed = await request(app.getHttpServer())
      .patch(`/api/admin/orders/${orderId}/status`)
      .auth(adminToken, { type: 'bearer' })
      .send({ status, reason: `Cambio de prueba a ${status}`, ...extra });
    expect(changed.status).toBe(200);
    expect(changed.body.estado).toBe(status);
  }

  const stored = await db.pedido.findUniqueOrThrow({
    where: { id: orderId },
    include: { historial_pedido: true },
  });
  expect(stored.seguimiento).toBe('GUIA-TEST-001');
  expect(stored.entregado_en).toBeTruthy();
  expect(stored.historial_pedido).toHaveLength(5);
});

test('rechaza saltos de estado no permitidos', async () => {
  const invalid = await request(app.getHttpServer())
    .patch(`/api/admin/orders/${orderId}/status`)
    .auth(adminToken, { type: 'bearer' })
    .send({ status: 'PREPARANDO', reason: 'Intento inválido después del cierre' });
  expect(invalid.status).toBe(400);
});
