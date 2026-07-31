import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { OtpModule } from '../otp/otp.module';

@Module({
  imports: [NotificationsModule, OtpModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
