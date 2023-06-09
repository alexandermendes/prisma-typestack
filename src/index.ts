#! /usr/bin/env node

import { generatorHandler, GeneratorOptions } from '@prisma/generator-helper';
import { generate } from './generate';

generatorHandler({
  async onGenerate(options: GeneratorOptions) {
    await generate(options);
  },
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Prisma TypeStack',
      requiresGenerators: ['prisma-client-js'],
    };
  },
});
