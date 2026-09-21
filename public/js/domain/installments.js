import { toIsoDate } from './format.js';

// Repartir en centavos: dividir y redondear cada cuota perdía plata
// (10000 en 3 cuotas facturaba 9999.99). El sobrante va a las primeras.
export function splitAmountIntoInstallments(monto, cantidad) {
  const totalCentavos = Math.round(Number(monto) * 100);
  const centavosBase = Math.floor(totalCentavos / cantidad);
  const centavosSobrantes = totalCentavos - centavosBase * cantidad;

  return Array.from({ length: cantidad }, (_, i) => {
    const centavosCuota = centavosBase + (i < centavosSobrantes ? 1 : 0);
    return (centavosCuota / 100).toFixed(2);
  });
}

// El día se recorta al último del mes destino, porque
// new Date(2026, 0 + 1, 31) desbordaría al 3 de marzo.
export function installmentDates(fechaInicialIso, cantidad) {
  const [year, month, day] = fechaInicialIso.split('-').map(Number);

  return Array.from({ length: cantidad }, (_, i) => {
    const diasDelMes = new Date(year, month + i, 0).getDate();
    return toIsoDate(new Date(year, month - 1 + i, Math.min(day, diasDelMes)));
  });
}
