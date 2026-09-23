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
let clientId: string;
let locationId: string;
let variantId: string;
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
  clientId = client.body.user.id;
  const location = await db.ubicacion.create({
    data: {
      nombre: `Pedidos ${stamp}`,
      tipo: 'TIENDA',
      direccion: 'Dirección de pedidos',
      activa: true,
    },
  });
  locationId = location.id;
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

async function createPaidOrder(state: 'CONFIRMADO' | 'ENTREGADO') {
  await db.inventario.update({
    where: { variante_id_ubicacion_id: { variante_id: variantId, ubicacion_id: locationId } },
    data: { fisico: { decrement: 2 }, version: { increment: 1 } },
  });
  const number = `APP-${state.slice(0, 3)}-${randomUUID().slice(0, 8)}`;
  return db.pedido.create({
    data: {
      usuario_id: clientId,
      ubicacion_id: locationId,
      numero: number,
      canal: 'APP',
      moneda: 'BOB',
      subtotal: 100,
      descuento: 0,
      impuesto: 0,
      entrega: 0,
      total: 100,
      direccion_snapshot: { detalle: 'Dirección de devolución' },
      reglas_snapshot: { tipo: 'COMPRA_APP' },
      estado: state,
      creado_en: new Date(),
      entregado_en: state === 'ENTREGADO' ? new Date() : null,
      idempotencia: randomUUID(),
      detalle_pedido: {
        create: {
          variante_id: variantId,
          sku_snapshot: `DEV-${stamp}`,
          descripcion_snapshot: 'Prenda para devolución',
          talla_snapshot: 'M',
          color_snapshot: 'Negro',
          cantidad: 2,
          precio_unitario: 50,
          descuento: 0,
          total_linea: 100,
        },
      },
      pago: {
        create: {
          proveedor: 'SIMULADO_APP',
          referencia: number,
          idempotencia: randomUUID(),
          monto: 100,
          moneda: 'BOB',
          estado: 'CONFIRMADO',
          creado_en: new Date(),
          confirmado_en: new Date(),
        },
      },
    },
    include: { detalle_pedido: true, pago: true },
  });
}

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

test('cancelación administrativa reintegra stock y confirma el reembolso una sola vez', async () => {
  const order = await createPaidOrder('CONFIRMADO');
  const idempotency = randomUUID();
  const payload = {
    reason: 'El cliente solicitó cancelar antes del despacho.',
    idempotency,
  };
  const cancel = await request(app.getHttpServer())
    .patch(`/api/admin/orders/${order.id}/cancel`)
    .auth(adminToken, { type: 'bearer' })
    .send(payload);
  expect(cancel.status).toBe(200);
  expect(cancel.body.estado).toBe('CANCELADO');

  const retry = await request(app.getHttpServer())
    .patch(`/api/admin/orders/${order.id}/cancel`)
    .auth(adminToken, { type: 'bearer' })
    .send(payload);
  expect(retry.status).toBe(200);
  expect(retry.body.estado).toBe('CANCELADO');

  const inventory = await db.inventario.findUniqueOrThrow({
    where: { variante_id_ubicacion_id: { variante_id: variantId, ubicacion_id: locationId } },
  });
  expect(inventory.fisico).toBe(5);
  expect(
    await db.movimiento_stock.count({ where: { pedido_id: order.id, tipo: 'DEVOLUCION' } }),
  ).toBe(1);
  const refund = await db.reembolso.findFirstOrThrow({ where: { pago_id: order.pago[0].id } });
  expect(refund.estado).toBe('CONFIRMADO');
  expect(Number(refund.monto)).toBe(100);
  expect((await db.pago.findUniqueOrThrow({ where: { id: order.pago[0].id } })).estado).toBe(
    'REEMBOLSADO',
  );
});

