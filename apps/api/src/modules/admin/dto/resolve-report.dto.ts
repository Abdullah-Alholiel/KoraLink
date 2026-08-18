import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveReportDto {
  @ApiProperty({ enum: ['resolved', 'dismissed'] })
  @IsIn(['resolved', 'dismissed'])
  outcome: 'resolved' | 'dismissed';

  @ApiPropertyOptional({ description: 'Resolution note / action taken' })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional({
    description: 'Also ban the reported user (user subjects only; requires outcome "resolved")',
  })
  @IsOptional()
  @IsBoolean()
  banSubject?: boolean;
}
