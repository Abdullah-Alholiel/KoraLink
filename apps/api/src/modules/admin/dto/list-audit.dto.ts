import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
    description: 'P2-335: only include logs created on/after this date (UTC, YYYY-MM-DD).',
  })
  @IsOptional()
  @Matches(AUDIT_DATE_SHAPE, { message: 'from must be a YYYY-MM-DD date' })
  @MaxLength(10)
  from?: string;

  @ApiPropertyOptional({
    description: 'P2-335: only include logs created on/before this date (UTC, YYYY-MM-DD).',
  })
  @IsOptional()
  @Matches(AUDIT_DATE_SHAPE, { message: 'to must be a YYYY-MM-DD date' })
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
