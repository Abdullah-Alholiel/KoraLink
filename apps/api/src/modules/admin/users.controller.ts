import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserAdminDto } from './dto/update-user.dto';
import { AdminUsersService } from './users.service';

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() dto: ListUsersDto) {
    return this.users.list(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserAdminDto,
    @Req() req: Request,
  ) {
    const adminId = (req as unknown as { user: { sub: string } }).user.sub;
    return this.users.update(id, dto, adminId, req.ip);
  }
}
