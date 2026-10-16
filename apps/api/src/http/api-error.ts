export interface InvalidField {
  campo: string;
  mensagem: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly campos?: InvalidField[],
  ) {
    super(mensagem);
    this.name = 'ApiError';
  }
}
