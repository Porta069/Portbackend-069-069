import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomToken } from '../crypto/crypto.util';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  correlationId: string;
  timestamp: string;
}

/**
 * Catches every unhandled error and returns a safe, uniform JSON envelope.
 * Internal (non-HttpException) errors never leak their message or stack to the
 * client — the full detail is logged server-side against a correlation id.
 */
/**
 * Pfad ohne Query — Query-Parameter tragen hier echte personenbezogene Daten
 * (Standortkoordinaten, gesuchte E-Mail-Adressen) und gehören nicht ins Log.
 */
function safePath(url: string | undefined): string {
  return (url ?? '').split('?')[0];
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = randomToken(8);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      error = exception.name;
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const r = res as Record<string, unknown>;
        message = (r.message as string | string[]) ?? exception.message;
        if (typeof r.error === 'string') error = r.error;
      }
    }

    // Log full detail server-side only.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${correlationId}] ${request.method} ${safePath(request.url)} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${correlationId}] ${request.method} ${safePath(request.url)} -> ${status}: ${
          Array.isArray(message) ? message.join('; ') : message
        }`,
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }
}
