/**
 * Especificações padrão de Paletização e Lastro para produtos de bebidas
 * Permite cálculo automático de Pallet, Lastro, Caixa e Unidades.
 */

export interface ProductPalletConfig {
  fatorCx: number;          // Unidades por caixa
  caixasPorLastro: number;  // Caixas por camada (lastro)
  caixasPorPallet: number;  // Total de caixas em 1 pallet fechado
  lastrosPorPallet: number; // Camadas por pallet
}

const STORAGE_PALLET_CONFIGS_KEY = 'estoque_pallet_custom_configs_v1';

// Obter configurações customizadas salvas pelo usuário
export function getSavedPalletConfigs(): Record<number, Partial<ProductPalletConfig>> {
  try {
    const raw = localStorage.getItem(STORAGE_PALLET_CONFIGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Salvar configuração customizada de um produto
export function saveProductPalletConfig(cod: number, config: Partial<ProductPalletConfig>): void {
  try {
    const current = getSavedPalletConfigs();
    current[cod] = { ...current[cod], ...config };
    localStorage.setItem(STORAGE_PALLET_CONFIGS_KEY, JSON.stringify(current));
  } catch (e) {
    console.error('Erro ao salvar pallet config:', e);
  }
}

/**
 * Deduz inteligentemente as especificações de paletização com base no cadastro do produto
 * e na descrição (padrões Ambev / Distribuição de Bebidas Brasil).
 */
export function getProductPalletSpec(
  cod: number,
  desc: string = '',
  knownFatorCx: number = 1
): ProductPalletConfig {
  const d = (desc || '').toUpperCase();
  const saved = getSavedPalletConfigs()[cod];

  // Regra padrão de fábrica por tipo de embalagem
  let caixasPorLastro = 10;
  let caixasPorPallet = 60;
  let fatorCx = knownFatorCx > 0 ? knownFatorCx : 1;

  if (d.includes('LT 269') || d.includes('LATA 269') || d.includes('269ML')) {
    // Latas 269ml: lastro de 18 ou 20 caixas, 6 camadas = 108 ou 120 caixas
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 15;
    caixasPorLastro = 18;
    caixasPorPallet = 108;
  } else if (d.includes('LT 350') || d.includes('LATA 350') || d.includes('350ML') || d.includes('LATA')) {
    // Latas 350ml: lastro de 16 ou 20 caixas, 5 ou 6 camadas = 100 ou 120 caixas
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 12;
    caixasPorLastro = 20;
    caixasPorPallet = 100;
  } else if (d.includes('LT 473') || d.includes('LATA 473') || d.includes('473ML') || d.includes('LATAO') || d.includes('LATÃO')) {
    // Latão 473ml: lastro 16 caixas, 5 camadas = 80 caixas
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 12;
    caixasPorLastro = 16;
    caixasPorPallet = 80;
  } else if (d.includes('600ML') || d.includes('GF 600') || d.includes('RGB 600') || d.includes('600 ML')) {
    // Garrafa 600ml retornável: caixas plásticas de 24 un (ou 2 dúzias).
    // Pallet padrão cervejaria: 10 caixas por lastro, 5 ou 6 lastros = 50 ou 60 caixas
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 24;
    caixasPorLastro = 10;
    caixasPorPallet = 50;
  } else if (d.includes('1L') || d.includes('1 L') || d.includes('1000ML') || d.includes('LITRAO') || d.includes('LITRÃO')) {
    // Garrafa 1 Litro: caixas de 12 unidades
    // Pallet padrão: 9 caixas por lastro, 5 camadas = 45 caixas
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 12;
    caixasPorLastro = 9;
    caixasPorPallet = 45;
  } else if (d.includes('LN') || d.includes('LONG NECK') || d.includes('330ML') || d.includes('355ML')) {
    // Long Neck: caixas de 24 (ou four-pack/six-pack)
    // Pallet padrão: 14 caixas por lastro, 6 camadas = 84 caixas
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 24;
    caixasPorLastro = 14;
    caixasPorPallet = 84;
  } else if (d.includes('PET 2L') || d.includes('2 L') || d.includes('PET 2.0') || d.includes('2000ML')) {
    // Pet 2L Refrigerante: fardos com 6 ou 8 garrafas
    // Pallet padrão: 12 fardos por lastro, 4 ou 5 camadas = 48 ou 60 fardos
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 6;
    caixasPorLastro = 12;
    caixasPorPallet = 48;
  } else if (d.includes('PET 1L') || d.includes('1.5L') || d.includes('PET 1.5')) {
    // Pet 1L / 1.5L
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 12;
    caixasPorLastro = 14;
    caixasPorPallet = 70;
  } else if (d.includes('200ML') || d.includes('250ML') || d.includes('CAÇULINHA') || d.includes('MINI')) {
    // Pet Mini
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 12;
    caixasPorLastro = 18;
    caixasPorPallet = 108;
  } else if (d.includes('CHOPP') || d.includes('BARRIL') || d.includes('KEG') || d.includes('30L') || d.includes('50L')) {
    // Barril de Chopp: 1 unidade por volume
    // Pallet de barril: 6 barris por camada, 2 camadas = 12 barris
    fatorCx = 1;
    caixasPorLastro = 6;
    caixasPorPallet = 12;
  } else if (d.includes('WHISKY') || d.includes('VODKA') || d.includes('GIN') || d.includes('DESTILADO') || d.includes('CIROC') || d.includes('PARR') || d.includes('WALKER')) {
    // Destilados: caixas de 6 ou 12
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 12;
    caixasPorLastro = 16;
    caixasPorPallet = 80;
  } else if (d.includes('REFRESCO') || d.includes('TANG') || d.includes('DISPLAY') || d.includes('PO')) {
    // Displays / envelopes
    fatorCx = knownFatorCx > 0 ? knownFatorCx : 15;
    caixasPorLastro = 24;
    caixasPorPallet = 144;
  }

  // Sobrescrever com valores salvos caso o usuário tenha editado especificamente
  if (saved) {
    if (saved.fatorCx && saved.fatorCx > 0) fatorCx = saved.fatorCx;
    if (saved.caixasPorLastro && saved.caixasPorLastro > 0) caixasPorLastro = saved.caixasPorLastro;
    if (saved.caixasPorPallet && saved.caixasPorPallet > 0) caixasPorPallet = saved.caixasPorPallet;
  }

  const lastrosPorPallet = caixasPorLastro > 0 ? Math.round(caixasPorPallet / caixasPorLastro) : 5;

  return {
    fatorCx,
    caixasPorLastro,
    caixasPorPallet,
    lastrosPorPallet,
  };
}

/**
 * Realiza o cálculo matemático exato da contagem
 */
export function calculateCountTotals(
  pallets: number,
  lastros: number,
  caixas: number,
  unidades: number,
  spec: ProductPalletConfig
) {
  const p = Math.max(0, Number(pallets) || 0);
  const l = Math.max(0, Number(lastros) || 0);
  const c = Math.max(0, Number(caixas) || 0);
  const u = Math.max(0, Number(unidades) || 0);
  const fator = spec.fatorCx > 0 ? spec.fatorCx : 1;

  // Caixas vindas dos pallets fechados
  const caixasDePallets = p * spec.caixasPorPallet;

  // Caixas vindas dos lastros (camadas)
  const caixasDeLastros = l * spec.caixasPorLastro;

  // Total de caixas inteiras antes das unidades avulsas
  const caixasInteiras = caixasDePallets + caixasDeLastros + c;

  // Conversão das unidades avulsas para caixas e sobra de unidades
  const caixasDasUnidades = Math.floor(u / fator);
  const unidadesRestantes = u % fator;

  // Total final de caixas e unidades
  const totalCaixas = caixasInteiras + caixasDasUnidades;
  const totalUnidades = (totalCaixas * fator) + unidadesRestantes;
  const totalCaixasDecimal = totalCaixas + (unidadesRestantes / fator);

  // Formato padrão ambev / sistema: "285/06" cx
  const formatoFormatado = `${totalCaixas.toLocaleString('pt-BR')}/${unidadesRestantes.toString().padStart(2, '0')}`;

  return {
    pallets: p,
    lastros: l,
    caixas: c,
    unidades: u,
    caixasDePallets,
    caixasDeLastros,
    totalCaixas,
    unidadesRestantes,
    totalUnidades,
    totalCaixasDecimal,
    formatoFormatado,
    fator,
    spec,
  };
}
