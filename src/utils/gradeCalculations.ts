import { RawData, CalculatedProduct } from '../data/types';
import { parseColL } from './importer020502';
import * as XLSX from 'xlsx';

export interface ExpectedGradeItem {
  code: number;
  desc: string;
  disp020502: number;
  ajusteDiferenca: number;
  ajusteAvarias: number;
  quantidadeEsperada: number;
  codigoGrade: number;
  quantidadeReserva: number;
}

export interface LancadoGradeItem {
  code: number;
  desc?: string;
  unidadeMedida?: string;
  gradeEstoque?: number;
  quantidadeLancada: number; // Coluna GradeCadastrada
  reserva?: number;
  saida?: number;
  saldoDisponivel?: number;
}

export type CheckStatus = 'correto' | 'divergencia' | 'nao_lancado' | 'extra';

export interface CheckGradeComparisonRow {
  code: number;
  desc: string;
  unidadeMedida?: string;
  gradeEstoque?: number;
  quantidadeEsperada: number;
  quantidadeLancada: number; // GradeCadastrada
  reserva?: number;
  saida?: number;
  saldoDisponivel?: number;
  diferenca: number; // quantidadeLancada - quantidadeEsperada
  status: CheckStatus;
  statusLabel: string;
  isPermanente?: boolean;
}

/**
 * Produtos com quantidades fixas/permanentes na exportação e conferência da grade
 * Mesmo que não apareçam na 02.05.02 ou estejam zerados
 */
export const PERMANENT_GRADE_ITEMS: Record<number, { qty: number; desc: string }> = {
  38404: { qty: 20, desc: 'CORONA EXTRA N LN 330ML SIXPACK' },
  38405: { qty: 20, desc: 'BUDWEISER ZERO LN 330ML SIXPACK' },
  38406: { qty: 20, desc: 'CORONA CERO SUNBREW N LN 330ML SIX-PACK' },
  39024: { qty: 20, desc: 'STELLA ARTOIS PURE GOLD LN 330ML SIXPACK' },
  39025: { qty: 20, desc: 'MICHELOB ULTRA N LN 330ML SIXPACK' },
};

/**
 * Calcula a lista oficial de produtos esperados para a grade
 * Baseado na 02.05.02 (Coluna L), ajustes de DIF diária/congelada e quebras/avarias
 */
