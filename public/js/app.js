import { toIsoDate } from './domain/format.js';
import { activeProfile, authHeaders } from './domain/profiles.js';
import { nextAction } from './domain/confirmation.js';
import { validateIntent } from './domain/intent.js';
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

// Misma tarjeta para ofrecer la confirmación inicial y para ofrecer un
// reintento (R4): arma el HTML a partir de pendingIntent y la cablea a los
// mismos confirmPendingIntent/cancelPendingIntent de siempre, así las dos
// situaciones no pueden divergir en cómo se resuelven.
function offerPendingIntentCard() {
  const montos = pendingIntent.type === 'query' ? [] : splitAmountIntoInstallments(pendingIntent.amount, pendingIntent.installments || 1);
  const html = chat.renderConfirmationCard(pendingIntent, montos);

  chat.addConfirmationCard(html, {
    onConfirm: () => runProtected(confirmPendingIntent),
    onCancel: () => runProtected(cancelPendingIntent)
  });
}

function showError(err) {
  chat.addMessage(`❌ Error: ${err.message}`, 'bot error');
}

// Un único camino para "confirmar" y otro para "cancelar", sin importar si
// llegaron por texto ("sí"/"no") o por los botones de la tarjeta: así no
// pueden divergir con el tiempo y terminar haciendo cosas distintas frente
// al mismo pedido del usuario.
async function confirmPendingIntent() {
  chat.addMessage('⏳ Registrando transacción en Firefly III...', 'bot');
  try {
    const resultado = await submitIntent(pendingIntent);
    pendingIntent = null;
    chat.addMessage(resultado, 'bot', true);
  } catch (err) {
    // R4: pendingIntent no se limpia acá porque el await de arriba falló
    // antes de esa línea, así que la intención ya validada sobrevive al
    // error. Se reutiliza la misma tarjeta de confirmación para ofrecer un
    // reintento que no vuelve a pasarle la frase al modelo.
    showError(err);
    chat.addMessage('🔁 Podés reintentar el envío sin volver a escribir el pedido.', 'bot');
    offerPendingIntentCard();
  }
}

function cancelPendingIntent() {
  pendingIntent = null;
  chat.addMessage('🚫 Operación cancelada. Podés indicarme la corrección.', 'bot');
}

// Mismo manejo de errores para el envío por texto y para los clicks de la
// tarjeta: sendMessage ya no es el único lugar que atrapa un fallo de red.
// confirmPendingIntent ya maneja su propio error (y ofrece el reintento de
// R4), así que este catch cubre todo lo demás: interpretar con el modelo,
// validar, o resolver una consulta.
async function runProtected(accion) {
  sendBtn.disabled = true;
  try {
    await accion();
  } catch (err) {
    showError(err);
  } finally {
    sendBtn.disabled = false;
  }
}

async function processUserMessage(texto) {
  const accion = nextAction(pendingIntent, texto);

  if (accion === 'confirm') {
    await confirmPendingIntent();
    return;
  }

  if (accion === 'cancel') {
    cancelPendingIntent();
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

  const raw = await groq.interpret({
    messages: buildMessages({ systemPrompt, history: chat.history(4), userText: texto })
  });

  // El modelo garantiza JSON bien formado, no que describa algo real: una
  // cuenta inventada o una fecha imposible se frenan acá, antes de tocar
  // Firefly, en vez de volver como un 422 que el usuario no puede interpretar.
  const validado = validateIntent(raw, {
    assetAccounts: reference.assetAccounts,
    revenueAccounts: reference.revenueAccounts,
    categories: reference.categories,
    today: toIsoDate(new Date())
  });

  if (!validado.ok) {
    chat.addMessage(validado.reason, 'bot error');
    return;
  }

  const intent = validado.intent;

  if (intent.requiere_confirmacion) {
    pendingIntent = intent;

    // Tarjeta estructurada (Task 2): el usuario confirma contra los campos
    // reales que se van a enviar, no contra la frase que escribió el modelo
    // sobre sí mismo (mensaje_confirmacion ya no se usa acá).
    offerPendingIntentCard();
    return;
  }

  if (intent.type === 'query') {
    chat.addMessage(await handleQuery(intent), 'bot', true);
    return;
  }

  // Sin confirmación previa no hay tarjeta, pero el envío pasa igual por
  // pendingIntent + confirmPendingIntent (R4): si Firefly falla acá, la
  // intención ya validada tampoco se pierde.
  pendingIntent = intent;
  await confirmPendingIntent();
}

async function sendMessage() {
  const texto = inputMessage.value.trim();
  if (!texto) return;

  chat.addMessage(texto, 'user');
  inputMessage.value = '';

  await runProtected(() => processUserMessage(texto));
}

sendBtn.addEventListener('click', sendMessage);
inputMessage.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

loadReferenceData();
