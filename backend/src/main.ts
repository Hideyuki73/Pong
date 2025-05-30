import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // Isso permite conexões externas
  await app.listen(3001, '0.0.0.0'); // Isso permite aceitar conexões de fora
}
bootstrap();
