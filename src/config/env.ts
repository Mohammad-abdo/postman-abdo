import 'dotenv/config';
import path from 'path';

export const env = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'fack-postman-dev-secret',
  jwtExpiresIn: '30d',
  uploadDir: path.resolve(__dirname, '../../uploads'),
  clientDist: path.resolve(__dirname, '../../../client/dist'),
} as const;