export function calculateExpectedGrade(
  data: RawData,
  calculatedMap: Record<number, CalculatedProduct>
): Map<number, ExpectedGradeItem> {
  const result = new Map<number, ExpectedGradeItem>();
  const seenCodes = new Set<number>();
  const desativadosSet = new Set(data.desativados || []);

  // 1. Fonte da 02.05.02
  const ecSource =
    data.gradeEc && Array.isArray(data.gradeEc.r) && data.gradeEc.r.length > 0
      ? data.gradeEc
      : data.ec && Array.isArray(data.ec.r) && data.ec.r.length > 0
      ? data.ec
      : null;

  // 2. Mapeamento da Coluna L
  const ecMap = new Map<number, { disp: number; desc?: string }>();
  if (ecSource && Array.isArray(ecSource.r)) {
    const headers = (ecSource.h || []).map((h) =>
      String(h || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
    );

    let pIdx = headers.findIndex((h) =>
      h === 'produto' || h === 'codigo' || h === 'cod produto' || h === 'cod prod' || h === 'cod' || h === 'mercadoria'
    );
    let dIdx = headers.findIndex((h) =>
      h.includes('descricao') || h.includes('descr') || h === 'nome'
    );
    let dispIdx = headers.findIndex((h) =>
      h === 'disponivel' || h === 'disponivel fiscal' || h === 'saldo grade real' || h === 'qtd estoque'
    );

    if (pIdx < 0) pIdx = 3;
    if (dIdx < 0) dIdx = 4;
    if (dispIdx < 0) dispIdx = 11;

    ecSource.r.forEach((row) => {
      if (!row || !Array.isArray(row)) return;
      let code = 0;
      if (row[pIdx] !== undefined && row[pIdx] !== null) {
        const v = String(row[pIdx]).trim().replace(/^0+/, '');
        const num = Number(v);
        if (!isNaN(num) && num > 10 && num < 99999999) {
          code = num;
        }
      }
      if (!code) {
        for (const c of [3, 0, 1, 2]) {
          const v = String(row[c] || '').trim().replace(/^0+/, '');
          const n = Number(v);
          if (!isNaN(n) && n > 10 && n < 99999999) {
            code = n;
            break;
          }
        }
      }
      if (code <= 0) return;

      let dispVal = 0;
      if (row.length > dispIdx && row[dispIdx] !== undefined && row[dispIdx] !== '') {
        dispVal = parseColL(row[dispIdx]);
      } else if (row.length > 11 && row[11] !== undefined && row[11] !== '') {
        dispVal = parseColL(row[11]);
      }

      const desc = (row[dIdx] && String(row[dIdx]).trim()) || `PRODUTO ${code}`;
      ecMap.set(code, { disp: dispVal, desc });
    });
  }

  // 3. Mapeamento de Avarias
  const avariasMap = new Map<number, number>();
  if (Array.isArray(data.aj?.av)) {
    data.aj.av.forEach((r) => {
      const code = Number(r[1]);
      const isPendente = r[4] === 'Pendente' || !r[4];
      if (code > 0 && isPendente) {
        avariasMap.set(code, (avariasMap.get(code) || 0) + Number(r[3] || 0));
      }
    });
  }
  if (Array.isArray(data.res)) {
    data.res.forEach((r) => {
      const code = r[0];
      const rn = Number(r[10] || 0);
      if (code > 0 && rn > 0) {
        avariasMap.set(code, (avariasMap.get(code) || 0) + rn);
      }
    });
  }

  // 4. Mapeamento de Diferenças
  const diferencasMap = new Map<number, number>();
  if (Array.isArray(data.dia)) {
    data.dia.forEach((d) => {
      const code = d[0];
      const val = d[2] !== 0 ? d[2] : d[1];
      if (val !== 0) diferencasMap.set(code, val);
    });
  }
  if (Array.isArray(data.men)) {
    data.men.forEach((row) => {
      const code = row[0];
      if (!diferencasMap.has(code)) {
        const days = row[4] || [];
        let lastVal: number | null = null;
        for (let i = days.length - 1; i >= 0; i--) {
          if (days[i] !== null && days[i] !== undefined) {
            lastVal = days[i];
            break;
          }
        }
        if (lastVal !== null && lastVal !== 0) {
          diferencasMap.set(code, lastVal);
        } else if (row[3] !== null && row[3] !== undefined && row[3] !== 0) {
          diferencasMap.set(code, row[3]);
        }
      }
    });
  }
  if (calculatedMap) {
    Object.entries(calculatedMap).forEach(([cStr, calc]) => {
      const code = Number(cStr);
      if (!diferencasMap.has(code) && calc.R !== 0) {
        diferencasMap.set(code, calc.R);
      }
    });
  }

  // 5. Montagem das linhas esperadas
  if (ecSource && Array.isArray(ecSource.r) && ecSource.r.length > 0) {
    ecSource.r.forEach((row) => {
      let code = 0;
      for (const c of [3, 0, 1, 2]) {
        const v = String(row[c] || '').trim().replace(/^0+/, '');
        const n = Number(v);
        if (!isNaN(n) && n > 10 && n < 99999999) {
          code = n;
          break;
        }
      }
      if (code <= 0 || seenCodes.has(code) || code === 6181 || desativadosSet.has(code)) return;
      seenCodes.add(code);

      const ecItem = ecMap.get(code);
      const calc = calculatedMap[code];
      const resRow = (data.res || []).find((r) => r[0] === code);

      const desc = ecItem?.desc || calc?.d || resRow?.[1] || `PRODUTO ${code}`;
      const disp020502 = ecItem ? Math.round(ecItem.disp) : Math.round(row.length > 11 ? parseColL(row[11]) : 0);

      const ajusteDiferenca = Math.round(diferencasMap.get(code) || 0);
      const fatorCx = calc?.V || resRow?.[4] || 1;
      const totalAvariasUnid = avariasMap.get(code) || 0;
      const ajusteAvarias = Math.round(totalAvariasUnid / (fatorCx > 0 ? fatorCx : 1));

      const quantidadeEsperada = Math.max(0, Math.round(disp020502 + ajusteDiferenca - ajusteAvarias));

      // Regra Promax: produtos zerados não são lançados
      if (quantidadeEsperada <= 0) return;

      result.set(code, {
        code,
        desc,
        disp020502,
        ajusteDiferenca,
        ajusteAvarias,
        quantidadeEsperada,
        codigoGrade: 1,
        quantidadeReserva: 0,
      });
    });
  } else {
    // Fallback Tabela 7
    (data.res || []).forEach((r) => {
      const code = r[0];
      if (code <= 0 || seenCodes.has(code) || code === 6181 || desativadosSet.has(code)) return;
      seenCodes.add(code);

      const calc = calculatedMap[code];
      const desc = calc?.d || r[1] || `PRODUTO ${code}`;
      const fatorCx = calc?.V || r[4] || 1;
      const disp020502 = Math.round(calc?.H !== undefined ? calc.H : (fatorCx > 1 ? Math.floor(r[3] / fatorCx) : r[3]));

      const ajusteDiferenca = Math.round(diferencasMap.get(code) || 0);
      const totalAvariasUnid = avariasMap.get(code) || 0;
      const ajusteAvarias = Math.round(totalAvariasUnid / (fatorCx > 0 ? fatorCx : 1));

      const quantidadeEsperada = Math.max(0, Math.round(disp020502 + ajusteDiferenca - ajusteAvarias));
      if (quantidadeEsperada <= 0) return;

      result.set(code, {
        code,
        desc,
        disp020502,
        ajusteDiferenca,
        ajusteAvarias,
        quantidadeEsperada,
        codigoGrade: 1,
        quantidadeReserva: 0,
      });
    });
  }

  // 6. Aplicação obrigatória das quantidades permanentes da grade
  // Mesmo que os produtos não apareçam na 02.05.02 ou estejam zerados
  Object.entries(PERMANENT_GRADE_ITEMS).forEach(([cStr, perm]) => {
    const code = Number(cStr);
    if (desativadosSet.has(code) || code === 6181) return;
    const calc = calculatedMap[code];
    const resRow = (data.res || []).find((r) => r[0] === code);
    const desc = calc?.d || resRow?.[1] || perm.desc;

    result.set(code, {
      code,
      desc,
      disp020502: perm.qty,
      ajusteDiferenca: 0,
      ajusteAvarias: 0,
      quantidadeEsperada: perm.qty,
      codigoGrade: 1,
      quantidadeReserva: 0,
    });
  });

  return result;
}

/**
 * Converte qualquer valor em número inteiro de quantidade
 */
export function parseCleanNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  let str = String(val).trim();
  if (!str) return 0;

  // Trata formato Promax caixas/garrafas (ex.: 340/00 ou 50/02)
  if (str.includes('/')) {
    const parts = str.split('/');
    const cx = parts[0].replace(/\./g, '').trim();
    const num = parseFloat(cx);
    return isNaN(num) ? 0 : Math.round(num);
  }

  // Trata formato pt-BR (1.320 ou 1.320,00 ou 1320)
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(str)) {
    str = str.replace(/\./g, '');
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num);
}

