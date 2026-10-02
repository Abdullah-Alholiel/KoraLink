import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SlotWindowQueryDto } from './dto/slots.dto';

/**
 * Run #94 (Reviewer-A P2-137): the shared schedule-window query DTO for
 * `GET /admin/pitches/:id/slots` + `GET /partner/pitches/:id/slots`.
 * Previously the raw `from`/`to` strings flowed into drizzle gte/lte on
 * slot_date — garbage values produced PG comparison errors (500) and a
 * reversed range silently returned an empty grid. Now: YYYY-MM-DD regex on
 * both + `from <= to` cross-field check.
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

  it('rejects a garbage date', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { ...ok, from: 'tomorrow' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'from')).toBe(true);
  });

  it('rejects a datetime-ish value (regex only — no range semantics)', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2026-10-01T00:00:00Z', to: '2026-10-08' });
    expect(validateSync(dto).some((e) => e.property === 'from')).toBe(true);
  });

  it('rejects a reversed range via the cross-field check', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: '2026-10-08', to: '2026-10-01' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'windowOrder')).toBe(true);
  });

  it('per-field regex still fires when the other field is missing', () => {
    const dto = plainToInstance(SlotWindowQueryDto, { from: 'garbage' });
    const errs = validateSync(dto);
    expect(errs.some((e) => e.property === 'from')).toBe(true);
    expect(errs.some((e) => e.property === 'to')).toBe(true);
    expect(errs.some((e) => e.property === 'windowOrder')).toBe(false);
  });
});
