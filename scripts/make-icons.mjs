// Genera los íconos de la PWA (192x192 y 512x512) como PNGs válidos sin
// depender de ninguna librería de imágenes: la única dependencia es
// node:zlib para comprimir los scanlines, que ya viene con Node.
//
// Este script se ejecuta a mano una única vez y su salida (los .png) se
// commitea. No forma parte de `npm start` ni de ningún paso de build: el
// objetivo es que los íconos sean reproducibles por código versionado en vez
// de por un editor de imágenes externo.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Color de fondo (theme_color de la app) y color del bloque central.
const BACKGROUND = [0x0f, 0x17, 0x2a];
const FOREGROUND = [0x38, 0xbd, 0xf8];

// Tabla y función CRC32 estándar (polinomio 0xEDB88320), escrita a mano:
// cada chunk PNG lleva un CRC32 sobre su tipo + datos.
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

// Arma un chunk PNG completo: longitud (4 bytes BE) + tipo (4 bytes ascii) +
// datos + CRC32 (4 bytes BE) calculado sobre tipo + datos, no sobre la
// longitud.
function buildChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * Escribe un PNG truecolor de 8 bits sin interlace en `filePath`.
 * @param {string} filePath
 * @param {{ width: number, height: number, rgb: Buffer }} options `rgb` trae
 *   width*height*3 bytes, fila por fila, sin byte de filtro (se agrega acá).
 */
export function writePng(filePath, { width, height, rgb }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // profundidad de bits
  ihdr.writeUInt8(2, 9); // tipo de color: truecolor RGB
  ihdr.writeUInt8(0, 10); // compresión
  ihdr.writeUInt8(0, 11); // filtro
  ihdr.writeUInt8(0, 12); // interlace

  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filtro "None" en cada scanline
    rgb.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw);

  const png = Buffer.concat([
    PNG_SIGNATURE,
    buildChunk('IHDR', ihdr),
    buildChunk('IDAT', idatData),
    buildChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, png);
}

// Construye los bytes RGB de un ícono: fondo oscuro con un bloque claro
// centrado que ocupa la mitad del ancho/alto (un cuarto de margen a cada
// lado). Una marca simple y legible, sin pretensión de diseño.
function buildIconRgb(size) {
  const blockStart = Math.floor(size / 4);
  const blockEnd = blockStart + Math.floor(size / 2);
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    const inBlockRow = y >= blockStart && y < blockEnd;
    for (let x = 0; x < size; x++) {
      const inBlock = inBlockRow && x >= blockStart && x < blockEnd;
      const color = inBlock ? FOREGROUND : BACKGROUND;
      const offset = (y * size + x) * 3;
      rgb[offset] = color[0];
      rgb[offset + 1] = color[1];
      rgb[offset + 2] = color[2];
    }
  }
  return rgb;
}

const ICON_SIZES = [192, 512];

export function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(scriptDir, '..', 'public', 'icons');
  for (const size of ICON_SIZES) {
    const filePath = path.join(outDir, `icon-${size}.png`);
    writePng(filePath, { width: size, height: size, rgb: buildIconRgb(size) });
    console.log(`wrote ${filePath}`);
  }
}

// Solo corre main() si el archivo se ejecuta directamente (node scripts/make-icons.mjs),
// no cuando el test lo importa para usar writePng().
if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main();
}
