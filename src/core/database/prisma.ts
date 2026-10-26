import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

/** Typed escape hatch for writing our JSON column models (bodies, auth, variables...). */
export const json = (value: unknown) => value as Prisma.InputJsonValue;
