import path from 'path';

/**
 * Settings of the request engine (mappers + runtime) that differ between hosts.
 * The server keeps the default; the desktop app points uploads at its own data folder.
 */
let uploadDir = path.resolve(__dirname, '../../../uploads');

export const engineConfig = {
  get uploadDir() {
    return uploadDir;
  },
  setUploadDir(dir: string) {
    uploadDir = dir;
  },
};
