import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * P1-55 (run #117): body of POST /venues/:id/reviews.
 *
 * rating is required 1..5 (CHECK also enforced at the DB layer); comment is
 * optional free text, hard-capped at 500 chars (the column's limit) so the
 * DB can never truncate silently.
 */
export class CreateVenueReviewDto {
  @ApiProperty({ description: 'Star rating 1..5', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: 'Optional review text', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string | null;
}
