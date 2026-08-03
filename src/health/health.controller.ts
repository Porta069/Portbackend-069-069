import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

// Vom Rate-Limit ausgenommen: die Plattform-Prüfung und der Keep-Alive-Ping
// teilen sich mit echten Nutzern die Edge-IP. Ein 429 auf diesem Pfad würde
// als "Dienst tot" gewertet und einen Neustart auslösen.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // 5s statt der Voreinstellung (1s): unter Lastspitzen wartet ein Ping
      // kurz auf eine freie Verbindung. Mit 1s meldete der Check "down",
      // woraufhin die Plattform den laufenden Dienst neu startete — die
      // Störung entstand also erst durch die Prüfung selbst.
      () =>
        this.prismaIndicator.pingCheck('database', this.prisma, {
          timeout: 5_000,
        }),
    ]);
  }
}
