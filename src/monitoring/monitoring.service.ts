import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestMetrics } from './request-metrics';

@Injectable()
export class MonitoringService implements OnModuleInit, OnModuleDestroy {
  readonly metrics: RequestMetrics;
  private timer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(MonitoringService.name);

  constructor(config: ConfigService) {
    this.metrics = new RequestMetrics({
      url: config.get<string>('MONITORING_URL'),
      token: config.get<string>('MONITORING_TOKEN'),
      warn: message => this.logger.warn(message),
    });
  }

  onModuleInit(): void {
    if (!this.metrics.enabled) return;
    this.timer = setInterval(() => { void this.metrics.flush(); }, 30000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.metrics.flush();
  }
}
