import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  Res,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { Db } from './db';
import { AuthGuard, AuthRequest } from './auth';
import { storedPath, removeStored } from './storage';
const uuid = (v: string) => z.string().uuid().parse(v);
const upload = z
  .object({
    altura: z.coerce.number().min(100).max(230),
    consentimiento: z.literal('true'),
    adulto: z.literal('true'),
    idempotencia: z.string().uuid(),
  })
  .strict();
@Controller('avatars')
@UseGuards(AuthGuard)
export class AvatarsController {
  constructor(@Inject(Db) private db: Db) {}
  @Get() async list(@Req() r: AuthRequest) {
    const avatars = await this.db.avatar.findMany({
      where: { usuario_id: r.user.id, estado: { not: 'ELIMINADO' } },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        estado: true,
        medidas: true,
        plantilla_id: true,
        creado_en: true,
      },
    });
    const jobs = await this.db.trabajo_avatar.findMany({
      where: { usuario_id: r.user.id },
      orderBy: { creado_en: 'desc' },
      take: 10,
      select: { id: true, estado: true, error_codigo: true, avatar_id: true, creado_en: true },
    });
    return { avatars, jobs };
  }
  @Get('jobs/:id') async job(@Req() r: AuthRequest, @Param('id') id: string) {
    const job = await this.db.trabajo_avatar.findFirst({
      where: { id: uuid(id), usuario_id: r.user.id },
      select: { id: true, estado: true, error_codigo: true, avatar_id: true },
    });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    return job;
  }
  @Post()
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'frente', maxCount: 1 },
        { name: 'perfil', maxCount: 1 },
        { name: 'espalda', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { files: 3, fileSize: 10485760, fields: 4 } },
    ),
  )
  async create(
    @Req() r: AuthRequest,
    @Body() body: unknown,
    @UploadedFiles() files: Record<string, Express.Multer.File[]>,
  ) {
    const b = upload.parse(body);
    const existing = await this.db.trabajo_avatar.findUnique({
      where: { idempotencia: b.idempotencia },
    });
    if (existing) {
      if (existing.usuario_id !== r.user.id)
        throw new ConflictException('Solicitud no disponible.');
      return { id: existing.id, estado: existing.estado };
    }
    const views = ['frente', 'perfil', 'espalda'];
    for (const view of views) {
      const f = files?.[view]?.[0];
      if (!f || f.size === 0)
        throw new BadRequestException('Adjunta una foto de frente, perfil y espalda.');
      const png = f.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpg = f.buffer[0] === 255 && f.buffer[1] === 216 && f.buffer[2] === 255;
      if (!(png && f.mimetype === 'image/png') && !(jpg && f.mimetype === 'image/jpeg'))
        throw new BadRequestException('Las fotos deben ser archivos JPEG o PNG válidos.');
    }
    const id = randomUUID(),
      captureId = randomUUID(),
      dir = 'private/captures/' + captureId;
    await mkdir(storedPath(dir), { recursive: true });
    try {
      for (const view of views)
        await writeFile(storedPath(dir + '/' + view), files[view][0].buffer, { flag: 'wx' });
      const result = await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM usuario WHERE id=${r.user.id}::uuid FOR UPDATE`;
        const repeated = await tx.trabajo_avatar.findUnique({
          where: { idempotencia: b.idempotencia },
        });
        if (repeated) {
          if (repeated.usuario_id !== r.user.id)
            throw new ConflictException('Solicitud no disponible.');
          return { id: repeated.id, estado: repeated.estado };
        }
        const pending = await tx.trabajo_avatar.count({
          where: { usuario_id: r.user.id, estado: { in: ['EN_COLA', 'PROCESANDO'] } },
        });
        if (pending)
          throw new ConflictException(
            'Ya tienes un avatar en proceso. Espera a que termine antes de enviar otras fotos.',
          );
        const now = new Date();
        const consent = await tx.consentimiento.create({
          data: {
            usuario_id: r.user.id,
            version_texto: '1.0',
            finalidad: 'Generar avatar para vestidor 3D',
            declaracion_adulto: true,
            aceptado_en: new Date(),
          },
        });
        await tx.captura_corporal.create({
          data: {
            id: captureId,
            usuario_id: r.user.id,
            consentimiento_id: consent.id,
            altura_cm: b.altura,
            estado: 'BORRADOR',
            creada_en: now,
            purgar_antes_de: new Date(now.getTime() + 86400000),
          },
        });
        for (const view of views)
          await tx.foto_temporal.create({
            data: {
              captura_id: captureId,
              vista: view.toUpperCase(),
              clave_objeto: dir + '/' + view,
              mime: files[view][0].mimetype,
              bytes: files[view][0].size,
            },
          });
        await tx.trabajo_avatar.create({
          data: {
            id,
            usuario_id: r.user.id,
            captura_id: captureId,
            tipo: 'GENERAR',
            estado: 'EN_COLA',
            idempotencia: b.idempotencia,
            intentos: 0,
            version_proceso: 'g18-1.0',
            creado_en: new Date(),
          },
        });
        return { id, estado: 'EN_COLA' };
      });
      if (result.id !== id) await removeStored(dir);
      return result;
    } catch (e) {
      await removeStored(dir);
      throw e;
    }
  }
  @Get(':id/model') async model(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const a = await this.db.avatar.findFirst({
      where: { id: uuid(id), usuario_id: r.user.id, estado: { in: ['EN_REVISION', 'APROBADO'] } },
    });
    if (!a?.clave_glb) throw new NotFoundException('Avatar no disponible.');
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('model/gltf-binary').sendFile(storedPath(a.clave_glb), { dotfiles: 'allow' });
  }
  @Post(':id/approve') async approve(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM usuario WHERE id=${r.user.id}::uuid FOR UPDATE`;
      const a = await tx.avatar.findFirst({
        where: { id: uuid(id), usuario_id: r.user.id, estado: 'EN_REVISION' },
      });
      if (!a) throw new NotFoundException('No hay un avatar pendiente de revisión.');
      await tx.avatar.updateMany({
        where: { usuario_id: r.user.id, estado: 'APROBADO' },
        data: { estado: 'SUSTITUIDO' },
      });
      return tx.avatar.update({
        where: { id: a.id },
        data: { estado: 'APROBADO', aprobado_en: new Date() },
        select: { id: true, estado: true },
      });
    });
  }
  @Delete(':id') async remove(@Req() r: AuthRequest, @Param('id') id: string) {
    const a = await this.db.avatar.findFirst({ where: { id: uuid(id), usuario_id: r.user.id } });
    if (!a) throw new NotFoundException('Avatar no encontrado.');
    if (a.estado === 'ELIMINADO') return { estado: 'ELIMINADO' };
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM usuario WHERE id=${r.user.id}::uuid FOR UPDATE`;
      await tx.avatar.update({ where: { id: a.id }, data: { estado: 'ELIMINANDO' } });
      await tx.trabajo_avatar.updateMany({
        where: { avatar_id: a.id, estado: { in: ['EN_COLA', 'PROCESANDO'] } },
        data: { estado: 'CANCELADO', terminado_en: new Date() },
      });
    });
    return { estado: 'ELIMINANDO' };
  }
}
