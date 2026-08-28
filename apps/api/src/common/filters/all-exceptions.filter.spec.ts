import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import { AllExceptionsFilter } from './all-exceptions.filter';

jest.mock('@sentry/node', () => ({
  isInitialized: jest.fn(() => true),
  captureException: jest.fn(),
}));

/**
 * 4xx noise-filter regression specs (KORALINK-API-4/…A cleanup). Expected
 * client/business rejections (validation, auth, not-found, forbidden, conflict)
 * must NOT be reported to Sentry — only 5xx and unexpected errors go up. The
 * HTTP response shape is unchanged either way.
 */
describe('AllExceptionsFilter Sentry noise filter', () => {
  const reply = jest.fn();
  const httpAdapter = { reply };
  const httpAdapterHost = { httpAdapter } as unknown as HttpAdapterHost;
  let filter: AllExceptionsFilter;

  function hostWith(request: Record<string, unknown>): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (Sentry.isInitialized as jest.Mock).mockReturnValue(true);
    filter = new AllExceptionsFilter(httpAdapterHost);
  });

  it('reports 5xx and unexpected errors to Sentry', () => {
    const err = new Error('boom');
    filter.catch(err, hostWith({ url: '/api/v1/matches', method: 'GET' }));
    expect(Sentry.captureException).toHaveBeenCalledWith(err, expect.any(Object));
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statusCode: 500 }),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('does NOT report a 400 business rejection to Sentry (noise filter)', () => {
    filter.catch(
      new BadRequestException('You cannot report yourself.'),
      hostWith({ url: '/api/v1/reports', method: 'POST' }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      HttpStatus.BAD_REQUEST,
    );
  });

  it('does NOT report a 401 auth rejection to Sentry (noise filter)', () => {
    filter.catch(
      new HttpException('Invalid or missing session cookie.', HttpStatus.UNAUTHORIZED),
      hostWith({ url: '/api/v1/matches', method: 'GET' }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      HttpStatus.UNAUTHORIZED,
    );
  });

  it('does NOT report a 403/404 to Sentry (noise filter)', () => {
    filter.catch(
      new ForbiddenException('Admin access required.'),
      hostWith({ url: '/api/v1/admin/users', method: 'GET' }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      HttpStatus.FORBIDDEN,
    );
  });

  it('still replies with the original 4xx body untouched', () => {
    const err = new HttpException({ statusCode: 404, message: 'Not found' }, HttpStatus.NOT_FOUND);
    filter.catch(err, hostWith({ url: '/api/v1/venues/nope', method: 'GET' }));
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      { statusCode: 404, message: 'Not found' },
      HttpStatus.NOT_FOUND,
    );
  });
});
