import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class VerifyTopupDto {
  @ApiProperty({
    description: 'Moyasar payment id returned by the hosted form / callback redirect',
    example: 'pay_7c1e8f2a9b3d4c5e6f7a8b9c',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^pay_[A-Za-z0-9]{10,60}$/, { message: 'paymentId must look like pay_<id>' })
  paymentId!: string;

  @ApiProperty({
    description: 'KoraLink top-up intent id this payment belongs to',
    example: 'b1e2c3d4-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  })
  // Reviewer A run-#173 MINOR: intent ids are varchar(36) UUIDs — validate
  // the SHAPE at the DTO wall (matches intent creation's contract; the
  // ownership join in the service stays the real authorization).
  @IsUUID()
  intentId!: string;
}
