import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.use(helmet());
  app.enableCors({ origin, credentials: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));

  if (process.env.NODE_ENV !== "production") {
    const cookieName = process.env.SESSION_COOKIE_NAME ?? "nexus.sid";
    const swaggerConfig = new DocumentBuilder()
      .setTitle("NEXUS ERP API")
      .setDescription("Versioned API for the NEXUS ERP platform.")
      .setVersion("0.1.0")
      .addCookieAuth(cookieName, { type: "apiKey", in: "cookie", name: cookieName })
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
