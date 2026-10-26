import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { codegenController } from './codegen.controller';
import { generateSnippetSchema } from './codegen.schema';

export const codegenRoutes = Router();

codegenRoutes.get('/languages', codegenController.languages);
codegenRoutes.post('/', validateBody(generateSnippetSchema), codegenController.generate);
