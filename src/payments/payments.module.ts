import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { UploadModule } from '../upload/upload.module';
import { PaymentReceiptService } from './payment-receipt.service';

@Module({
  imports: [NotificationsModule, WhatsappModule, UploadModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentReceiptService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
