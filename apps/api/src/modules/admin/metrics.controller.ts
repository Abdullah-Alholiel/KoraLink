import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { MetricsService } from './metrics.service';

@Controller('admin/metrics')
@UseGuards(AdminAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // P2-248 (run #180, Reviewer A run-#158 item 3): aggregate-only endpoint —
  // route-level 10/min cap (the admin dashboard's live hook polls every 30s =
  // 2/min, well under it; blunts hammering of an all-tables aggregation).
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  getMetrics() {
    return this.metrics.getMetrics();
  }
}
