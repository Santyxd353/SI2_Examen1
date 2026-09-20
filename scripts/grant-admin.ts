import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const db = new PrismaClient();

async function main() {
  const email = z.string().trim().toLowerCase().email().parse(process.argv[2]);
  const [user, role] = await Promise.all([
    db.usuario.findUnique({ where: { correo: email } }),
    db.rol.findUniqueOrThrow({ where: { nombre: 'Administrador' } }),
  ]);
  if (!user) throw new Error('Primero registra esa cuenta desde la aplicación.');
  await db.usuario_rol.upsert({
    where: { usuario_id_rol_id: { usuario_id: user.id, rol_id: role.id } },
    update: {},
    create: { usuario_id: user.id, rol_id: role.id, asignado_en: new Date() },
  });
  await db.sesion.updateMany({
    where: { usuario_id: user.id, revocada_en: null },
    data: { revocada_en: new Date() },
  });
  console.log(`Administrador habilitado: ${email}. Inicia sesión nuevamente.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
