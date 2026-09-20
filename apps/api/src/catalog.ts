import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Inject,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { z } from 'zod';
import { Db } from './db';
import { AuthGuard, AuthRequest, requirePermission } from './auth';
import { removeStored, storedPath } from './storage';
@Controller('catalog')
export class CatalogController {
  constructor(@Inject(Db) private db: Db) {}
  @Get()
  async list(
    @Query('search') search = '',
    @Query('category') category = '',
    @Query('location') location = '',
  ) {
    const locationId = z.string().uuid().safeParse(location).success ? location : null;
    const products = await this.db.producto.findMany({
      where: {
        estado: 'PUBLICADO',
        nombre: { contains: search.slice(0, 100), mode: 'insensitive' },
        ...(z.string().uuid().safeParse(category).success ? { categoria_id: category } : {}),
      },
      orderBy: { creado_en: 'asc' },
      take: 60,
    });
    const result = [];
    for (const p of products) {
      const variants = await this.db.variante.findMany({
        where: { producto_id: p.id, activa: true },
        orderBy: { sku: 'asc' },
      });
      const disponibles = [];
      const arResources = await this.db.recurso_catalogo.findMany({
        where: { producto_id: p.id, uso: 'AR', estado: 'PUBLICADO', variante_id: { not: null } },
        select: { variante_id: true, clave_objeto: true },
      });
      for (const v of variants) {
        const now = new Date();
        const price = await this.db.precio_canal.findFirst({
          where: {
            variante_id: v.id,
            canal: 'WEB',
            desde: { lte: now },
            OR: [{ hasta: null }, { hasta: { gt: now } }],
          },
          orderBy: { desde: 'desc' },
        });
        const stock = locationId
          ? await this.db.$queryRaw<
              { available: number }[]
            >`SELECT COALESCE(SUM(GREATEST(i.disponible-d.stock_seguridad,0)),0)::int AS available FROM inventario i JOIN disponibilidad_canal d ON d.variante_id=i.variante_id AND d.ubicacion_id=i.ubicacion_id JOIN ubicacion u ON u.id=i.ubicacion_id WHERE i.variante_id=${v.id}::uuid AND i.ubicacion_id=${locationId}::uuid AND d.canal='WEB' AND d.habilitada AND u.activa`
          : await this.db.$queryRaw<
              { available: number }[]
            >`SELECT COALESCE(SUM(GREATEST(i.disponible-d.stock_seguridad,0)),0)::int AS available FROM inventario i JOIN disponibilidad_canal d ON d.variante_id=i.variante_id AND d.ubicacion_id=i.ubicacion_id JOIN ubicacion u ON u.id=i.ubicacion_id WHERE i.variante_id=${v.id}::uuid AND d.canal='WEB' AND d.habilitada AND u.activa`;
        const locations = locationId
          ? await this.db.$queryRaw<
              {
                id: string;
                nombre: string;
                tipo: string;
                direccion: string | null;
                disponible: number;
              }[]
            >`SELECT u.id,u.nombre,u.tipo,u.direccion,GREATEST(i.disponible,0)::int AS disponible
              FROM inventario i JOIN ubicacion u ON u.id=i.ubicacion_id
              WHERE i.variante_id=${v.id}::uuid AND i.ubicacion_id=${locationId}::uuid
                AND u.activa AND i.disponible > 0
              ORDER BY CASE u.tipo WHEN 'TIENDA' THEN 0 ELSE 1 END,u.nombre`
          : await this.db.$queryRaw<
              {
                id: string;
                nombre: string;
                tipo: string;
                direccion: string | null;
                disponible: number;
              }[]
            >`SELECT u.id,u.nombre,u.tipo,u.direccion,GREATEST(i.disponible,0)::int AS disponible
              FROM inventario i JOIN ubicacion u ON u.id=i.ubicacion_id
              WHERE i.variante_id=${v.id}::uuid AND u.activa AND i.disponible > 0
              ORDER BY CASE u.tipo WHEN 'TIENDA' THEN 0 ELSE 1 END,u.nombre`;
        const model = await this.db.modelo_prenda.findFirst({
          where: { variante_id: v.id, estado: 'PUBLICADO' },
          orderBy: { version: 'desc' },
        });
        const arResource = arResources.find((resource) => resource.variante_id === v.id);
        if (price && (!locationId || stock[0].available > 0))
          disponibles.push({
            ...v,
            precio: Number(price.importe) * (1 - Number(price.descuento_pct) / 100),
            moneda: price.moneda,
            disponible: stock[0].available,
            ubicaciones: locations,
            modeloId: model?.id,
            plantillaId: model?.plantilla_id,
            arImagePath: arResource
              ? `/assets/${arResource.clave_objeto.replace(/^public\//, '')}`
              : null,
          });
      }
      if (!locationId || disponibles.length) result.push({ ...p, variantes: disponibles });
    }
    return {
      products: result,
      categories: await this.db.categoria.findMany({ where: { activa: true } }),
      locations: await this.db.ubicacion.findMany({
        where: { activa: true, inventario: { some: {} } },
        select: { id: true, nombre: true, tipo: true, direccion: true },
        orderBy: [{ tipo: 'desc' }, { nombre: 'asc' }],
      }),
    };
  }
  @Get('ar-resources')
  @UseGuards(AuthGuard)
  async arResources(@Req() r: AuthRequest) {
    requirePermission(r.user, 'catalogo:gestionar');
    const resources = await this.db.recurso_catalogo.findMany({
      where: { uso: 'AR' },
      include: {
        producto: { select: { nombre: true } },
        variante: { select: { talla: true, color: true } },
      },
      orderBy: { id: 'desc' },
    });
    return resources.map((resource) => ({
      id: resource.id,
      productoId: resource.producto_id,
      varianteId: resource.variante_id,
      producto: resource.producto.nombre,
      talla: resource.variante?.talla,
      color: resource.variante?.color,
      estado: resource.estado,
      textoAlternativo: resource.texto_alternativo,
      licencia: resource.licencia,
      imagePath: `/assets/${resource.clave_objeto.replace(/^public\//, '')}`,
    }));
  }

