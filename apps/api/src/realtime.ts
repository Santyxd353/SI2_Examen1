import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService, Identity } from './auth';
import { Db } from './db';

type AuthenticatedSocket = Socket & { data: { user?: Identity } };

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: false },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(Db) private db: Db,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        typeof client.handshake.auth?.token === 'string'
          ? client.handshake.auth.token
          : client.handshake.headers.authorization?.replace(/^Bearer /, '');
      client.data.user = await this.auth.verify(token);
      client.emit('realtime:ready', { connectedAt: new Date().toISOString() });
    } catch {
      client.emit('realtime:error', { message: 'Inicia sesión para recibir actualizaciones.' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('inventory:subscribe')
  async subscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { locationId?: unknown },
  ) {
    if (!client.data.user) return { ok: false, message: 'Sesión no disponible.' };
    if (typeof body?.locationId !== 'string')
      return { ok: false, message: 'Selecciona una ubicación válida.' };
    const location = await this.db.ubicacion.findFirst({
      where: { id: body.locationId, activa: true },
      select: { id: true },
    });
    if (!location) return { ok: false, message: 'La ubicación no está disponible.' };
    for (const room of client.rooms) if (room.startsWith('inventory:')) await client.leave(room);
    await client.join(`inventory:${location.id}`);
    return { ok: true, locationId: location.id };
  }

  inventoryChanged(locationId: string, data: { variantIds: string[]; reason: string }) {
    this.server?.to(`inventory:${locationId}`).emit('inventory:updated', {
      locationId,
      variantIds: data.variantIds,
      reason: data.reason,
      occurredAt: new Date().toISOString(),
    });
  }
}
