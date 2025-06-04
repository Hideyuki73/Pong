import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // Isso permite conexões externas
  const port = process.env.PORT || 3001;
  await app.listen(port); // Isso permite aceitar conexões de fora
}
bootstrap();
