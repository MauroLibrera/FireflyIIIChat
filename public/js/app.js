import { toIsoDate } from './domain/format.js';
import { activeProfile, authHeaders } from './domain/profiles.js';
import { nextAction } from './domain/confirmation.js';
import { buildSystemPrompt, buildMessages } from './domain/prompt.js';
import { splitAmountIntoInstallments } from './domain/installments.js';
import { createProfileStore } from './services/profileStore.js';
import { createFireflyApi } from './services/fireflyApi.js';
import { createGroqApi } from './services/groqApi.js';
import { createChatView } from './ui/chat.js';
import { createConfigModal } from './ui/configModal.js';

const store = createProfileStore({ storage: window.localStorage });
const getHeaders = () => authHeaders(activeProfile(store.read()));

const firefly = createFireflyApi({ getHeaders });
const groq = createGroqApi({ getHeaders });

const chat = createChatView({
  chatElement: document.getElementById('chat'),
  statusElement: document.getElementById('status-text')
});

const inputMessage = document.getElementById('inputMessage');
const sendBtn = document.getElementById('sendBtn');

let reference = { assetAccounts: [], revenueAccounts: [], tags: [], categories: [] };
let defaultAssetAccount = '';
let pendingIntent = null;

const modal = createConfigModal({ store, onSaved: loadReferenceData });

async function loadReferenceData() {
  try {
    reference = await firefly.loadReferenceData();
    defaultAssetAccount = reference.assetAccounts[0] || '';

    chat.setStatus(
      `Sincronizado (${reference.assetAccounts.length} cuentas / ${reference.categories.length} cat / ${reference.tags.length} tags)`,
      '#4ade80'
    );
  } catch (err) {
    console.error(err);

    // Sin URL ni token el fallo es esperable: guiar en vez de mostrar un error
    if (!modal.isConfigured()) {
      chat.setStatus('Configurá tu Firefly III para empezar', '#facc15');
      chat.addMessage('Todavía no hay un perfil configurado. Abrí ⚙️ y cargá la URL y el token de Firefly III.', 'bot');
      modal.open();
      return;
    }

    chat.setStatus('❌ Error al sincronizar datos.', '#f87171');
  }
}

async function handleQuery(intent) {
  const hoy = toIsoDate(new Date());

  if (intent.query_type === 'balance') {
    let cuentas = await firefly.balances();
    if (intent.source_name) {
      cuentas = cuentas.filter((c) => c.nombre.toLowerCase().includes(intent.source_name.toLowerCase()));
    }
    if (cuentas.length === 0) return '📉 No encontré información para esa cuenta.';
    return chat.renderBalances(cuentas);
  }

  if (intent.query_type === 'budget') {
    const ahora = new Date();
    const inicioMes = toIsoDate(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
    const finMes = toIsoDate(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0));

    const presupuestos = await firefly.budgets({ start: inicioMes, end: finMes });
    if (presupuestos.length === 0) return '📊 No tenés presupuestos activos configurados.';
    return chat.renderBudgets(presupuestos);
  }

  if (intent.query_type === 'recent_transactions') {
    const transacciones = await firefly.recentTransactions({ end: hoy });
    if (transacciones.length === 0) return '📑 No hay transacciones registradas hasta la fecha.';
    return chat.renderRecent(transacciones.slice(0, 5));
  }

  return '❓ No pude interpretar qué consulta querés realizar.';
}

async function submitIntent(intent) {
  await firefly.createTransaction(intent);
  const montos = splitAmountIntoInstallments(intent.amount, intent.installments || 1);
  return chat.renderTransactionResult(intent, montos);
}

async function processUserMessage(texto) {
  const accion = nextAction(pendingIntent, texto);

  if (accion === 'confirm') {
    chat.addMessage('⏳ Registrando transacción en Firefly III...', 'bot');
    const resultado = await submitIntent(pendingIntent);
    pendingIntent = null;
    chat.addMessage(resultado, 'bot', true);
    return;
  }

  if (accion === 'cancel') {
    pendingIntent = null;
    chat.addMessage('🚫 Operación cancelada. Podés indicarme la corrección.', 'bot');
    return;
  }

  const systemPrompt = buildSystemPrompt({
    today: toIsoDate(new Date()),
    assetAccounts: reference.assetAccounts,
    revenueAccounts: reference.revenueAccounts,
    categories: reference.categories,
    tags: reference.tags,
    defaultAssetAccount
  });

  const intent = await groq.interpret({
    messages: buildMessages({ systemPrompt, history: chat.history(4), userText: texto })
  });

  if (intent.requiere_confirmacion) {
    pendingIntent = intent;
    chat.addMessage(intent.mensaje_confirmacion, 'bot');
    return;
  }

  if (intent.type === 'query') {
    chat.addMessage(await handleQuery(intent), 'bot', true);
    return;
  }

  chat.addMessage(await submitIntent(intent), 'bot', true);
}

async function sendMessage() {
  const texto = inputMessage.value.trim();
  if (!texto) return;

  chat.addMessage(texto, 'user');
  inputMessage.value = '';
  sendBtn.disabled = true;

  try {
    await processUserMessage(texto);
  } catch (err) {
    chat.addMessage(`❌ Error: ${err.message}`, 'bot error');
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', sendMessage);
inputMessage.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

loadReferenceData();