  @Post('ar-resources')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('imagen', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3 },
    }),
  )
  async uploadArResource(
    @Req() r: AuthRequest,
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    requirePermission(r.user, 'catalogo:gestionar');
    const data = z
      .object({
        varianteId: z.string().uuid(),
        textoAlternativo: z.string().trim().min(5).max(255),
        licencia: z.string().trim().min(3).max(255),
      })
      .strict()
      .parse(body);
    if (
      !file ||
      file.mimetype !== 'image/png' ||
      file.size < 100 ||
      !file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      file.buffer.toString('ascii', 12, 16) !== 'IHDR' ||
      ![4, 6].includes(file.buffer[25])
    )
      throw new BadRequestException('Sube un PNG válido con canal de transparencia.');
    const width = file.buffer.readUInt32BE(16);
    const height = file.buffer.readUInt32BE(20);
    if (width < 256 || height < 256 || width > 2048 || height > 2048)
      throw new BadRequestException('La imagen debe medir entre 256 y 2048 píxeles por lado.');
    const variant = await this.db.variante.findUnique({
      where: { id: data.varianteId },
      select: { producto_id: true },
    });
    if (!variant) throw new NotFoundException('Variante no encontrada.');
    const key = `public/catalog-ar/${randomUUID()}.png`;
    await mkdir(storedPath('public/catalog-ar'), { recursive: true });
    await writeFile(storedPath(key), file.buffer, { flag: 'wx' });
    try {
      return await this.db.recurso_catalogo.create({
        data: {
          producto_id: variant.producto_id,
          variante_id: data.varianteId,
          clave_objeto: key,
          tipo_mime: 'image/png',
          orden: 0,
          texto_alternativo: data.textoAlternativo,
          licencia: data.licencia,
          uso: 'AR',
          estado: 'BORRADOR',
        },
        select: { id: true, estado: true },
      });
    } catch (error) {
      await removeStored(key);
      throw error;
    }
  }

  @Patch('ar-resources/:id')
  @UseGuards(AuthGuard)
  async setArResourceStatus(@Req() r: AuthRequest, @Param('id') id: string, @Body() body: unknown) {
    requirePermission(r.user, 'catalogo:gestionar');
    const resourceId = z.string().uuid().parse(id);
    const { estado } = z
      .object({ estado: z.enum(['BORRADOR', 'PUBLICADO']) })
      .strict()
      .parse(body);
    return this.db.$transaction(async (tx) => {
      const resource = await tx.recurso_catalogo.findFirst({
        where: { id: resourceId, uso: 'AR', variante_id: { not: null } },
      });
      if (!resource) throw new NotFoundException('Imagen AR no encontrada.');
      if (estado === 'PUBLICADO') {
        await tx.recurso_catalogo.updateMany({
          where: { variante_id: resource.variante_id, uso: 'AR', estado: 'PUBLICADO' },
          data: { estado: 'BORRADOR' },
        });
      }
      return tx.recurso_catalogo.update({
        where: { id: resource.id },
        data: { estado },
        select: { id: true, estado: true },
      });
    });
  }
  @Post() @UseGuards(AuthGuard) async create(@Req() r: AuthRequest, @Body() body: unknown) {
    requirePermission(r.user, 'catalogo:gestionar');
    const data = z
      .object({
        nombre: z.string().min(2).max(160),
        descripcion: z.string().min(10).max(3000),
        material: z.string().min(2).max(150),
        categoria_id: z.string().uuid(),
      })
      .strict()
      .parse(body);
    return this.db.producto.create({
      data: { ...data, estado: 'BORRADOR', creado_en: new Date() },
    });
  }
}
