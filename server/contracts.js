// Contrato em PDF de cada cliente: guardado em private/clients/<id>/contract.pdf
// (apagado junto com a pasta do cliente).
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { PRIVATE_DIR } from './paths.js';
import { clientDir } from './clientFiles.js';

export const contractPath = (clientId) => path.join(clientDir(clientId), 'contract.pdf');

export const contractUpload = multer({
  dest: path.join(PRIVATE_DIR, 'tmp'),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    cb(ok ? null : new Error('O contrato precisa ser um arquivo PDF.'), ok);
  },
}).single('contract');

export async function saveContract(tmpPath, clientId) {
  const head = Buffer.alloc(5);
  const fd = await fs.promises.open(tmpPath, 'r');
  await fd.read(head, 0, 5, 0);
  await fd.close();
  if (head.toString() !== '%PDF-') {
    await fs.promises.rm(tmpPath, { force: true });
    throw Object.assign(new Error('O arquivo enviado não é um PDF válido.'), { status: 400 });
  }
  await fs.promises.mkdir(clientDir(clientId), { recursive: true });
  await fs.promises.rename(tmpPath, contractPath(clientId)).catch(async () => {
    await fs.promises.copyFile(tmpPath, contractPath(clientId));
    await fs.promises.rm(tmpPath, { force: true });
  });
}

export const removeContract = (clientId) => fs.rmSync(contractPath(clientId), { force: true });
