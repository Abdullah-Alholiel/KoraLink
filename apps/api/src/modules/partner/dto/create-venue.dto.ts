import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVenueDto {
  @ApiProperty({ example: 'Olaya Sports Park' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'Riyadh' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'Prince Turki Rd, Olaya' })
  @IsString()
  @MinLength(4)
  address: string;
}
