import type { Request, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from './api-error.js';

export function validate(schema: ZodType, select: (request: Request) => unknown): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(select(request));
    if (!result.success) {
      next(
        new ApiError(
          400,
          'PEDIDO_INVALIDO',
          'Verifique os campos do pedido.',
          result.error.issues.map((issue) => ({
            campo: issue.path.length ? issue.path.join('.') : 'pedido',
            mensagem: 'Campo inválido ou não permitido.',
          })),
        ),
      );
      return;
    }
    response.locals.validated = result.data;
    next();
  };
}
