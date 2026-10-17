import { Schema } from 'mongoose';
import type { Connection, HydratedDocument, Model, SchemaTypeOptions } from 'mongoose';
import { createProducerModel } from '../producers/producer.model.js';
import { requireDocumentValidation, textField } from '../shared/model-validation.js';
import { createUserModel } from '../users/user.model.js';
import {
  maximumProductPriceCents,
  minimumProductPriceCents,
  productCategories,
  productStates,
  saleDefinitions,
  saleModalities,
} from './product.constants.js';
import type { ProductImage, ProductRecord, SaleUnitRecord } from './product.types.js';

type UnitDocument = HydratedDocument<SaleUnitRecord> & {
  ownerDocument(): HydratedDocument<ProductRecord>;
};

function publishedProduct(this: ProductRecord) {
  return this.estadoPublicacao === 'publicado';
}

function publishedUnit(this: SaleUnitRecord) {
  return (this as UnitDocument).ownerDocument().estadoPublicacao === 'publicado';
}

function integerField(minimum: number): SchemaTypeOptions<number> {
  return {
    type: Number,
    cast: false,
    min: minimum,
    validate: { validator: Number.isSafeInteger, message: 'É necessário um inteiro seguro.' },
  };
}

export function createProductModel(connection: Connection): Model<ProductRecord> {
  const existing = connection.models.Product as Model<ProductRecord> | undefined;
  if (existing) return existing;
  const User = createUserModel(connection);
  const Producer = createProducerModel(connection);

  const contentSchema = new Schema<NonNullable<SaleUnitRecord['conteudoPorUnidade']>>(
    {
      quantidade: { ...integerField(1), required: true },
      unidade: { type: String, enum: ['g', 'ml', 'un'], required: true, cast: false },
    },
    { _id: false, versionKey: false, strict: 'throw' },
  );
  const unitSchema = new Schema<SaleUnitRecord>(
    {
      modalidade: { type: String, enum: saleModalities, cast: false, required: publishedUnit },
      unidadeBase: {
        type: String,
        enum: ['g', 'ml', 'un'],
        cast: false,
        required: publishedUnit,
        default(this: SaleUnitRecord) {
          return this.modalidade && saleDefinitions[this.modalidade]?.unidadeBase;
        },
      },
      quantidadeReferencia: {
        ...integerField(1),
        required: publishedUnit,
        default(this: SaleUnitRecord) {
          return this.modalidade && saleDefinitions[this.modalidade]?.quantidadeReferencia;
        },
      },
      quantidadeMinima: { ...integerField(1), required: publishedUnit },
      incrementoCompra: { ...integerField(1), required: publishedUnit },
      rotulo: textField('unidadeVenda.rotulo', undefined, false),
      conteudoPorUnidade: {
        type: contentSchema,
        default: undefined,
      },
    },
    { _id: false, versionKey: false, strict: 'throw' },
  );
  unitSchema.path('unidadeBase').validate({
    validator(this: SaleUnitRecord, value?: string) {
      return !this.modalidade || value === saleDefinitions[this.modalidade]?.unidadeBase;
    },
    message: 'A unidade base deve corresponder à modalidade de venda.',
  });
  unitSchema.path('quantidadeReferencia').validate({
    validator(this: SaleUnitRecord, value?: number) {
      return (
        Number.isSafeInteger(value) &&
        (!this.modalidade || value === saleDefinitions[this.modalidade]?.quantidadeReferencia)
      );
    },
    message: 'Preço por 1 kg, 1 L, uma unidade ou uma embalagem, conforme a modalidade.',
  });
  unitSchema.path('conteudoPorUnidade').validate({
    validator(this: SaleUnitRecord) {
      return !this.modalidade || ['unidade', 'embalagem'].includes(this.modalidade);
    },
    message: 'Conteúdo por unidade só se aplica à venda por unidade ou embalagem.',
  });

  const imageSchema = new Schema<ProductImage>(
    {
      url: {
        ...textField('imagens.url'),
        validate: {
          validator(value: string) {
            try {
              const url = new URL(value);
              return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
            } catch {
              return false;
            }
          },
          message: 'É necessário um URL HTTP(S) sem credenciais.',
        },
      },
      alt: textField('imagens.alt', undefined, false),
      principal: { type: Boolean, cast: false, default: false },
    },
    { _id: false, versionKey: false, strict: 'throw' },
  );

  const schema = new Schema<ProductRecord>(
    {
      produtor: { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
      nome: textField('nome'),
      estadoPublicacao: {
        type: String,
        enum: productStates,
        cast: false,
        required: true,
        default: 'rascunho',
      },
      descricao: { ...textField('descricao', undefined, false), required: publishedProduct },
      categoriaId: {
        type: String,
        enum: productCategories.map((category) => category.id),
        cast: false,
        required: publishedProduct,
      },
      precoCent: {
        ...integerField(minimumProductPriceCents),
        max: maximumProductPriceCents,
        required: publishedProduct,
      },
      moeda: { type: String, enum: ['EUR'], cast: false, required: true, default: 'EUR' },
      unidadeVenda: { type: unitSchema, default: undefined, required: publishedProduct },
      stockDisponivel: {
        ...integerField(0),
        required: publishedProduct,
      },
      ingredientesAplicaveis: {
        type: Boolean,
        cast: false,
        default: undefined,
        required: publishedProduct,
      },
      ingredientes: {
        type: [textField('ingredientes')],
        castNonArrays: false,
        default: [],
      },
      etiquetas: {
        type: [textField('etiquetas')],
        castNonArrays: false,
        default: [],
        validate: { validator: Array.isArray, message: 'As etiquetas devem ser uma lista.' },
      },
      epocaMeses: {
        type: [{ ...integerField(1), max: 12 }],
        castNonArrays: false,
        default: undefined,
        validate: {
          validator: (values: number[]) =>
            Array.isArray(values) && new Set(values).size === values.length,
          message: 'Lista de meses sem repetições.',
        },
      },
      modoProducao: textField('modoProducao', undefined, false),
      imagens: {
        type: [imageSchema],
        castNonArrays: false,
        default: [],
      },
    },
    {
      collection: 'products',
      timestamps: true,
      strict: 'throw',
      autoCreate: false,
      autoIndex: false,
      bufferCommands: false,
    },
  );
  schema.path('stockDisponivel').validate({
    validator(this: ProductRecord, value?: number) {
      const modality = this.unidadeVenda?.modalidade;
      const maximum = modality && saleDefinitions[modality]?.stockMaximo;
      return (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= (maximum ?? 10_000_000)
      );
    },
    message: 'Stock inteiro não negativo e dentro do limite da modalidade.',
  });
  schema.path('ingredientes').validate({
    validator(this: ProductRecord, values: string[]) {
      if (!Array.isArray(values)) return false;
      if (this.estadoPublicacao !== 'publicado') return true;
      return this.ingredientesAplicaveis === true ? values.length > 0 : values.length === 0;
    },
    message: 'Os ingredientes devem ser coerentes com a declaração de aplicabilidade.',
  });
  schema.path('imagens').validate({
    validator(this: ProductRecord, values: ProductImage[]) {
      return (
        Array.isArray(values) &&
        values.every((value) => value != null) &&
        values.length <= 2 &&
        values.filter((value) => value.principal).length <= 1 &&
        (this.estadoPublicacao !== 'publicado' || values.length >= 1)
      );
    },
    message: 'Até duas fotografias, no máximo uma principal e pelo menos uma para publicar.',
  });

  schema.path('estadoPublicacao').validate({
    async validator(this: ProductRecord, state: string) {
      if (state !== 'publicado') return true;
      if (!this.produtor) return false;
      const session = (this as HydratedDocument<ProductRecord>).$session();
      const account = User.exists({ _id: this.produtor, papeis: 'produtor' });
      if (session) account.session(session);
      if (!(await account)) return false;
      const profile = Producer.exists({ userId: this.produtor, 'aprovacao.estado': 'aprovado' });
      if (session) profile.session(session);
      return Boolean(await profile);
    },
    message: 'Publicar exige conta produtora e perfil aprovado na mesma identidade.',
  });
  schema.pre('save', function () {
    // Uma projeção não contém informação suficiente para revalidar a publicação.
    const requiredSelection = [
      'estadoPublicacao',
      'produtor',
      'nome',
      'descricao',
      'categoriaId',
      'precoCent',
      'moeda',
      'stockDisponivel',
      'ingredientesAplicaveis',
      'ingredientes',
      'imagens',
      'unidadeVenda.modalidade',
      'unidadeVenda.unidadeBase',
      'unidadeVenda.quantidadeReferencia',
      'unidadeVenda.quantidadeMinima',
      'unidadeVenda.incrementoCompra',
    ];
    if (!this.isNew && requiredSelection.some((path) => !this.isSelected(path))) {
      throw new Error(
        'Guardar produtos exige um documento completo, sem projeção dos campos de publicação.',
      );
    }
  });
  schema.index({ produtor: 1, estadoPublicacao: 1 });
  schema.index({ estadoPublicacao: 1, categoriaId: 1 });
  requireDocumentValidation(schema);
  return connection.model<ProductRecord>('Product', schema);
}
