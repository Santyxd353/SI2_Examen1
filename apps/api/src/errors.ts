import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof ZodError)
      return res.status(400).json({
        message: 'Revisa los campos del formulario.',
        errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return res.status(409).json({ message: 'Ya existe un registro con esos datos.' });
    if (error instanceof HttpException)
      return res.status(error.getStatus()).json({ message: error.message });
    console.error('Error de operación:', error instanceof Error ? error.name : 'desconocido');
    return res.status(500).json({ message: 'No se pudo completar la operación.' });
  }
}
