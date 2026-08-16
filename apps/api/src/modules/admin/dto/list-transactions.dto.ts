import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListTransactionsDto {
  @ApiPropertyOptional({ enum: ['Pending', 'Completed', 'Failed', 'Reversed'] })
  @IsOptional()
  @IsIn(['Pending', 'Completed', 'Failed', 'Reversed'])
  status?: 'Pending' | 'Completed' | 'Failed' | 'Reversed';

  @ApiPropertyOptional({ enum: ['CREDIT', 'DEBIT'] })
  @IsOptional()
  @IsIn(['CREDIT', 'DEBIT'])
  type?: 'CREDIT' | 'DEBIT';

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
