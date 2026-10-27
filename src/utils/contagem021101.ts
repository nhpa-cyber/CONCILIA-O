/**
 * Utilitários e lógica de negócio para a rotina 02.11.01 (PW03018R - Recontagens e Conferência Cega)
 */

export interface ParsedProductItem {
  code: string;       // 8-digit zero-padded product code (e.g. "00025303")
  cleanCode: number;  // integer product code (e.g. 25303)
  desc: string;       // product description
  qty: number;        // total counted quantity in this file
}

export interface MatchedContagemInfo {
  cleanCode: number;
  code: string;
  desc: string;
  isMatched: boolean;
  matchedInRound: number | null; // ex: 2 (1ª Recontagem), 3 (2ª Recontagem)...
  matchedWithRound: number | null; // ex: 1 (Contagem Base), 2 (1ª Recontagem)...
  matchedWithLabel: string; // ex: "Contagem Base" ou "1ª Recontagem"
  statusText: string;
  confirmedQty: number | null;
  baseQty: number | null;
  lastRecQty: number | null;
}

/**
 * Normaliza textos para busca de cabeçalho
 */
export function normalizeHeader(v: any): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Converte valor de quantidade (trata Promax cx/gf, decimais, negativos)
 */
export function parseQuantityValue(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  let str = String(val).trim();
  if (!str) return 0;

  let isNegative = false;
  if (str.endsWith('-')) {
    isNegative = true;
    str = str.slice(0, -1).trim();
  } else if (str.startsWith('-')) {
    isNegative = true;
    str = str.slice(1).trim();
  }

  // Formato Promax caixas/garrafas (ex.: "45/00", "1.320/02", "3/02-", "0/00")
  if (str.includes('/')) {
    const parts = str.split('/');
    const cx = parseFloat(parts[0].replace(/\./g, '')) || 0;
    const gf = parseFloat(parts[1].replace(/\./g, '')) || 0;
    const total = gf > 0 ? cx + gf / 100 : cx;
    return isNegative ? -Math.round(total) : Math.round(total);
  }

  // Número padrão com vírgula ou ponto (ex: "5.538" ou "5538,00" ou "5538")
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, '');
  }

  const v = parseFloat(str);
  const res = isNaN(v) ? 0 : Math.round(v);
  return isNegative ? -Math.abs(res) : res;
}

/**
 * Detecta as colunas de Código, Descrição e Quantidade na matriz de dados
 */
