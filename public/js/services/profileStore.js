import { PROFILES_STORAGE_KEY, initialProfilesState, normalizeProfilesState } from '../domain/profiles.js';

// storage se inyecta para poder testear sin navegador. En producción es localStorage,
// que puede lanzar en modo privado o con el almacenamiento bloqueado.
export function createProfileStore({ storage, key = PROFILES_STORAGE_KEY }) {
  return {
    read() {
      let crudo;
      try {
        crudo = storage.getItem(key);
      } catch (err) {
        console.warn('No se pudo leer la configuración de perfiles:', err);
        return initialProfilesState();
      }

      if (!crudo) return initialProfilesState();

      try {
        return normalizeProfilesState(JSON.parse(crudo));
      } catch (err) {
        console.warn('Configuración de perfiles ilegible, se reinicia:', err);
        return initialProfilesState();
      }
    },

    write(state) {
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch (err) {
        console.warn('No se pudo guardar la configuración de perfiles:', err);
      }
    }
  };
}
