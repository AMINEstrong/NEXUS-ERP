import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { resolveTrustProxy } from "./config/env.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const isProduction = config.get<string>("NODE_ENV") === "production";
  const trustProxy = resolveTrustProxy(config.get<string>("TRUST_PROXY", "false"));

  // Only trust forwarding headers when the operator explicitly configures the
  // proxy chain. Blindly trusting "X-Forwarded-*" would let clients spoof IPs
  // and defeat rate limiting.
  app.getHttpAdapter().getInstance().set("trust proxy", trustProxy);

  app.use(
    helmet({
      // HSTS is only meaningful behind HTTPS, so keep it out of local HTTP
      // development to avoid sticky browser state on localhost.
      strictTransportSecurity: isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );
  app.enableCors({
    origin: config.get<string>("WEB_ORIGIN", "http://localhost:3001"),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));

  if (!isProduction) {
    const cookieName = config.get<string>("SESSION_COOKIE_NAME", "nexus.sid");
    const swaggerConfig = new DocumentBuilder()
      .setTitle("NEXUS ERP API")
      .setDescription("Versioned API for the NEXUS ERP platform.")
      .setVersion("0.1.0")
      .addCookieAuth(cookieName, { type: "apiKey", in: "cookie", name: cookieName })
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  const port = config.get<number>("API_PORT", 4001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
