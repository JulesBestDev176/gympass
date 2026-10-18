import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ConsoleLogger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { MonitoringService } from './monitoring/monitoring.service';
import { requestTelemetry } from './monitoring/request-metrics';

async function bootstrap() {
  const isProduction = process.env.NODE_ENV === 'production';
  // En production (Docker/Coolify) : pas de couleurs ANSI pour éviter les artefacts de log
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — `colors` exist at runtime but is missing from the type def in this NestJS version
  const appLogger = new ConsoleLogger('', { colors: !isProduction });
  const app = await NestFactory.create(AppModule, { logger: appLogger });
  app.use(requestTelemetry(app.get(MonitoringService).metrics));
  app.enableShutdownHooks();

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  // ── Prefix global ─────────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // ── Filtres & Interceptors ─────────────────────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ── Swagger ───────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('GymPass SN API')
    .setDescription('API de gestion de salle de sport — GymPass Sénégal')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`\n🚀  GymPass API démarré sur http://localhost:${port}/api/v1`);
  console.log(`📚  Swagger : http://localhost:${port}/api/docs\n`);
}

bootstrap();
