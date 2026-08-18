import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';

export const REPORT_SUBJECT_TYPES = ['user', 'match', 'venue'] as const;
export type ReportSubjectType = (typeof REPORT_SUBJECT_TYPES)[number];

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_SUBJECT_TYPES, description: 'Kind of subject being reported' })
  @IsIn(REPORT_SUBJECT_TYPES)
  subjectType: ReportSubjectType;

  @ApiProperty({ description: 'ID of the reported subject (user / match / venue)' })
  @IsString()
  subjectId: string;

  @ApiProperty({ description: 'Reason for the report' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
