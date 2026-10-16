import type { ErrorRequestHandler } from 'express';
import { ApiError } from './api-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    response.status(error.status).json({
      codigo: error.codigo,
      mensagem: error.message,
      ...(error.campos ? { campos: error.campos } : {}),
    });
    return;
  }

  const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
  if (type === 'entity.parse.failed') {
    response
      .status(400)
      .json({ codigo: 'JSON_INVALIDO', mensagem: 'O corpo do pedido não contém JSON válido.' });
    return;
  }
  if (type === 'entity.too.large') {
    response.status(413).json({
      codigo: 'PEDIDO_DEMASIADO_GRANDE',
      mensagem: 'O corpo do pedido excede o limite permitido.',
    });
    return;
  }

  response
    .status(500)
    .json({ codigo: 'ERRO_INTERNO', mensagem: 'Não foi possível concluir o pedido.' });
};
