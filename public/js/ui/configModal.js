import { activeProfile, upsertProfile, removeProfile } from '../domain/profiles.js';

export function createConfigModal({ store, onSaved }) {
  const overlay = document.getElementById('modal-config');
  const select = document.getElementById('cfg-profile-select');
  const nameInput = document.getElementById('cfg-profile-name');
  const urlInput = document.getElementById('cfg-firefly-url');
  const tokenInput = document.getElementById('cfg-firefly-token');
  const groqInput = document.getElementById('cfg-groq-key');

  function fillForm() {
    const state = store.read();
    const profile = state.profiles[select.value] || {};
    nameInput.value = profile.name || '';
    urlInput.value = profile.fireflyUrl || '';
    tokenInput.value = profile.fireflyToken || '';
    groqInput.value = profile.groqKey || '';
  }

  function renderSelector() {
    const state = store.read();
    select.innerHTML = '';

    for (const id of Object.keys(state.profiles)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = state.profiles[id].name || id;
      if (id === state.activeProfileId) opt.selected = true;
      select.appendChild(opt);
    }

    fillForm();
  }

  function open() {
    overlay.style.display = 'flex';
    renderSelector();
  }

  function close() {
    overlay.style.display = 'none';
  }

  function createDraft() {
    const newId = `profile_${Date.now()}`;
    const opt = document.createElement('option');
    opt.value = newId;
    opt.textContent = 'Nuevo Perfil';
    opt.selected = true;
    select.appendChild(opt);

    nameInput.value = 'Nuevo Perfil';
    urlInput.value = '';
    tokenInput.value = '';
    groqInput.value = '';
  }

  function save() {
    const id = select.value || `profile_${Date.now()}`;
    const profile = {
      name: nameInput.value.trim() || 'Sin nombre',
      fireflyUrl: urlInput.value.trim(),
      fireflyToken: tokenInput.value.trim(),
      groqKey: groqInput.value.trim()
    };

    store.write(upsertProfile(store.read(), id, profile));
    close();
    alert(`✅ Perfil "${profile.name}" activado y guardado.`);
    onSaved();
  }

  function removeCurrent() {
    const state = store.read();
    const id = select.value;

    if (Object.keys(state.profiles).length <= 1) {
      alert('❌ Debe existir al menos un perfil.');
      return;
    }

    if (!confirm(`¿Seguro que querés eliminar el perfil "${state.profiles[id].name}"?`)) return;

    store.write(removeProfile(state, id));
    renderSelector();
    alert('🗑️ Perfil eliminado.');
  }

  select.addEventListener('change', fillForm);
  document.getElementById('btn-config').addEventListener('click', open);
  document.getElementById('btn-profile-new').addEventListener('click', createDraft);
  document.getElementById('btn-config-save').addEventListener('click', save);
  document.getElementById('btn-config-cancel').addEventListener('click', close);
  document.getElementById('btn-profile-delete').addEventListener('click', removeCurrent);

  return { open, close, isConfigured: () => {
    const profile = activeProfile(store.read());
    return Boolean(profile.fireflyUrl && profile.fireflyToken);
  } };
}
