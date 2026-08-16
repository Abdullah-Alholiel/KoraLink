import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { MetricsService } from './metrics.service';

@Controller('admin/metrics')
@UseGuards(AdminAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  getMetrics() {
    return this.metrics.getMetrics();
  }
}
