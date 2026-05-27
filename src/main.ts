import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  
  // Proper CORS configuration
  app.enableCors({
    origin: [
      'http://localhost:3010',
      'http://localhost:4200', // Angular default
      'http://localhost:8080', // Common dev port
      'http://localhost:5173', // Vite default
      'https://yourdomain.com', // Add your production domain
      "https://directionai.sourcesparktech.in"
      // Add more origins as needed
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
    exposedHeaders: ['Content-Range', 'X-Total-Count'],
    maxAge: 3600, // 1 hour
  });

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Server is running on port ${process.env.PORT ?? 3000}`);
}
bootstrap();