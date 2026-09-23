import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuthGuard, AuthRequest, requirePermission } from './auth';
import { Db } from './db';

const uuid = z.string().uuid();
const status = z.enum([
  'PENDIENTE_PAGO',
  'CONFIRMADO',
  'PREPARANDO',
  'DESPACHADO',
  'ENTREGADO',
  'CERRADO',
  'CANCELADO',
]);
const channel = z.enum(['WEB', 'APP', 'TIENDA']);
const transition = z
  .object({
    status: z.enum(['PREPARANDO', 'DESPACHADO', 'ENTREGADO', 'CERRADO']),
    tracking: z.string().trim().min(3).max(150).optional(),
    reason: z.string().trim().min(3).max(400),
  })
  .strict();

const allowedTransitions: Record<string, string[]> = {
  CONFIRMADO: ['PREPARANDO'],
  PREPARANDO: ['DESPACHADO'],
  DESPACHADO: ['ENTREGADO'],
  ENTREGADO: ['CERRADO'],
};

@Controller('admin/orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(@Inject(Db) private db: Db) {}

  @Get()
  async list(
    @Req() req: AuthRequest,
    @Query('status') rawStatus = '',
    @Query('channel') rawChannel = '',
  ) {
    requirePermission(req.user, 'pedidos:gestionar');
    const parsedStatus = rawStatus ? status.parse(rawStatus) : undefined;
    const parsedChannel = rawChannel ? channel.parse(rawChannel) : undefined;
    return this.db.pedido.findMany({
      where: {
        ...(parsedStatus ? { estado: parsedStatus } : {}),
        ...(parsedChannel ? { canal: parsedChannel } : {}),
      },
      orderBy: { creado_en: 'desc' },
      take: 100,
      include: {
        usuario_pedido_usuario_idTousuario: {
          select: { nombres: true, apellidos: true, correo: true, telefono: true },
        },
        ubicacion: { select: { nombre: true, tipo: true } },
        detalle_pedido: true,
        pago: true,
        historial_pedido: { orderBy: { creado_en: 'asc' } },
        devolucion: { select: { id: true, estado: true, tipo: true } },
      },
    });
  }

  @Patch(':id/status')
  async updateStatus(@Req() req: AuthRequest, @Param('id') rawId: string, @Body() body: unknown) {
    requirePermission(req.user, 'pedidos:gestionar');
    const id = uuid.parse(rawId);
    const input = transition.parse(body);
    return this.db.$transaction(
      async (tx) => {
        const order = await tx.pedido.findUnique({ where: { id } });
        if (!order) throw new BadRequestException('Pedido no encontrado.');
        if (!allowedTransitions[order.estado]?.includes(input.status))
          throw new BadRequestException(
            `No se puede cambiar un pedido ${order.estado} a ${input.status}.`,
          );
        if (input.status === 'DESPACHADO' && !input.tracking)
          throw new BadRequestException('Registra el código o referencia de seguimiento.');
        const claimed = await tx.pedido.updateMany({
          where: { id, estado: order.estado },
          data: {
            estado: input.status,
            ...(input.tracking ? { seguimiento: input.tracking } : {}),
            ...(input.status === 'ENTREGADO' ? { entregado_en: new Date() } : {}),
          },
        });
        if (claimed.count !== 1)
          throw new BadRequestException(
            'El pedido cambió. Actualiza la pantalla e intenta otra vez.',
          );
        await tx.historial_pedido.create({
          data: {
            pedido_id: id,
            actor_id: req.user.id,
            estado_anterior: order.estado,
            estado_nuevo: input.status,
            motivo: input.reason,
            creado_en: new Date(),
          },
        });
        return tx.pedido.findUniqueOrThrow({
          where: { id },
          include: {
            usuario_pedido_usuario_idTousuario: {
              select: { nombres: true, apellidos: true, correo: true, telefono: true },
            },
            ubicacion: { select: { nombre: true, tipo: true } },
            detalle_pedido: true,
            pago: true,
            historial_pedido: { orderBy: { creado_en: 'asc' } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
