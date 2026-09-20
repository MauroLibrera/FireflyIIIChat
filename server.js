import dotenv from 'dotenv';
import { createApp } from './server/app.js';

// Se carga .env.local primero y .env como respaldo (la primera ocurrencia gana).
// Los imports de ESM ya se evaluaron en este punto, por eso server/app.js no
// puede leer process.env en el cuerpo del módulo.
dotenv.config({ path: ['.env.local', '.env'] });

const PORT = process.env.PORT || 3000;

createApp().listen(PORT, () => {
  console.log(`🚀 Firefly Chat Backend en puerto ${PORT}`);
});
