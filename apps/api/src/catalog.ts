import { Controller, Get, Post, Body, Query, Req, Inject, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { AuthGuard, AuthRequest, requirePermission } from './auth';
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
        if (price && (!locationId || stock[0].available > 0))
          disponibles.push({
            ...v,
            precio: Number(price.importe) * (1 - Number(price.descuento_pct) / 100),
            moneda: price.moneda,
            disponible: stock[0].available,
            ubicaciones: locations,
            modeloId: model?.id,
            plantillaId: model?.plantilla_id,
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
