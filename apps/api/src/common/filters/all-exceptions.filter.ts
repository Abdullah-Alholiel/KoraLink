import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/node';
import type { Request } from 'express';

/**
 * Global exception filter — captures every unhandled error to Sentry with
 * requestId/userId correlation, logs it via Pino, then produces the standard
 * NestJS error response (so the API contract shape is unchanged).
 *
 * requestId is attached to `req.id` by the pino-http `genReqId` hook (see
 * `app.module.ts`). userId comes from the JWT guard (`req.user.sub`).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string; user?: { sub?: string } }>();
    const response = ctx.getResponse();

    if (Sentry.isInitialized()) {
      Sentry.captureException(exception, {
        extra: {
          requestId: request?.id,
          userId: request?.user?.sub,
          path: request?.url,
          method: request?.method,
        },
      });
    }

    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack, AllExceptionsFilter.name);
    } else {
      this.logger.error(JSON.stringify(exception), undefined, AllExceptionsFilter.name);
    }

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const responseBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: httpStatus, message: 'Internal server error' };

    httpAdapter.reply(response, responseBody, httpStatus);
  }
}
