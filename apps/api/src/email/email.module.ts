import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, EMAIL_TRANSPORT, EmailService } from "./email.service.js";

@Module({
  providers: [
    {
      provide: EMAIL_TRANSPORT,
      useFactory: createTransport,
      inject: [ConfigService],
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
