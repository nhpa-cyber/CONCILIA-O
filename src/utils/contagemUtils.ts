import { ContagemEstoqueItem } from '../data/types';

/**
 * Retorna a string da data no formato dd/mm/aaaa a partir do timestamp ou dataHora
 */
export function getItemDateString(it: { timestamp?: number; dataHora?: string }): string {
  if (it.timestamp && !isNaN(it.timestamp) && it.timestamp > 0) {
    return new Date(it.timestamp).toLocaleDateString('pt-BR');
  }
  if (it.dataHora) {
    const parts = it.dataHora.split(/[\s,]+/);
    if (parts[0] && parts[0].includes('/')) {
      return parts[0];
    }
  }
  return new Date().toLocaleDateString('pt-BR');
}

/**
 * Formata caixas e unidades soltas (ex: "310 cx" ou "310 cx + 2 un")
 */
export function formatContagemBoxes(totalUnidades: number, fatorCx: number): string {
  const fator = fatorCx > 0 ? fatorCx : 1;
  const cx = Math.floor(totalUnidades / fator);
  const un = totalUnidades % fator;
  return `${cx} cx${un ? ` + ${un} un` : ''}`;
}

/**
 * Mescla/soma dois itens de contagem do mesmo produto
 */
export function mergeContagemItems(
  base: ContagemEstoqueItem,
  incoming: ContagemEstoqueItem
): ContagemEstoqueItem {
  const fator = base.fatorCx || incoming.fatorCx || 1;
  const pallets = (base.pallets || 0) + (incoming.pallets || 0);
  const lastros = (base.lastros || 0) + (incoming.lastros || 0);
  const caixas = (base.caixas || 0) + (incoming.caixas || 0);
  const unidades = (base.unidades || 0) + (incoming.unidades || 0);
  const totalUnidades = (base.totalUnidades || 0) + (incoming.totalUnidades || 0);

  const totalCaixasDecimal = totalUnidades / fator;
  const totalCaixasFormatado = formatContagemBoxes(totalUnidades, fator);

  const isIncomingNewer = (incoming.timestamp || 0) >= (base.timestamp || 0);
  const latestTimestamp = Math.max(base.timestamp || 0, incoming.timestamp || 0) || Date.now();
  const latestDataHora = isIncomingNewer
    ? incoming.dataHora || base.dataHora
    : base.dataHora || incoming.dataHora;

  return {
    ...base,
    id: base.id || incoming.id,
    pallets,
    lastros,
    caixas,
    unidades,
    totalUnidades,
    totalCaixasDecimal,
    totalCaixasFormatado,
    dataHora: latestDataHora,
    timestamp: latestTimestamp,
  };
}

/**
 * Consolida uma lista de contagens agrupando por (data + código de produto).
 * Quando o mesmo item for contado mais de uma vez na mesma data, os valores são somados!
 */
export function consolidateContagens(items: ContagemEstoqueItem[]): ContagemEstoqueItem[] {
  if (!items || items.length === 0) return [];

  // Ordena do mais antigo para o mais novo para mesclagem correta
  const sorted = [...items].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const map = new Map<string, ContagemEstoqueItem>();

  for (const it of sorted) {
    const dateStr = getItemDateString(it);
    const key = `${dateStr}__${it.cod}`;

    const existing = map.get(key);
    if (!existing) {
      // Garante formatação consistente
      const fator = it.fatorCx || 1;
      const totalCaixasFormatado = it.totalCaixasFormatado || formatContagemBoxes(it.totalUnidades, fator);
      map.set(key, {
        ...it,
        totalCaixasFormatado,
      });
    } else {
      map.set(key, mergeContagemItems(existing, it));
    }
  }

  // Retorna os mais recentes primeiro
  return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}
