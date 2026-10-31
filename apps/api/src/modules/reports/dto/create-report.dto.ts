import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export const REPORT_SUBJECT_TYPES = ['user', 'match', 'venue', 'message'] as const;
export type ReportSubjectType = (typeof REPORT_SUBJECT_TYPES)[number];

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_SUBJECT_TYPES, description: 'Kind of subject being reported (user / match / venue / chat message)' })
  @IsIn(REPORT_SUBJECT_TYPES)
  subjectType: ReportSubjectType;

  @ApiProperty({ description: 'ID of the reported subject (user / match / venue / message)' })
  // P2-113 (run #77, Reviewer A): subjectId binds against varchar(36) id columns —
  // shape-validate (36 hex/dash chars, no UUID-scheme decorator) + bound at 36,
  // mirroring the run-#73 CastVoteDto/MarkNoShowDto id convention.
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'subjectId must be a 36-char UUID-shaped id',
  })
  @MaxLength(36)
  subjectId: string;

  @ApiProperty({ description: 'Reason for the report' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
