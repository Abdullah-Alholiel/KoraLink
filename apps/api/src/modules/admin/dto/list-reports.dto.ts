import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { REPORT_SUBJECT_TYPES, ReportSubjectType } from '../../reports/dto/create-report.dto';

export class ListReportsDto {
  @ApiPropertyOptional({ enum: ['open', 'reviewing', 'resolved', 'dismissed'] })
  @IsOptional()
  @IsIn(['open', 'reviewing', 'resolved', 'dismissed'])
  status?: 'open' | 'reviewing' | 'resolved' | 'dismissed';

  @ApiPropertyOptional({ enum: REPORT_SUBJECT_TYPES })
  @IsOptional()
  @IsIn(REPORT_SUBJECT_TYPES)
  subjectType?: ReportSubjectType;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage: number = 20;
}
