export const PROFILES_STORAGE_KEY = 'firefly_profiles_cfg';

// Estructura usada cuando no hay nada guardado o lo guardado es inservible
export function initialProfilesState() {
  return {
    activeProfileId: 'default',
    profiles: {
      default: { name: 'Personal', fireflyUrl: '', fireflyToken: '', groqKey: '' }
    }
  };
}

// Un valor corrompido no puede dejar la app inusable.
export function normalizeProfilesState(raw) {
  // Array.isArray importa: un array es typeof "object" y tiene claves, así que
  // { profiles: ["a","b"] } pasaría el chequeo y rompería el contrato Record.
  const esValido =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw.profiles &&
    typeof raw.profiles === 'object' &&
    !Array.isArray(raw.profiles) &&
    Object.keys(raw.profiles).length > 0;

  if (!esValido) return initialProfilesState();

  const ids = Object.keys(raw.profiles);
  const activeProfileId = raw.profiles[raw.activeProfileId] ? raw.activeProfileId : ids[0];

  return { activeProfileId, profiles: raw.profiles };
}

export function activeProfile(state) {
  return state.profiles[state.activeProfileId] || {};
}

export function upsertProfile(state, id, profile) {
  return {
    activeProfileId: id,
    profiles: { ...state.profiles, [id]: profile }
  };
}

// Siempre tiene que quedar al menos un perfil.
export function removeProfile(state, id) {
  if (Object.keys(state.profiles).length <= 1) return state;

  const profiles = { ...state.profiles };
  delete profiles[id];

  const activeProfileId = profiles[state.activeProfileId] ? state.activeProfileId : Object.keys(profiles)[0];

  return { activeProfileId, profiles };
}

export function authHeaders(profile) {
  return {
    'Content-Type': 'application/json',
    'x-firefly-url': profile.fireflyUrl || '',
    'x-firefly-token': profile.fireflyToken || '',
    'x-groq-key': profile.groqKey || ''
  };
}
