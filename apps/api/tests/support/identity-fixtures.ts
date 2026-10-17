import { Types } from 'mongoose';
import type { UserRole } from '../../src/modules/users/user.model.js';

// Constante pública fictícia para testar apenas formato/persistência, sem hashing ou login.
export const testPasswordHash = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

export function userInput(overrides: Record<string, unknown> = {}) {
  return {
    nome: 'Pessoa fictícia de teste',
    emailNormalizado: 'conta@example.invalid',
    passwordHash: testPasswordHash,
    papeis: ['comprador', 'produtor'] as UserRole[],
    ...overrides,
  };
}

export function producerInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: new Types.ObjectId(),
    nomePublico: 'Exploração fictícia de teste',
    localidade: 'Localidade de teste',
    concelho: 'Concelho de teste',
    descricao: 'Descrição fictícia da atividade agrícola.',
    telefone: '+351 000 000 000',
    ...overrides,
  };
}

export function decisionInput(overrides: Record<string, unknown> = {}) {
  return {
    estado: 'aprovado',
    submetidaEm: new Date('2026-10-10T09:00:00Z'),
    decisao: { autor: new Types.ObjectId(), data: new Date('2026-10-11T09:00:00Z') },
    ...overrides,
  };
}
