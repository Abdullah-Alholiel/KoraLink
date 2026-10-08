import { BadRequestException } from '@nestjs/common';
import { UuidParamPipe } from './uuid-param.pipe';
import { UUID_SHAPE_MSG } from '../validation/id-shape';

describe('UuidParamPipe (P2-164)', () => {
  const pipe = new UuidParamPipe();
  const valid = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';

  it('passes a lowercase UUID-shaped id through unchanged', () => {
    expect(pipe.transform(valid)).toBe(valid);
  });

  it('passes an uppercase UUID-shaped id through unchanged', () => {
    expect(pipe.transform(valid.toUpperCase())).toBe(valid.toUpperCase());
  });

  it.each([
    'not-an-id',
    '../../../etc/passwd',
    "'; DROP TABLE users;--",
    '',
    `${valid}0`,
    ` ${valid}`,
  ])('rejects malformed id %p with 400 + UUID_SHAPE_MSG', (bad) => {
    expect(() => pipe.transform(bad)).toThrow(BadRequestException);
    expect(() => pipe.transform(bad)).toThrow(UUID_SHAPE_MSG);
  });

  it('rejects non-string values', () => {
    expect(() => pipe.transform(undefined as unknown as string)).toThrow(BadRequestException);
  });
});
