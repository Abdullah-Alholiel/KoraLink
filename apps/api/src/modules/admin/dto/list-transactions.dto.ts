import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListTransactionsDto {
  @ApiPropertyOptional({ enum: ['Pending', 'Completed', 'Failed', 'Reversed'] })
  @IsOptional()
  @IsIn(['Pending', 'Completed', 'Failed', 'Reversed'])
  status?: 'Pending' | 'Completed' | 'Failed' | 'Reversed';

  @ApiPropertyOptional({ enum: ['CREDIT', 'DEBIT'] })
  @IsOptional()
  @IsIn(['CREDIT', 'DEBIT'])
  type?: 'CREDIT' | 'DEBIT';

  @ApiPropertyOptional({ description: 'Sort key (whitelist enforced server-side; unknown → default order)' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

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
