import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Days of week: 0=Sunday … 6=Saturday */
const DAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;

export class GenerateSlotsDto {
  @ApiProperty({ enum: DAY_VALUES, isArray: true, example: [0, 2, 4] })
  @IsArray()
  @IsIn(DAY_VALUES as unknown as number[], { each: true })
  days_of_week: number[];

  @ApiProperty({ example: '16:00', description: 'Window start HH:MM' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'start_time must be HH:MM' })
  start_time: string;

  @ApiProperty({ example: '23:00', description: 'Window end HH:MM' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'end_time must be HH:MM' })
  end_time: string;

  @ApiProperty({ example: 60, description: 'Slot length in minutes (30–180)' })
  @IsInt()
  @Min(30)
  @Max(180)
  slot_duration_mins: number;

  @ApiProperty({ example: 4, description: 'Generate this many weeks ahead (1–12)' })
  @IsInt()
  @Min(1)
  @Max(12)
  weeks_ahead: number;
}

export class CreateSlotDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'slot_date must be YYYY-MM-DD' })
  slot_date: string;

  @ApiProperty({ example: '18:30' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'start_time must be HH:MM' })
  start_time: string;

  @ApiProperty({ example: '20:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'end_time must be HH:MM' })
  end_time: string;
}

/**
 * Run #94 (Reviewer-A P2-137): validated slot-window query shared by BOTH
 * schedule endpoints — `GET /admin/pitches/:id/slots` and
 * `GET /partner/pitches/:id/slots`. Previously each controller passed the raw
 * `@Query('from')/@Query('to')` strings straight into drizzle gte/lte on
 * slot_date: a garbage value produced a PG comparison error (500) and a
 * reversed range silently returned an empty schedule. Both fields must be
 * REAL YYYY-MM-DD calendar dates (format + month/day round-trip — PR-Agent
 * run #94: `2026-02-31` passes a shape-only regex but still 500s in the PG
 * date cast) and `from <= to` is enforced so a reversed range is a clear 400.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shape + calendar round-trip in one predicate (shared by both constraints). */
function isCalendarRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

@ValidatorConstraint({ name: 'slotCalendarDate', async: false })
export class SlotCalendarDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCalendarRealDate(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a real YYYY-MM-DD calendar date`;
  }
}

@ValidatorConstraint({ name: 'slotWindowOrder', async: false })
class SlotWindowOrderConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const o = args.object as { from?: string; to?: string };
    // Format/calendar errors are reported per-field — skip the cross-field
    // check unless both sides are REAL dates (PR-Agent round 2: comparing a
    // calendar-invalid 'from' like 2026-02-31 against an earlier valid 'to'
    // used to stack a spurious order error on top of the calendar error).
    if (!isCalendarRealDate(o.from) || !isCalendarRealDate(o.to)) return true;
    return o.from <= o.to;
  }

  defaultMessage(): string {
    return 'from must be on or before to';
  }
}

export class SlotWindowQueryDto {
  @ApiProperty({ example: '2026-10-01', description: 'Window start (inclusive) YYYY-MM-DD' })
  @IsString()
  @Validate(SlotCalendarDateConstraint)
  from: string;

  @ApiProperty({ example: '2026-10-08', description: 'Window end (inclusive) YYYY-MM-DD' })
  @IsString()
  @Validate(SlotCalendarDateConstraint)
  @Validate(SlotWindowOrderConstraint)
  to: string;
}

export class UpdateVenuePartnerDto {
  @ApiPropertyOptional({ example: 'Olaya Sports Park' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'Riyadh' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  city?: string;

  @ApiPropertyOptional({ example: 'Prince Turki Rd, Olaya' })
  @IsOptional()
  @IsString()
  @MinLength(4)
  address?: string;

  @ApiPropertyOptional({ example: ['parking', 'showers', 'cafe'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  // P1-25 venue operating hours (Riyadh-local 24h ints; close exclusive, 24 = midnight).
  @ApiPropertyOptional({ example: 8, description: 'Daily opening hour 0-23' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  open_hour?: number;

  @ApiPropertyOptional({ example: 23, description: 'Daily closing hour 1-24 (exclusive; 24 = midnight)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  close_hour?: number;

  @ApiPropertyOptional({ example: true, description: 'Venue closed all day on Sunday (0=Sun … 6=Sat)' })
  @IsOptional()
  @IsBoolean()
  closed_day_0?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Venue closed all day on Monday' })
  @IsOptional()
  @IsBoolean()
  closed_day_1?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Venue closed all day on Tuesday' })
  @IsOptional()
  @IsBoolean()
  closed_day_2?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Venue closed all day on Wednesday' })
  @IsOptional()
  @IsBoolean()
  closed_day_3?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Venue closed all day on Thursday' })
  @IsOptional()
  @IsBoolean()
  closed_day_4?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Venue closed all day on Friday' })
  @IsOptional()
  @IsBoolean()
  closed_day_5?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Venue closed all day on Saturday' })
  @IsOptional()
  @IsBoolean()
  closed_day_6?: boolean;
}
