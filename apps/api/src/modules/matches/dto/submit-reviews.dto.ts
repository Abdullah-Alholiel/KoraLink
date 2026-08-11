import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ReviewItemDto {
  @IsString()
  revieweeId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class SubmitReviewsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewItemDto)
  reviews!: ReviewItemDto[];
}
