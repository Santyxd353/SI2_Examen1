import 'reflect-metadata';
import { Module, Controller, Get } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { Db } from './db';
import { AuthController, AuthService, AuthGuard } from './auth';
import { CatalogController } from './catalog';
import { AvatarsController } from './avatars';
import { FittingController } from './fitting';
import { AvatarJobs } from './avatar-jobs';
import { LocationsController, StaffController } from './locations';
import { AnalyticsController, CommercialAnalytics, ReportsController } from './reports';
import { SalesController } from './sales';
import { CommerceController } from './commerce';
import { RealtimeGateway } from './realtime';
import { ApiErrors } from './errors';
import { storedPath, ensureStorage } from './storage';
@Controller('health')
class HealthController {
  @Get() health() {
    return { status: 'ok' };
  }
}
@Module({
  controllers: [
    HealthController,
    AuthController,
    CatalogController,
    AvatarsController,
    FittingController,
    LocationsController,
    StaffController,
    ReportsController,
    AnalyticsController,
    SalesController,
    CommerceController,
  ],
  providers: [Db, AuthService, AuthGuard, AvatarJobs, CommercialAnalytics, RealtimeGateway],
})
class AppModule {}
export async function createApp() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 48)
    throw new Error('Configura JWT_SECRET con al menos 48 caracteres aleatorios.');
  const app = await NestFactory.create(AppModule, { logger: false });
  const origin = process.env.WEB_ORIGIN || 'http://localhost:5173';
  const allowedOrigins = [origin, origin.replace('localhost', '127.0.0.1')];
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 80,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Demasiados intentos. Espera unos minutos antes de continuar.' },
    }),
  );
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !allowedOrigins.includes(req.headers.origin)
    )
      return res.status(403).json({ message: 'Origen no autorizado.' });
    next();
  });
  await ensureStorage();
  app.use('/assets', express.static(storedPath('public'), { dotfiles: 'deny', index: false }));
  app.useGlobalFilters(new ApiErrors());
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}