/**
 * Extrai código limpo de produto
 */
export function parseCleanCode(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') {
    return val > 10 && val < 99999999 ? val : 0;
  }
  const clean = String(val).replace(/\D/g, '');
  const num = Number(clean);
  return !isNaN(num) && num > 10 && num < 99999999 ? num : 0;
}

/**
 * Faz o parser do arquivo importado da grade do sistema (Excel, CSV, TSV ou Texto)
 */
export async function parseLancamentoGradeFile(
  file: File
): Promise<{ items: LancadoGradeItem[]; fileName: string; rawRowsCount: number }> {
  const fileName = file.name;
  const isExcel = /\.(xlsx|xls)$/i.test(fileName);

  if (isExcel) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number)[][];
    return parseLancamentoRows(rows, fileName);
  } else {
    const text = await file.text();
    return parseLancamentoText(text, fileName);
  }
}

/**
 * Processa texto colado ou linhas brutas
 */
export function parseLancamentoText(
  text: string,
  fileName: string = 'Texto Colado'
): { items: LancadoGradeItem[]; fileName: string; rawRowsCount: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: (string | number)[][] = lines.map((line) => {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes(';')) return line.split(';');
    if (line.includes(',')) return line.split(',');
    return line.trim().split(/\s{2,}/);
  });

  return parseLancamentoRows(rows, fileName);
}

