import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

/** P2-335: date-range filter shape (YYYY-MM-DD), shared by from/to. */
const AUDIT_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * P2-335 r1 (PR-Agent #235 IMPORTANT): the shape regex alone accepts
 * calendar-invalid dates (2026-02-30, 2026-13-01) which pass validation and
 * then make the Postgres ::date cast THROW — an unhandled 500 instead of the
 * promised 400. Deterministic round-trip check: parse as UTC midnight and
 * require the ISO round-trip to reproduce the exact input (rejects rollover
 * dates like 2026-02-30 → 2026-03-02 and out-of-range months).
 */
@ValidatorConstraint({ name: 'auditCalendarDate', async: false })
class AuditCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value?: string): boolean {
    if (typeof value !== 'string' || !AUDIT_DATE_SHAPE.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  defaultMessage(): string {
    return 'from/to must be a valid calendar date in YYYY-MM-DD form';
  }
}

/**
 * Entity types that exist in the audit trail (audit.service.ts write sites).
 * P2-308 (run #187, Reviewer B): entityType was a bare @IsString — a non-UI
 * caller could probe arbitrary entity_type strings and get silent empty
 * results. The admin console UI already sends only these 11 values (its
 * ENTITY_TYPES select), so narrowing the API cannot break the console.
 */
export const AUDIT_ENTITY_TYPES = [
  'dispute',
  'match',
  'pitch',
  'report',
  'setting',
  'settlement',
  'slot',
  'transaction',
  'user',
  'venue',
  'venue_review',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export class ListAuditDto {
  @ApiPropertyOptional({ description: 'Filter to one admin (36-char UUID-shaped id).' })
  @IsOptional()
  // P2-308: a malformed id silently matched nothing before — shape-validate it
  // so callers get an explicit 400. House convention (dto-caps.spec.ts, run
  // #94): UUID-shape regex + @MaxLength(36), NEVER @IsUUID (ids are
  // varchar(36); validation only — the SQL comparison stays text-safe).
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'adminId must be a 36-char UUID-shaped id',
  })
  @MaxLength(36)
  adminId?: string;

  @ApiPropertyOptional({
    enum: AUDIT_ENTITY_TYPES,
    description: 'Filter to one audited entity type.',
  })
  @IsOptional()
  @IsIn(AUDIT_ENTITY_TYPES as unknown as string[])
  entityType?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive substring match on the action name.' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: 'P2-335: only include logs created on/after this date (UTC day, YYYY-MM-DD).',
  })
  @IsOptional()
  @Validate(AuditCalendarDateConstraint)
  @MaxLength(10)
  from?: string;

  @ApiPropertyOptional({
    description: 'P2-335: only include logs created on/before this date (UTC day, YYYY-MM-DD).',
  })
  @IsOptional()
  @Validate(AuditCalendarDateConstraint)
  @MaxLength(10)
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  perPage: number = 50;
}
