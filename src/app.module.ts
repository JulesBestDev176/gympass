import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { GymModule } from './gym/gym.module';
import { UsersModule } from './users/users.module';
import { MembersModule } from './members/members.module';
import { PaymentsModule } from './payments/payments.module';
import { SessionCardsModule } from './session-cards/session-cards.module';
import { ScannerModule } from './scanner/scanner.module';
import { EntriesModule } from './entries/entries.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UploadModule } from './upload/upload.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { FirebaseModule } from './firebase/firebase.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    GymModule,
    UsersModule,
    MembersModule,
    PaymentsModule,
    SessionCardsModule,
    ScannerModule,
    EntriesModule,
    NotificationsModule,
    DashboardModule,
    UploadModule,
    WhatsappModule,
    FirebaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
