import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { AdminSettingsService } from './settings.service';

@Controller('admin/settings')
@UseGuards(AdminAuthGuard)
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  getAll() {
    return this.settings.getAll();
  }

  @Put(':key')
  set(@Param('key') key: string, @Body() dto: UpdateSettingDto) {
    return this.settings.set(key, dto.value);
  }
}
