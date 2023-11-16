import { GeneratorOptions } from '@prisma/generator-helper';
import { DMMF } from '@prisma/client/runtime';
import prettier from 'prettier';
import fse from 'fs-extra';
import appRoot from 'app-root-path';
import { ok } from 'assert';

const defaultPrismaFieldTypes = [
  'BigInt',
  'Boolean',
  'Bytes',
  'DateTime',
  'Decimal',
  'Float',
  'Int',
  'Json',
  'String',
] as const;

type DefaultPrismaFieldType = (typeof defaultPrismaFieldTypes)[number];

const primitiveMapType: Record<DefaultPrismaFieldType, string> = {
  Int: 'number',
  String: 'string',
  DateTime: 'Date',
  Boolean: 'boolean',
  Json: 'object',
  BigInt: 'BigInt',
  Float: 'number',
  Decimal: 'number',
  Bytes: 'Buffer',
} as const;

const primitiveMapDecorators: Record<DefaultPrismaFieldType, string> = {
  Int: 'IsInt',
  String: 'IsString',
  DateTime: 'IsISO8601',
  Boolean: 'IsBoolean',
  Json: 'IsObject',
  BigInt: 'IsInt',
  Float: 'IsNumber',
  Decimal: 'IsNumber',
  Bytes: 'IsString',
} as const;

const MODELS_DIR = 'models';
const ENUMS_DIR = 'enums';

const isDefaultPrismaFieldType = (
  type: string,
): type is DefaultPrismaFieldType =>
  defaultPrismaFieldTypes.includes(type as DefaultPrismaFieldType);

const isOptional = (field: DMMF.Field) =>
  !field.isRequired ||
  (!isDefaultPrismaFieldType(field.type) && field.kind !== 'enum');

const getDecoratorArgs = (field: DMMF.Field) => {
  if (!field.isList) {
    return '';
  }

  return '{ each: true }';
};

const getDecorators = (field: DMMF.Field) => {
  const decorators: string[] = [];
  const decoratorArgs = getDecoratorArgs(field);

  if (isOptional(field)) {
    decorators.push('@IsOptional()');
  }

  if (isDefaultPrismaFieldType(field.type)) {
    decorators.push(`@${primitiveMapDecorators[field.type]}(${decoratorArgs})`);
  } else if (field.kind === 'enum') {
    decorators.push(
      `@IsEnum(${field.type}${decoratorArgs ? `, ${decoratorArgs}` : ''})`,
    );
  } else {
    decorators.push(
      `@Type(() => ${field.type})`,
      `@ValidateNested(${decoratorArgs})`,
    );
  }

  return decorators;
};

const formatField = (field: DMMF.Field) => {
  let result = `${getDecorators(field).join('\n')}\n${field.name}`;

  if (field.name === 'guid') {
    console.log(field);
  }

  result += `${isOptional(field) ? '?' : ''}: `;

  if (isDefaultPrismaFieldType(field.type)) {
    result += primitiveMapType[field.type];
  } else if (field.kind === 'enum') {
    result += `keyof typeof ${field.type}`;
  } else {
    result += field.type;
  }

  if (field.isList) {
    result += '[]';
  }

  if (isOptional(field)) {
    result += ' | null';
  }

  result += ';\n';

  return result;
};

const formatExternalImports = (model: DMMF.Model): string[] => {
  const decorators = model.fields.map(getDecorators).flat();
  const cleanDecorators = [
    ...new Set(decorators.map((decorator) => decorator.match(/@([^(]+)/)?.[1])),
  ];

  const decoratorsByPackage: Record<string, string[]> = {};

  const addDecoratorByPackage = (pkg: string, decorator: string) => {
    decoratorsByPackage[pkg] = [...(decoratorsByPackage[pkg] || []), decorator];
  };

  cleanDecorators.forEach((decorator) => {
    if (!decorator) {
      return;
    }

    if (['Type'].includes(decorator)) {
      addDecoratorByPackage('class-transformer', decorator);

      return;
    }

    addDecoratorByPackage('class-validator', decorator);
  });

  return Object.entries(decoratorsByPackage).map(
    ([pkg, pkgDecorators]) =>
      `import { ${pkgDecorators.join(', ')} } from '${pkg}'`,
  );
};

const formatInternalImports = (model: DMMF.Model): string[] => {
  const initialRelatedEntityFields: Record<string, DMMF.Field> = {};
  const relatedEntityFields = Object.values(
    model.fields
      .filter(({ type }) => !isDefaultPrismaFieldType(type))
      .reduce(
        (acc, field) => ({
          ...acc,
          [field.type]: field,
        }),
        initialRelatedEntityFields,
      ),
  );

  return relatedEntityFields.map(({ type, kind }) => {
    const relPathPrefix = kind === 'enum' ? `../${ENUMS_DIR}/` : './';

    return `import { ${type} } from '${relPathPrefix}${type}'`;
  });
};

const formatEnum = (enumModel: DMMF.DatamodelEnum) => `
  export enum ${enumModel.name} {
    ${enumModel.values.map(({ name }) => `${name} = '${name}'`).join(',\n')}
  }
`;

const formatClass = (model: DMMF.Model) => `
  ${formatExternalImports(model).join('\n')}
  ${formatInternalImports(model).join('\n')}

  export class ${model.name} {
    ${model.fields.map(formatField).join('\n')}
  }
`;

const writeClasses = async (
  dir: string,
  datamodel: DMMF.Datamodel,
  prettierConfig: prettier.Options,
) => {
  fse.emptyDirSync(dir);

  await Promise.all(
    datamodel.models.map(async (model) => {
      fse.writeFileSync(
        `${dir}/${model.name}.ts`,
        prettier.format(formatClass(model), prettierConfig),
      );
    }),
  );
};

const writeEnums = async (
  dir: string,
  datamodel: DMMF.Datamodel,
  prettierConfig: prettier.Options,
) => {
  fse.emptyDirSync(dir);

  await Promise.all(
    datamodel.enums.map(async (enumModel) => {
      fse.writeFileSync(
        `${dir}/${enumModel.name}.ts`,
        prettier.format(formatEnum(enumModel), prettierConfig),
      );
    }),
  );
};

const getPrettierConfig = async () => {
  const prettierConfig = await prettier.resolveConfig(appRoot.path);

  return (
    prettierConfig ?? {
      parser: 'typescript',
      singleQuote: true,
      trailingComma: 'all',
    }
  );
};

export const generate = async ({ generator, dmmf }: GeneratorOptions) => {
  const generatorOutputValue = generator.output?.value;
  const prettierConfig = await getPrettierConfig();

  ok(generatorOutputValue, 'Missing generator configuration: output');

  fse.emptyDirSync(generatorOutputValue);

  const { datamodel } = JSON.parse(JSON.stringify(dmmf)) as DMMF.Document;

  await writeEnums(
    `${generatorOutputValue}/${ENUMS_DIR}`,
    datamodel,
    prettierConfig,
  );

  await writeClasses(
    `${generatorOutputValue}/${MODELS_DIR}`,
    datamodel,
    prettierConfig,
  );
};