export function detectColumns(rows: (string | number)[][]): {
  headerIdx: number;
  codeCol: number;
  descCol: number;
  qtyCol: number;
} {
  let headerIdx = -1;
  let codeCol = -1;
  let descCol = -1;
  let qtyCol = -1;

  // 1. Procura linha de cabeçalho nas primeiras 30 linhas
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const rowNorm = row.map(normalizeHeader);

    const cIdx = rowNorm.findIndex(c =>
      c === 'produto' || c === 'codigo' || c === 'cod' || c === 'cod.' ||
      c === 'codprod' || c === 'cod_prod' || c === 'cod produto' ||
      c === 'cd' || c === 'mercadoria' || c === 'item'
    );
    const dIdx = rowNorm.findIndex(c =>
      c.includes('descricao') || c.includes('descr') || c === 'nome' ||
      c === 'denominacao' || c === 'especificacao'
    );
    const qIdx = rowNorm.findIndex(c =>
      c.startsWith('qtdad') || c.startsWith('quant') || c === 'qtd' || c === 'qt' ||
      c.includes('contagem') || c.includes('contada') || c.includes('fisico') ||
      c === 'saldo' || c === 'total' || c === 'cx'
    );

    if (cIdx >= 0 && (dIdx >= 0 || qIdx >= 0)) {
      headerIdx = r;
      codeCol = cIdx;
      descCol = dIdx;
      qtyCol = qIdx;
      break;
    }
  }

  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
  const sample = rows.slice(startRow, startRow + 30).filter(r => r && r.length > 0);

  // 2. Se não encontrou cabeçalho explícito, deduz pela estrutura da rotina 02.11.01 (PW03018R)
  if (codeCol < 0 || qtyCol < 0) {
    if (sample.length > 0) {
      const maxCols = Math.max(...sample.map(r => r.length));
      
      // Rotina Promax / WinThor 02.11.01 padrão:
      // Col C (índice 2) = Código do Produto
      // Col D (índice 3) = Descrição
      // Col J (índice 9) = Quantidade (Qtdade)
      if (maxCols >= 10) {
        if (codeCol < 0) codeCol = 2;
        if (descCol < 0) descCol = 3;
        if (qtyCol < 0) qtyCol = 9;
      } else {
        let textCol = -1;
        for (let col = 0; col < maxCols; col++) {
          const hasLetters = sample.some(r => /[a-zA-ZÀ-ÿ]{3,}/.test(String(r[col] || '')));
          if (hasLetters) {
            textCol = col;
            break;
          }
        }
        if (descCol < 0 && textCol >= 0) {
          descCol = textCol;
        }

        let candidateCodeCol = -1;
        for (let col = 0; col < maxCols; col++) {
          if (col === descCol) continue;
          const vals = sample.map(r => String(r[col] || '').trim()).filter(Boolean);
          const uniqueVals = new Set(vals);
          if (uniqueVals.size <= 1 && sample.length > 2) continue;
          
          const numericLike = vals.filter(v => /^\d{2,8}$/.test(v.replace(/\D/g, '')));
          if (numericLike.length >= vals.length * 0.6) {
            candidateCodeCol = col;
            break;
          }
        }

        if (codeCol < 0) {
          codeCol = candidateCodeCol >= 0 ? candidateCodeCol : (maxCols >= 3 ? 2 : 0);
        }
        if (descCol < 0) {
          descCol = codeCol === 0 ? 1 : (codeCol + 1 < maxCols ? codeCol + 1 : -1);
        }
        if (qtyCol < 0) {
          for (let col = maxCols - 1; col >= 0; col--) {
            if (col !== codeCol && col !== descCol) {
              qtyCol = col;
              break;
            }
          }
          if (qtyCol < 0) qtyCol = maxCols - 1;
        }
      }
    }
  }

  // Fallbacks finais
  if (codeCol < 0) codeCol = 2;
  if (descCol < 0) descCol = 3;
  if (qtyCol < 0) qtyCol = 9;

  return { headerIdx, codeCol, descCol, qtyCol };
}

/**
 * Converte linhas brutas de um arquivo em mapa de produtos com código, descrição e quantidade somada
 */
export function parseRowsToProducts(
  rows: (string | number)[][],
  catalogMap?: Map<string, string>
): Map<string, ParsedProductItem> {
  const result = new Map<string, ParsedProductItem>();
  if (!rows || rows.length === 0) return result;

  const { headerIdx, codeCol, descCol, qtyCol } = detectColumns(rows);
  const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawVal = String(row[codeCol] ?? '').trim();
    if (!rawVal) continue;

    const normVal = normalizeHeader(rawVal);
    if (
      normVal === 'produto' || normVal === 'codigo' || normVal === 'cod' ||
      normVal === 'total' || normVal.startsWith('relatorio') || normVal === 'filial'
    ) {
      continue;
    }

    const digitsOnly = rawVal.replace(/\D/g, '');
    if (!digitsOnly || digitsOnly === '0' || digitsOnly === '00000000') continue;

    const cleanNum = parseInt(digitsOnly, 10);
    if (isNaN(cleanNum) || cleanNum <= 0) continue;

    const paddedCode = digitsOnly.padStart(8, '0');

    let desc = descCol >= 0 && descCol < row.length ? String(row[descCol] ?? '').trim() : '';
    if ((!desc || /^\d+$/.test(desc)) && catalogMap && catalogMap.has(paddedCode)) {
      desc = catalogMap.get(paddedCode)!;
    }

    const rawQty = qtyCol >= 0 && qtyCol < row.length ? row[qtyCol] : 0;
    const qty = parseQuantityValue(rawQty);

    if (result.has(paddedCode)) {
      const existing = result.get(paddedCode)!;
      existing.qty += qty;
      if ((!existing.desc || /^\d+$/.test(existing.desc)) && desc) {
        existing.desc = desc;
      }
    } else {
      result.set(paddedCode, {
        code: paddedCode,
        cleanCode: cleanNum,
        desc: desc || (catalogMap?.get(paddedCode) || `PRODUTO ${cleanNum}`),
        qty,
      });
    }
  }

  return result;
}