/**
 * Extrai os itens lançados a partir das linhas detectando colunas
 */
export function parseLancamentoRows(
  rows: (string | number)[][],
  fileName: string
): { items: LancadoGradeItem[]; fileName: string; rawRowsCount: number } {
  if (!rows || rows.length === 0) {
    return { items: [], fileName, rawRowsCount: 0 };
  }

  // Detecta se a primeira linha é cabeçalho
  let headerRowIndex = -1;
  let codeCol = -1;
  let qtyCol = -1;
  let descCol = -1;
  let uCol = -1;
  let geCol = -1;
  let resCol = -1;
  let saiCol = -1;
  let sdCol = -1;

  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const row = rows[i] || [];
    const normalized = row.map((cell) =>
      String(cell || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    );

    // Procura por colunas típicas
    const cIdx = normalized.findIndex(
      (c) =>
        c === 'codigoproduto' ||
        c === 'codigo' ||
        c === 'cod' ||
        c === 'produto' ||
        c === 'codprod' ||
        c === 'mercadoria'
    );
    const dIdx = normalized.findIndex(
      (c) => c === 'descricaoproduto' || c.includes('descricao') || c.includes('descr') || c === 'nome'
    );
    const uIdx = normalized.findIndex(
      (c) => c === 'unidademedida' || c === 'unidade' || c === 'un' || c === 'und'
    );
    const geIdx = normalized.findIndex(
      (c) => c === 'gradeestoque' || c === 'grade' || c === 'codigograde'
    );

    // Coluna oficial de quantidade lançada: Prioriza GradeCadastrada
    let qIdx = normalized.findIndex(
      (c) => c === 'gradecadastrada' || c === 'gradecad' || c === 'gradecadastrado'
    );
    if (qIdx < 0) {
      qIdx = normalized.findIndex(
        (c) =>
          c === 'quantidadeproduto' ||
          c === 'quantidade' ||
          c === 'qtd' ||
          c === 'qtde' ||
          c === 'lancado' ||
          c === 'quantidadelancada' ||
          c === 'saldograde'
      );
    }

    const rIdx = normalized.findIndex((c) => c === 'reserva' || c === 'quantidadereserva');
    const sIdx = normalized.findIndex((c) => c === 'saida' || c === 'saidas');
    const sdispIdx = normalized.findIndex((c) => c === 'saldodisponivel' || c === 'disponivel');

    if (cIdx >= 0 && qIdx >= 0) {
      headerRowIndex = i;
      codeCol = cIdx;
      qtyCol = qIdx;
      descCol = dIdx;
      uCol = uIdx;
      geCol = geIdx;
      resCol = rIdx;
      saiCol = sIdx;
      sdCol = sdispIdx;
      break;
    }
  }

  // Se for o formato oficial de 4 colunas sem cabeçalho específico:
  // Col 0: CodigoProduto, Col 1: CodigoGrade, Col 2: QuantidadeProduto, Col 3: QuantidadeReserva
  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  if (codeCol < 0 || qtyCol < 0) {
    codeCol = 0;
    qtyCol = 2; // Padrão da exportação oficial
  }

  const itemsMap = new Map<number, LancadoGradeItem>();

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    let code = parseCleanCode(row[codeCol]);
    let qty = parseCleanNumber(row[qtyCol]);

    // Fallback: se na posição detectada não encontrou código válido, procura na linha
    if (code <= 0) {
      for (let c = 0; c < row.length; c++) {
        const potentialCode = parseCleanCode(row[c]);
        if (potentialCode > 0) {
          code = potentialCode;
          if (qtyCol === c) {
            qty = parseCleanNumber(row[c + 1] !== undefined ? row[c + 1] : row[c + 2]);
          }
          break;
        }
      }
    }

    if (code > 0) {
      const desc = descCol >= 0 && row[descCol] ? String(row[descCol]).trim() : undefined;
      const unidadeMedida = uCol >= 0 && row[uCol] ? String(row[uCol]).trim() : undefined;
      const gradeEstoque = geCol >= 0 ? parseCleanNumber(row[geCol]) : undefined;
      const reserva = resCol >= 0 ? parseCleanNumber(row[resCol]) : undefined;
      const saida = saiCol >= 0 ? parseCleanNumber(row[saiCol]) : undefined;
      const saldoDisponivel = sdCol >= 0 ? parseCleanNumber(row[sdCol]) : undefined;

      const existing = itemsMap.get(code);
      if (existing) {
        existing.quantidadeLancada += qty;
        if (!existing.desc && desc) existing.desc = desc;
        if (!existing.unidadeMedida && unidadeMedida) existing.unidadeMedida = unidadeMedida;
        if (reserva !== undefined) existing.reserva = (existing.reserva || 0) + reserva;
        if (saida !== undefined) existing.saida = (existing.saida || 0) + saida;
        if (saldoDisponivel !== undefined) existing.saldoDisponivel = (existing.saldoDisponivel || 0) + saldoDisponivel;
      } else {
        itemsMap.set(code, {
          code,
          desc,
          unidadeMedida,
          gradeEstoque,
          quantidadeLancada: qty,
          reserva,
          saida,
          saldoDisponivel,
        });
      }
    }
  }

  return {
    items: Array.from(itemsMap.values()),
    fileName,
    rawRowsCount: rows.length,
  };
}

