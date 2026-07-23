import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OtpService } from './otp.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ClientIp } from '../common/http/client-ip.decorator';

@Controller('otp')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Post('request')
  @HttpCode(HttpStatus.OK)
  // Tight per-IP limit on top of the per-contact cooldown in the service.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(@Body() dto: RequestOtpDto, @ClientIp() ip: string) {
    return this.otp.request(dto.channel, dto.contact, ip);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@Body() dto: VerifyOtpDto, @ClientIp() ip: string) {
    return this.otp.verify(dto.channel, dto.contact, dto.code, ip);
  }
}
