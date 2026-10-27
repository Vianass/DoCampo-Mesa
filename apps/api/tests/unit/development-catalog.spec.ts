import { describe, expect, it } from 'vitest';
import {
  assertLocalSeed,
  developmentCategory,
  developmentId,
  developmentUnit,
} from '../../src/development/catalog-seed.js';
const local = 'mongodb://127.0.0.1:27018/?replicaSet=rs-dcm-dev&directConnection=true';
describe('seed manual de desenvolvimento', () => {
  it('aceita apenas a base dedicada, o ambiente development e o MongoDB local esperado', () => {
    expect(() => assertLocalSeed('development', local, 'docampo_dev_catalog')).not.toThrow();
  });
  it.each([
    ['production', local, 'docampo_dev_catalog'],
    ['test', local, 'docampo_dev_catalog'],
    [undefined, local, 'docampo_dev_catalog'],
    ['development', local, 'docampo_dev'],
    ['development', local, 'production'],
    [
      'development',
      'mongodb://remote.example.invalid:27018/?replicaSet=rs-dcm-dev&directConnection=true',
      'docampo_dev_catalog',
    ],
    [
      'development',
      'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      'docampo_dev_catalog',
    ],
    [
      'development',
      'mongodb://user:password@127.0.0.1:27018/?replicaSet=rs-dcm-dev&directConnection=true',
      'docampo_dev_catalog',
    ],
  ])('recusa destinos ou contextos não autorizados', (env, uri, db) => {
    expect(() => assertLocalSeed(env, uri, db!)).toThrow();
  });
  it('IDs são estáveis, separados por entidade e não dependem de renomear o nome público', () => {
    expect(developmentId('product', 'stable-key')).toEqual(developmentId('product', 'stable-key'));
    expect(developmentId('user', 'stable-key')).not.toEqual(
      developmentId('producer', 'stable-key'),
    );
  });
  it('mapeia explicitamente categorias antigas sem confundir farinha com pão', () => {
    expect(developmentCategory('Pão e cereais', 'kg')).toBe('cat-003');
    expect(developmentCategory('Pão e cereais', 'unidade')).toBe('cat-004');
    expect(() => developmentCategory('Inventada', 'kg')).toThrow();
  });
  it('conserva preço por kg/L e apresentações comerciais sem inventar o conteúdo', () => {
    expect(developmentUnit('kg')).toMatchObject({ unidadeBase: 'g', quantidadeReferencia: 1000 });
    expect(developmentUnit('L')).toMatchObject({ unidadeBase: 'ml', quantidadeReferencia: 1000 });
    expect(developmentUnit('unidade')).toMatchObject({
      modalidade: 'unidade',
      quantidadeReferencia: 1,
    });
    expect(developmentUnit('frasco de 500 g')).toMatchObject({
      modalidade: 'embalagem',
      rotulo: 'frasco de 500 g',
      quantidadeReferencia: 1,
    });
    expect(developmentUnit('frasco de 500 g')).not.toHaveProperty('conteudoPorUnidade');
  });
});