/**
 * Compara a grade esperada (da plataforma) com o relatório importado da grade lançada
 */
export function compareGradeLaunch(
  expectedMap: Map<number, ExpectedGradeItem>,
  launchedItems: LancadoGradeItem[],
  calculatedMap: Record<number, CalculatedProduct>
): CheckGradeComparisonRow[] {
  const launchedMap = new Map<number, LancadoGradeItem>();
  launchedItems.forEach((item) => {
    launchedMap.set(item.code, item);
  });

  const allCodes = new Set<number>();
  expectedMap.forEach((_, code) => allCodes.add(code));
  launchedMap.forEach((_, code) => allCodes.add(code));

  const rows: CheckGradeComparisonRow[] = [];

  allCodes.forEach((code) => {
    const expected = expectedMap.get(code);
    const launched = launchedMap.get(code);

    const quantidadeEsperada = expected ? expected.quantidadeEsperada : 0;
    const quantidadeLancada = launched ? launched.quantidadeLancada : 0;
    const diferenca = quantidadeLancada - quantidadeEsperada;

    const calc = calculatedMap[code];
    const desc = launched?.desc || expected?.desc || calc?.d || `PRODUTO ${code}`;
    const unidadeMedida = launched?.unidadeMedida || calc?.t || 'cx';
    const gradeEstoque = launched?.gradeEstoque !== undefined ? launched.gradeEstoque : 1;
    const reserva = launched?.reserva;
    const saida = launched?.saida;
    const saldoDisponivel = launched?.saldoDisponivel;

    let status: CheckStatus = 'correto';
    let statusLabel = '✓ 100% CORRETO';

    if (quantidadeEsperada > 0 && quantidadeLancada === 0) {
      status = 'nao_lancado';
      statusLabel = '❌ NÃO LANÇADO NO SISTEMA';
    } else if (quantidadeEsperada === 0 && quantidadeLancada > 0) {
      status = 'extra';
      statusLabel = '❓ ITEM NÃO PREVISTO (EXTRA)';
    } else if (diferenca !== 0) {
      status = 'divergencia';
      statusLabel = diferenca > 0 ? `▲ LANÇADO A MAIS (+${diferenca} cx)` : `▼ LANÇADO A MENOS (${diferenca} cx)`;
    }

    rows.push({
      code,
      desc,
      unidadeMedida,
      gradeEstoque,
      quantidadeEsperada,
      quantidadeLancada,
      reserva,
      saida,
      saldoDisponivel,
      diferenca,
      status,
      statusLabel,
      isPermanente: !!PERMANENT_GRADE_ITEMS[code],
    });
  });

  // Ordena por status crítico primeiro (Não lançados, divergências, extras, e depois corretos)
  const statusPriority: Record<CheckStatus, number> = {
    nao_lancado: 1,
    divergencia: 2,
    extra: 3,
    correto: 4,
  };

  rows.sort((a, b) => {
    const prioDiff = statusPriority[a.status] - statusPriority[b.status];
    if (prioDiff !== 0) return prioDiff;
    return a.code - b.code;
  });

  return rows;
}
