// Verifica que scripts/make-icons.mjs produzca PNGs válidos: firma correcta,
// dimensiones IHDR correctas, chunks con CRC32 verificable de forma
// independiente del generador (si el script calcula mal un CRC, este test
// debe detectarlo, no solo confiar en que el archivo exista) y píxeles que
// coinciden con el diseño (fondo oscuro con un bloque claro centrado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { writePng } from '../../scripts/make-icons.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BG = [0x0f, 0x17, 0x2a];
const FG = [0x38, 0xbd, 0xf8];

// Tabla y función CRC32 propias del test, deliberadamente separadas de la
// implementación en scripts/make-icons.mjs: si ambas compartieran el mismo
// bug, el test no lo notaría.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Recorre todos los chunks de un PNG, valida firma y CRC de cada uno, y
// devuelve la lista { type, data } en orden.
function readChunks(buffer) {
  assert.deepEqual(buffer.subarray(0, 8), PNG_SIGNATURE, 'firma PNG inválida');
  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const crc = buffer.readUInt32BE(offset + 8 + length);
    const expectedCrc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
    assert.equal(crc, expectedCrc, `CRC inválido en el chunk ${type}`);
    chunks.push({ type, data });
    offset += 8 + length + 4;
  }
  return chunks;
}

function parseIhdr(data) {
  return {
    width: data.readUInt32BE(0),
    height: data.readUInt32BE(4),
    bitDepth: data.readUInt8(8),
    colorType: data.readUInt8(9),
  };
}

// Descomprime el IDAT y separa cada fila (quitando el byte de filtro), para
// poder comparar píxeles concretos con el diseño esperado.
function decodeRows(chunks, width, height) {
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);
  const stride = width * 3;
  assert.equal(raw.length, height * (stride + 1), 'longitud descomprimida inesperada');
  const rows = [];
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    assert.equal(raw[rowStart], 0, `la fila ${y} debe usar el filtro "None" (0)`);
    rows.push(raw.subarray(rowStart + 1, rowStart + 1 + stride));
  }
  return rows;
}

function pixelAt(rows, x) {
  return Array.from(rows.subarray(x * 3, x * 3 + 3));
}

test('writePng produces a PNG with the correct signature, IHDR fields and pixel data', () => {
  const tmpFile = path.join(os.tmpdir(), `icon-test-${process.pid}-${Date.now()}.png`);
  const width = 8;
  const height = 4;
  const rgb = Buffer.alloc(width * height * 3);
  // Mitad superior de fondo, mitad inferior del color claro: patrón simple y
  // fácil de verificar a mano.
  for (let y = 0; y < height; y++) {
    const color = y < height / 2 ? BG : FG;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      rgb[offset] = color[0];
      rgb[offset + 1] = color[1];
      rgb[offset + 2] = color[2];
    }
  }

  try {
    writePng(tmpFile, { width, height, rgb });
    const buffer = fs.readFileSync(tmpFile);

    assert.deepEqual(buffer.subarray(0, 8), PNG_SIGNATURE);

    const chunks = readChunks(buffer);
    assert.equal(chunks[0].type, 'IHDR', 'IHDR debe ser el primer chunk');
    const ihdr = parseIhdr(chunks[0].data);
    assert.equal(ihdr.width, width);
    assert.equal(ihdr.height, height);
    assert.equal(ihdr.bitDepth, 8);
    assert.equal(ihdr.colorType, 2);

    assert.ok(chunks.some((c) => c.type === 'IDAT'), 'falta el chunk IDAT');
    assert.equal(chunks[chunks.length - 1].type, 'IEND', 'IEND debe ser el último chunk');

    const rows = decodeRows(chunks, width, height);
    assert.deepEqual(pixelAt(rows[0], 0), BG);
    assert.deepEqual(pixelAt(rows[height - 1], 0), FG);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

for (const size of [192, 512]) {
  test(`icon-${size}.png exists and is a valid ${size}x${size} PNG`, () => {
    const filePath = path.join(projectRoot, 'public', 'icons', `icon-${size}.png`);
    assert.ok(fs.existsSync(filePath), `${filePath} no existe`);

    const stats = fs.statSync(filePath);
    assert.ok(stats.size > 0, 'el archivo está vacío');
    assert.ok(stats.size < 100 * 1024, 'el archivo pesa 100 KB o más');

    const buffer = fs.readFileSync(filePath);
    assert.deepEqual(buffer.subarray(0, 8), PNG_SIGNATURE);

    const chunks = readChunks(buffer);
    assert.equal(chunks[0].type, 'IHDR', 'IHDR debe ser el primer chunk');
    const ihdr = parseIhdr(chunks[0].data);
    assert.equal(ihdr.width, size, `ancho esperado ${size}`);
    assert.equal(ihdr.height, size, `alto esperado ${size}`);
    assert.equal(ihdr.bitDepth, 8);
    assert.equal(ihdr.colorType, 2);

    const rows = decodeRows(chunks, size, size);
    // Esquina superior izquierda: fondo. Centro: bloque claro del ícono.
    assert.deepEqual(pixelAt(rows[0], 0), BG);
    const mid = Math.floor(size / 2);
    assert.deepEqual(pixelAt(rows[mid], mid), FG);
  });
}
