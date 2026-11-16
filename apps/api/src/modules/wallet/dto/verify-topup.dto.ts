import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class VerifyTopupDto {
  @ApiProperty({
    description: 'Moyasar payment id returned by the hosted form / callback redirect',
    example: '94924fcf-64c5-4b0f-9472-eed05cae5ee2',
  })
  @IsString()
  @IsNotEmpty()
  // Moyasar payment ids are UUIDs (checked against the sandbox API 2026-11-13: every id
  // returned by GET /v1/payments is UUID-shaped). The original `pay_<id>` pattern was a
  // guess: it made POST /wallet/topup/verify answer 400 for EVERY real payment, so a paid
  // top-up was only ever credited by the 5-minute reconcile sweep. The legacy shape stays
  // accepted for older fixtures; the id is URL-encoded before it reaches Moyasar and an
  // unknown id is a 404 there, so the shape check is hygiene, not the authorization.
  @Matches(
    /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|pay_[A-Za-z0-9]{10,60})$/,
    { message: 'paymentId must be a Moyasar payment id' },
  )
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
