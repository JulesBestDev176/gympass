import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Erreur interne du serveur';

    // ── Logging détaillé uniquement pour les 500 ──────────────────────────────
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      const sensitive = /\/(?:auth|users)(?:\/|$)/.test(request.url.split('?')[0]);
      const err = (sensitive ? new Error('Détails sensibles masqués sur ce parcours de compte.') : exception) as any;

      // Contexte de la requête
      const reqInfo = `${request.method} ${request.url.split('?')[0]}`;
      const body = sensitive ? '[masqué]' : request.body && Object.keys(request.body).length
        ? JSON.stringify(request.body)
        : '(no body)';

      this.logger.error(`━━━ 500 Internal Server Error ━━━`);
      this.logger.error(`Request : ${reqInfo}`);
      this.logger.error(`Body    : ${body}`);

      // Nom et message de l'erreur principale
      this.logger.error(`Error   : ${err?.constructor?.name ?? typeof err} — ${err?.message ?? err}`);

      // Stack trace de l'erreur principale
      if (err?.stack) {
        this.logger.error(`Stack   :\n${err.stack}`);
      }

      // AggregateError : itérer les erreurs internes
      if (err?.errors && Array.isArray(err.errors)) {
        err.errors.forEach((inner: any, i: number) => {
          this.logger.error(
            `  [cause ${i + 1}] ${inner?.constructor?.name ?? typeof inner} — ${inner?.message ?? inner}`,
          );
          if (inner?.stack) {
            this.logger.error(`  [cause ${i + 1} stack]\n${inner.stack}`);
          }
        });
      }

      // Cause chaînée (Error.cause)
      if (err?.cause) {
        const cause = err.cause as any;
        this.logger.error(
          `Cause   : ${cause?.constructor?.name ?? typeof cause} — ${cause?.message ?? cause}`,
        );
        if (cause?.stack) {
          this.logger.error(`Cause stack:\n${cause.stack}`);
        }
      }

      this.logger.error(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    } else {
      // 4xx : log court pour ne pas polluer
      this.logger.warn(
        `${status} ${request.method} ${request.url} — ${
          typeof message === 'object' ? JSON.stringify(message) : message
        }`,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'object' ? (message as any).message : message,
    });
  }
}