/**
 * Retorna um mapa de produtos que tiveram contagem batida (confirmada) na rotina 02.11.01.
 * Regra:
 * - 1ª contagem (índice 0): Contagem Base do armazém inteiro
 * - 2ª contagem (índice 1): 1ª Recontagem (se bateu com a Base -> confirmou!)
 * - 3ª contagem (índice 2): 2ª Recontagem (se bateu com a 1ª Recontagem OU com a Base -> confirmou!)
 * - Rodadas seguintes (3ª, 4ª...): se bateu com qualquer contagem anterior -> confirmou!
 */
export function getMatchedProductsFrom021101(
  counts: Array<{
    id?: string;
    label?: string;
    fileName?: string;
    rows?: (string | number)[][];
    parsedItems?: ParsedProductItem[];
  }>,
  catalogMap?: Map<string, string>
): Map<number, MatchedContagemInfo> {
  const result = new Map<number, MatchedContagemInfo>();
  if (!counts || counts.length < 2) return result;

  const numCounts = counts.length;

  // 1. Extrai produtos por rodada
  const countMaps = counts.map(c => {
    if (c.parsedItems && c.parsedItems.length > 0) {
      const m = new Map<string, ParsedProductItem>();
      c.parsedItems.forEach(item => m.set(item.code, item));
      return m;
    }
    return parseRowsToProducts(c.rows || [], catalogMap);
  });

  // 2. Consolida todos os itens
  const allProds = new Map<string, {
    code: string;
    cleanCode: number;
    desc: string;
    quantities: (number | null)[];
  }>();

  countMaps.forEach((m, cIdx) => {
    m.forEach((item, code) => {
      if (!allProds.has(code)) {
        allProds.set(code, {
          code,
          cleanCode: item.cleanCode,
          desc: item.desc,
          quantities: new Array(numCounts).fill(null),
        });
      }
      const p = allProds.get(code)!;
      p.quantities[cIdx] = item.qty;
      if ((!p.desc || /^\d+$/.test(p.desc)) && item.desc) {
        p.desc = item.desc;
      }
    });
  });

  // 3. Aplica comparação multi-rodadas
  allProds.forEach((prod) => {
    const q = prod.quantities;
    // O produto precisa ter participado de pelo menos uma recontagem (índice >= 1)
    const hasRecontagem = q.slice(1).some(v => v !== null);
    if (!hasRecontagem) return;

    let confirmedInRound: number | null = null;
    let confirmedWithRound: number | null = null;
    let matchedQty: number | null = null;
    let matchLabel = '';

    for (let i = 1; i < numCounts; i++) {
      const currentQ = q[i];
      if (currentQ === null) continue;

      let foundMatchIdx: number | null = null;

      // Prioridade 1: imediatamente anterior (ex: 2ª Rec bateu com 1ª Rec)
      if (q[i - 1] !== null && currentQ === q[i - 1]) {
        foundMatchIdx = i - 1;
      } else {
        // Prioridade 2: outras recontagens anteriores
        for (let prevIdx = i - 2; prevIdx >= 1; prevIdx--) {
          if (q[prevIdx] !== null && currentQ === q[prevIdx]) {
            foundMatchIdx = prevIdx;
            break;
          }
        }
        // Prioridade 3: contagem base (índice 0)
        if (foundMatchIdx === null && q[0] !== null && currentQ === q[0]) {
          foundMatchIdx = 0;
        }
      }

      if (foundMatchIdx !== null) {
        confirmedInRound = i + 1; // 1-indexed (2 = 1ª Rec, 3 = 2ª Rec)
        confirmedWithRound = foundMatchIdx + 1; // 1-indexed (1 = Base, 2 = 1ª Rec)
        matchedQty = currentQ;
        matchLabel = foundMatchIdx === 0
          ? 'Contagem Base'
          : `${foundMatchIdx}ª Recontagem`;
      }
    }

    if (confirmedInRound !== null && matchedQty !== null) {
      const statusText = `✓ Confirmado c/ ${matchLabel} (${matchedQty} cx)`;
      result.set(prod.cleanCode, {
        cleanCode: prod.cleanCode,
        code: prod.code,
        desc: prod.desc,
        isMatched: true,
        matchedInRound: confirmedInRound,
        matchedWithRound: confirmedWithRound,
        matchedWithLabel: matchLabel,
        statusText,
        confirmedQty: matchedQty,
        baseQty: q[0] ?? null,
        lastRecQty: q[q.length - 1] ?? null,
      });
    }
  });

  return result;
}
