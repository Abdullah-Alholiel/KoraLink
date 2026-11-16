import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AdminAuditListService } from './audit-list.service';
import { ListAuditDto } from './dto/list-audit.dto';

/**
 * P2-292 (Reviewer A run #181 I-2, lifted run #186): queries moved to
 * AdminAuditListService (audit-list.service.ts) — the controller now delegates
 * like every other admin controller. See audit-list.service.ts for the
 * INNER→LEFT JOIN rider (PDPL purge no longer shrinks the trail) and the
 * AuditService naming note (audit.service.ts stays the append-only write trail).
 *
 * P2-308 (run #187): explicit @Throttle — this list previously rode only the
 * global 60/min throttle, unlike every other admin list (metrics 10/min,
 * transactions refund 10/min). Read-only but admin-scoped: 60/min route cap.
 */
@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard)
export class AdminAuditController {
  constructor(private readonly auditList: AdminAuditListService) {}

  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  list(@Query() dto: ListAuditDto) {
    return this.auditList.list(dto);
  }
}
