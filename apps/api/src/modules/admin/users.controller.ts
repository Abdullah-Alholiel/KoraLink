import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserAdminDto } from './dto/update-user.dto';
import { BulkModerateUsersDto } from './dto/bulk-moderate.dto';
import { AdminUsersService } from './users.service';
import { UuidParamPipe } from '../../common/pipes/uuid-param.pipe';

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() dto: ListUsersDto) {
    return this.users.list(dto);
  }

  @Get(':id')
  findOne(@Param('id', UuidParamPipe) id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateUserAdminDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.users.update(id, dto, adminId, req.ip);
  }

  /**
   * P2-107 (run #116): bulk moderation — POST /admin/users/bulk.
   * Body/contract in BulkModerateUsersDto + users.service.bulkModerate.
   */
  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  bulkModerate(@Body() dto: BulkModerateUsersDto, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.users.bulkModerate(dto, adminId, req.ip);
  }

  /**
   * P2-47(b) (run #167): restore-on-behalf — PATCH /admin/users/:id/restore.
   * Cancels a scheduled PDPL purge / un-deletes a soft-deleted account
   * inside its grace window. Contract + guards in users.service.restoreByAdmin.
   * (`:id` above matches a single segment, so this subpath is unambiguous.)
   */
  @Patch(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', UuidParamPipe) id: string, @Req() req: Request) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.users.restoreByAdmin(id, adminId, req.ip);
  }
}
