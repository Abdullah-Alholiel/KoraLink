import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AdminAuditListService } from './audit-list.service';
import { ListAuditDto } from './dto/list-audit.dto';

/**
 * P2-292 (Reviewer A run #181 I-2, lifted run #186): queries moved to
 * AdminAuditListService (audit-list.service.ts) — the controller now delegates
 * like every other admin controller. See audit-list.service.ts for the
 * INNER→LEFT JOIN rider (PDPL purge no longer shrinks the trail) and the
 * AuditService naming note (audit.service.ts stays the append-only write trail).
 */
@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard)
export class AdminAuditController {
  constructor(private readonly auditList: AdminAuditListService) {}

  @Get()
  list(@Query() dto: ListAuditDto) {
    return this.auditList.list(dto);
  }
}