test('revisión parcial reintegra solo unidades aptas y reembolsa el importe proporcional', async () => {
  const order = await createPaidOrder('ENTREGADO');
  const requestRow = await db.devolucion.create({
    data: {
      pedido_id: order.id,
      usuario_id: clientId,
      tipo: 'DEVOLUCION',
      estado: 'SOLICITADA',
      motivo: 'Una unidad llegó con defecto visible.',
      solicitada_en: new Date(),
      detalle_devolucion: {
        create: {
          detalle_pedido_id: order.detalle_pedido[0].id,
          cantidad: 2,
          cantidad_apta: 0,
        },
      },
    },
    include: { detalle_devolucion: true },
  });
  const idempotency = randomUUID();
  const payload = {
    decision: 'APROBAR',
    resolution: 'Se acepta una unidad en condiciones aptas para volver al inventario.',
    locationId,
    idempotency,
    items: [
      {
        returnDetailId: requestRow.detalle_devolucion[0].id,
        acceptedQuantity: 1,
        observation: 'Una unidad apta; la segunda presenta daño por uso.',
      },
    ],
  };
  const reviewed = await request(app.getHttpServer())
    .patch(`/api/admin/orders/returns/${requestRow.id}/review`)
    .auth(adminToken, { type: 'bearer' })
    .send(payload);
  expect(reviewed.status).toBe(200);
  expect(reviewed.body.estado).toBe('RESUELTA');
  expect(reviewed.body.detalle_devolucion[0].cantidad_apta).toBe(1);
  expect(Number(reviewed.body.reembolso[0].monto)).toBe(50);

  const retry = await request(app.getHttpServer())
    .patch(`/api/admin/orders/returns/${requestRow.id}/review`)
    .auth(adminToken, { type: 'bearer' })
    .send(payload);
  expect(retry.status).toBe(200);

  const inventory = await db.inventario.findUniqueOrThrow({
    where: { variante_id_ubicacion_id: { variante_id: variantId, ubicacion_id: locationId } },
  });
  expect(inventory.fisico).toBe(4);
  expect(
    await db.movimiento_stock.count({ where: { pedido_id: order.id, tipo: 'DEVOLUCION' } }),
  ).toBe(1);
  expect((await db.pago.findUniqueOrThrow({ where: { id: order.pago[0].id } })).estado).toBe(
    'CONFIRMADO',
  );
});

test('rechazar una devolución conserva el stock y no crea un reembolso', async () => {
  const order = await createPaidOrder('ENTREGADO');
  const requestRow = await db.devolucion.create({
    data: {
      pedido_id: order.id,
      usuario_id: clientId,
      tipo: 'DEVOLUCION',
      estado: 'SOLICITADA',
      motivo: 'La talla elegida no corresponde a lo solicitado.',
      solicitada_en: new Date(),
      detalle_devolucion: {
        create: {
          detalle_pedido_id: order.detalle_pedido[0].id,
          cantidad: 2,
          cantidad_apta: 0,
        },
      },
    },
  });
  const inventoryBefore = await db.inventario.findUniqueOrThrow({
    where: { variante_id_ubicacion_id: { variante_id: variantId, ubicacion_id: locationId } },
  });

  const reviewed = await request(app.getHttpServer())
    .patch(`/api/admin/orders/returns/${requestRow.id}/review`)
    .auth(adminToken, { type: 'bearer' })
    .send({
      decision: 'RECHAZAR',
      resolution: 'La inspección confirma que la prenda corresponde al pedido entregado.',
      idempotency: randomUUID(),
      items: [],
    });
  expect(reviewed.status).toBe(200);
  expect(reviewed.body.estado).toBe('RECHAZADA');

  const inventoryAfter = await db.inventario.findUniqueOrThrow({
    where: { variante_id_ubicacion_id: { variante_id: variantId, ubicacion_id: locationId } },
  });
  expect(inventoryAfter.fisico).toBe(inventoryBefore.fisico);
  expect(await db.reembolso.count({ where: { devolucion_id: requestRow.id } })).toBe(0);
  expect(
    await db.movimiento_stock.count({ where: { pedido_id: order.id, tipo: 'DEVOLUCION' } }),
  ).toBe(0);
});
