#! /usr/bin/env node

import { generatorHandler, GeneratorOptions } from '@prisma/generator-helper';
import path from 'path';
import { generate } from './generate';

const defaultOutput = path.join(process.cwd(), './src/generated/models');

generatorHandler({
  async onGenerate(options: GeneratorOptions) {
    await generate(options);
  },
  onManifest() {
    return {
      defaultOutput,
      prettyName: 'Prisma TypeStack',
      requiresGenerators: ['prisma-client-js'],
    };
  },
});
