# Prisma TypeStack

Generates models from [Prisma](https://www.prisma.io/) schemas using
[class-validator](https://www.npmjs.com/package/class-validator)
and
[class-transformer](https://www.npmjs.com/package/class-transformer).

## Installation

```text
yarn add prisma-typestack
```

## Usage

Add the following to your `prisma.schema` file.

```prisma
generator class_validator {
  provider = "prisma-typestack"
  output   = "./generated-models" // Optional
}
```
