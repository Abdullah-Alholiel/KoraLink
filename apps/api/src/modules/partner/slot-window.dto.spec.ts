import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SlotWindowQueryDto } from './dto/slots.dto';

/**
 * Run #94 (Reviewer-A P2-137): the shared schedule-window query DTO for
 * `GET /admin/pitches/:id/slots` + `GET /partner/pitches/:id/slots`.
 * Previously the raw `from`/`to` strings flowed into drizzle gte/lte on
 * slot_date — garbage values produced PG comparison errors (500) and a
 * reversed range silently returned an empty grid. Now: REAL YYYY-MM-DD
 * calendar dates (format + month/day round-trip) + `from <= to`.
 * Contract notes (PR-Agent round 1, both addressed):
 * - calendar-invalid dates (`2026-02-31`) are rejected per-field;
 * - the order error reports on `to` (a field the client actually sends),
 *   never a phantom property, and never fires next to a format error.
 */
describe('SlotWindowQueryDto (run #94 window contract)', () => {
  const ok = { from: '2026-10-01', to: '2026-10-08' };

  it('accepts a valid window', () => {
    const dto = plainToInstance(SlotWindowQueryDto, ok);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts a same-day window (from == to)', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2026-10-01', to: '2026-10-01' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('accepts a leap-day date', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2028-02-29', to: '2028-03-01' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a garbage date', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { ...ok, from: 'tomorrow' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'from')).toBe(true);
  });

  it('rejects a calendar-invalid date (2026-02-31)', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2026-02-31', to: '2026-10-08' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'from')).toBe(true);
    // No spurious order error next to the format error.
    expect(errs.some((e) => e.constraints?.['slotWindowOrder'])).toBe(false);
  });

  it('rejects a month-13 date', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2026-13-01', to: '2026-10-08' });
    expect(validateSync(dto).some((e) => e.property === 'from')).toBe(true);
  });

  it('rejects a datetime-ish value (strict shape)', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2026-10-01T00:00:00Z', to: '2026-10-08' });
    expect(validateSync(dto).some((e) => e.property === 'from')).toBe(true);
  });

  it('rejects a reversed range — reported on `to`, no phantom field', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2026-10-08', to: '2026-10-01' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'to' && e.constraints?.['slotWindowOrder'])).toBe(true);
    expect(errs.every((e) => e.property !== 'windowOrder')).toBe(true);
  });

  it('order check skips when a field is missing (missing-field error still fires)', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2026-10-01' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'to')).toBe(true);
    expect(errs.every((e) => e.property !== 'windowOrder')).toBe(true);
  });
});
