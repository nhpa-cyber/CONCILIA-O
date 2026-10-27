import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { RawData } from '../data/types';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Upload, 
  Download, 
  Trash2, 
  Search, 
  FileSpreadsheet, 
  Layers, 
  Plus, 
  HelpCircle,
  FileCheck
} from 'lucide-react';

interface Contagem021101ViewProps {
  data: RawData;
  onUpdateData: (newData: RawData, desc: string) => void;
}

interface ParsedProductItem {
  code: string;       // 8-digit zero-padded product code (e.g. "00025303")
  cleanCode: number;  // integer product code (e.g. 25303)
  desc: string;       // product description
  qty: number;        // total counted quantity in this file
}

/**
 * Normaliza textos para busca de cabeçalho
 */
function normalizeHeader(v: any): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Converte valor de quantidade (trata Promax cx/gf, decimais, negativos)
 */
function parseQuantityValue(val: any): number {
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
function detectColumns(rows: (string | number)[][]): {
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

    // Se encontrou código e mais alguma coluna, ou pelo menos duas colunas-chave
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
      
      // Rotina Promax / WinThor 02.11.01 padrão tem 10+ colunas:
      // Col C (índice 2) = Código do Produto
      // Col D (índice 3) = Descrição
      // Col J (índice 9) = Quantidade (Qtdade)
      if (maxCols >= 10) {
        if (codeCol < 0) codeCol = 2;
        if (descCol < 0) descCol = 3;
        if (qtyCol < 0) qtyCol = 9;
      } else {
        // Encontra coluna de descrição (contém texto alfabético)
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

        // Encontra coluna de código: valores numéricos de 2 a 8 dígitos, não constante como filial
        let candidateCodeCol = -1;
        for (let col = 0; col < maxCols; col++) {
          if (col === descCol) continue;
          const vals = sample.map(r => String(r[col] || '').trim()).filter(Boolean);
          const uniqueVals = new Set(vals);
          // Se todos os valores forem iguais (ex: Filial "1"), pula pois não é código de produto
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

  // Fallbacks finais garantidos para 02.11.01
  if (codeCol < 0) codeCol = 2;
  if (descCol < 0) descCol = 3;
  if (qtyCol < 0) qtyCol = 9;

  return { headerIdx, codeCol, descCol, qtyCol };
}

/**
 * Converte linhas brutas de um arquivo em mapa de produtos com código, descrição e quantidade somada
 */
function parseRowsToProducts(
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

    // Extrai o valor do código
    const rawVal = String(row[codeCol] ?? '').trim();
    if (!rawVal) continue;

    // Pula linhas que sejam repetições de cabeçalho
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

    // Extrai a descrição
    let desc = descCol >= 0 && descCol < row.length ? String(row[descCol] ?? '').trim() : '';
    // Se a descrição estiver vazia ou for apenas número, tenta buscar no catálogo oficial
    if ((!desc || /^\d+$/.test(desc)) && catalogMap && catalogMap.has(paddedCode)) {
      desc = catalogMap.get(paddedCode)!;
    }

    // Extrai a quantidade
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

export const Contagem021101View: React.FC<Contagem021101ViewProps> = ({
  data,
  onUpdateData,
}) => {
  const contagemState = data.contagem021101 || { counts: [] };

  const [statusRec, setStatusRec] = useState<string>('');
  const [errorRec, setErrorRec] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'divergent' | 'matched'>('all');
  const [viewScope, setViewScope] = useState<'recontados' | 'all'>('recontados');

  // Mapa de produtos de Estoque Central para enriquecimento de descrição
  const catalogMap = useMemo(() => {
    const map = new Map<string, string>();
    if (data.ec?.r) {
      const { h, r } = data.ec;
      let ip = 3;
      let id = 4;
      if (h && h.length > 0) {
        const foundP = h.findIndex(x => String(x || '').toLowerCase().startsWith('produto'));
        const foundD = h.findIndex(x => String(x || '').toLowerCase().startsWith('descricao'));
        if (foundP >= 0) ip = foundP;
        if (foundD >= 0) id = foundD;
      }
      r.forEach(row => {
        if (!row[ip]) return;
        const codePad = String(row[ip]).replace(/\D/g, '').padStart(8, '0');
        const desc = String(row[id] || '').trim();
        if (codePad && desc) {
          map.set(codePad, desc);
        }
      });
    }
    return map;
  }, [data.ec]);

  // Mapa de Disponível da 02.05.02 importada por código de produto
  const disp020502Map = useMemo(() => {
    const map = new Map<number, {
      raw: string;
      unit: string;
      unidades?: number;
      isNegative?: boolean;
    }>();

    // 1. Tenta extrair diretamente do relatório bruto da 02.05.02 (Estoque Central)
    if (data.ec?.r && Array.isArray(data.ec.r)) {
      const { h, r } = data.ec;
      let ip = 3;
      let iu = 5;
      let idisp = 11;

      if (h && h.length > 0) {
        const foundP = h.findIndex(x => String(x || '').toLowerCase().startsWith('produto'));
        const foundU = h.findIndex(x => String(x || '').toLowerCase().startsWith('unidade'));
        const foundDisp = h.findIndex(x => {
          const s = String(x || '').toLowerCase();
          return s.startsWith('disponivel') || s.startsWith('disponível') || s.includes('disp');
        });

        if (foundP >= 0) ip = foundP;
        if (foundU >= 0) iu = foundU;
        if (foundDisp >= 0) idisp = foundDisp;
      }

      r.forEach(row => {
        if (!row || row[ip] === undefined || row[ip] === null) return;
        const cleanCode = parseInt(String(row[ip]).replace(/\D/g, ''), 10);
        if (isNaN(cleanCode)) return;

        const rawDispStr = String(row[idisp] ?? '').trim();
        const unitStr = String(row[iu] ?? '').trim();
        const isNeg = rawDispStr.endsWith('-') || rawDispStr.startsWith('-');

        map.set(cleanCode, {
          raw: rawDispStr || '0/00',
          unit: unitStr || 'cx',
          isNegative: isNeg,
        });
      });
    }

    // 2. Se houver itens em data.res que ainda não estão no map, preenche com saldo do Resumo
    if (data.res && Array.isArray(data.res)) {
      data.res.forEach(resRow => {
        const cod = resRow[0];
        if (!map.has(cod)) {
          const dispUnid = resRow[3] ?? 0;
          const fatorCx = resRow[4] || 1;
          const tipo = resRow[2] || 'cx';
          const cx = Math.floor(Math.abs(dispUnid) / fatorCx);
          const rest = Math.abs(dispUnid) % fatorCx;
          const rawFormatted = fatorCx > 1
            ? `${dispUnid < 0 ? '-' : ''}${cx}/${String(rest).padStart(2, '0')}`
            : `${dispUnid.toLocaleString('pt-BR')}`;
          
          map.set(cod, {
            raw: rawFormatted,
            unit: tipo,
            unidades: dispUnid,
            isNegative: dispUnid < 0,
          });
        }
      });
    }

    return map;
  }, [data.ec, data.res]);

  const persistCounts = (newCounts: typeof contagemState.counts) => {
    const nextData: RawData = {
      ...data,
      contagem021101: { counts: newCounts },
    };
    onUpdateData(nextData, 'Atualização na Contagem 02.11.01');
  };

  const decodeBuffer = (buf: ArrayBuffer) => {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder('windows-1252').decode(buf);
    }
  };

  const parseCsvLines = (t: string): (string | number)[][] => {
    const lines = t.split(/\r?\n/).filter((x) => x.trim().length > 0);
    if (lines.length === 0) return [];
    
    // Detecta separador
    const firstLines = lines.slice(0, 10).join('\n');
    let delim = ';';
    const semicolons = (firstLines.match(/;/g) || []).length;
    const tabs = (firstLines.match(/\t/g) || []).length;
    const commas = (firstLines.match(/,/g) || []).length;
    const pipes = (firstLines.match(/\|/g) || []).length;

    if (tabs > semicolons && tabs > commas) delim = '\t';
    else if (pipes > semicolons && pipes > commas) delim = '|';
    else if (commas > semicolons && commas > 5) delim = ',';

    return lines.map(line => line.split(delim).map(cell => cell.trim().replace(/^"|"$/g, '')));
  };

  // Importa múltiplos arquivos de contagem 02.11.01
  const handleRecFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = [...(e.target.files || [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt', { numeric: true })
    );
    if (fs.length === 0) return;

    try {
      const newCounts = [...contagemState.counts];
      let totalImportedProducts = 0;

      for (const f of fs) {
        let rows: (string | number)[][] = [];

        const isExcel = f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls');
        if (isExcel) {
          const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const sheetData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
          if (sheetData.length > 0) {
            rows = sheetData.map((row) => (row as any[]).map((c) => String(c ?? '').trim()));
          }
        } else {
          rows = parseCsvLines(decodeBuffer(await f.arrayBuffer()));
        }

        if (rows.length === 0) continue;

        // Faz o parsing das linhas para verificar quantidade de produtos válidos
        const parsedMap = parseRowsToProducts(rows, catalogMap);
        const parsedItems = Array.from(parsedMap.values());
        totalImportedProducts += parsedItems.length;

        // Atribui label legível sequencial:
        // 1ª contagem = Contagem 1 (Base)
        // 2ª contagem = Contagem 2 (1ª Recontagem)
        // 3ª contagem = Contagem 3 (2ª Recontagem), etc.
        const countNumber = newCounts.length + 1;
        const cleanName = f.name.replace(/\.[^/.]+$/, '');
        const label = countNumber === 1
          ? 'Contagem 1 (Base)'
          : `Contagem ${countNumber} (${countNumber - 1}ª Recontagem)`;

        newCounts.push({
          id: Date.now().toString() + Math.random().toString().slice(2, 6),
          label,
          fileName: cleanName,
          rows,
          totalItems: parsedItems.length,
          parsedItems,
          importedAt: new Date().toISOString(),
        });
      }

      setStatusRec(
        `✓ ${fs.length} arquivo(s) importado(s) com sucesso (${totalImportedProducts} produtos lidos no total)`
      );
      setErrorRec(false);
      e.target.value = '';
      persistCounts(newCounts);
    } catch (er: any) {
      console.error('handleRecFiles Error:', er);
      setStatusRec(er.message || 'Erro ao processar arquivo.');
      setErrorRec(true);
    }
  };

  // Exclui uma contagem individual
  const handleDeleteCount = (index: number) => {
    const updated = contagemState.counts.filter((_, i) => i !== index);
    // Renomeia sequencialmente para manter Contagem 1 (Base), Contagem 2 (1ª Recontagem)...
    const renumbered = updated.map((c, i) => ({
      ...c,
      label: i === 0 ? 'Contagem 1 (Base)' : `Contagem ${i + 1} (${i}ª Recontagem)`,
    }));
    persistCounts(renumbered);
    setStatusRec(`Contagem removida com sucesso.`);
  };

  // Limpa todas as contagens
  const handleClear = () => {
    if (window.confirm('Tem certeza que deseja apagar todas as contagens 02.11.01 importadas?')) {
      persistCounts([]);
      setStatusRec('Todas as contagens foram limpas.');
      setErrorRec(false);
    }
  };

  /**
   * Helper para formatar o cabeçalho de cada contagem (Contagem 1 = Base; Contagem 2 = 1ª Recontagem, etc.)
   */
  const getCountHeaderInfo = (idx: number, originalLabel?: string) => {
    if (idx === 0) {
      return {
        main: 'Contagem 1',
        sub: 'Base do Armazém',
        isBase: true,
      };
    }
    return {
      main: `Contagem ${idx + 1}`,
      sub: `${idx}ª Recontagem`,
      isBase: false,
    };
  };

  /**
   * Processa todas as contagens e gera a lista comparativa completa:
   * - Contagem 1 = Base com todos os produtos (~250 itens)
   * - 1ª Recontagem (Contagem 2) = compara com a Base e filtra apenas os recontados
   * - 2ª Recontagem (Contagem 3) = compara com a 1ª Recontagem E com a Base
   * - 3ª Recontagem (Contagem 4) = analisa as 4 contagens juntas
   * - E segue sucessivamente para 6 ou mais rodadas!
   */
  const comparativeData = useMemo(() => {
    const countsList = contagemState.counts;
    const numCounts = countsList.length;

    // 1. Extrai o mapa de produtos para cada contagem
    const countMaps = countsList.map(c => {
      if (c.parsedItems && c.parsedItems.length > 0) {
        const m = new Map<string, ParsedProductItem>();
        c.parsedItems.forEach(item => m.set(item.code, item));
        return m;
      }
      return parseRowsToProducts(c.rows, catalogMap);
    });

    // 2. Cria mapa unificado de todos os produtos
    const allProducts = new Map<
      string,
      {
        code: string;
        cleanCode: number;
        desc: string;
        quantities: (number | null)[];
        cellMatches: Record<number, { matched: boolean; withRound: number }>;
        isMatched: boolean;
        matchedInRound: number | null;
        matchedWithRound: number | null;
        matchedWithLabel: string;
        divergentInLast: boolean;
        statusText: string;
        statusColor: 'green' | 'amber' | 'neutral' | 'blue';
        confirmedQty: number | null;
        hasAnyRecontagem: boolean;
      }
    >();

    countMaps.forEach((map, cIdx) => {
      map.forEach((item, code) => {
        if (!allProducts.has(code)) {
          allProducts.set(code, {
            code,
            cleanCode: item.cleanCode,
            desc: item.desc,
            quantities: new Array(numCounts).fill(null),
            cellMatches: {},
            isMatched: false,
            matchedInRound: null,
            matchedWithRound: null,
            matchedWithLabel: '',
            divergentInLast: false,
            statusText: '',
            statusColor: 'neutral',
            confirmedQty: null,
            hasAnyRecontagem: false,
          });
        }
        const record = allProducts.get(code)!;
        record.quantities[cIdx] = item.qty;
        if ((!record.desc || /^\d+$/.test(record.desc)) && item.desc) {
          record.desc = item.desc;
        }
      });
    });

    // 3. Aplica a lógica comparativa multi-rodada da rotina de conferência:
    allProducts.forEach((prod) => {
      const q = prod.quantities;

      // Identifica se este produto participou de alguma recontagem (da 2ª contagem em diante)
      prod.hasAnyRecontagem = q.slice(1).some(v => v !== null);

      if (numCounts === 0) return;

      if (numCounts === 1) {
        prod.isMatched = false;
        prod.statusText = 'Base Inicial do Armazém';
        prod.statusColor = 'neutral';
        prod.confirmedQty = q[0];
        return;
      }

      let confirmedInRound: number | null = null;
      let confirmedWithRound: number | null = null;
      let matchedQty: number | null = null;
      let matchLabel = '';

      // Avalia cada rodada de recontagem (i = 1, 2, 3...)
      for (let i = 1; i < numCounts; i++) {
        const currentQ = q[i];
        if (currentQ === null) continue;

        // Compara o valor atual com as contagens anteriores:
        // Prioridade 1: imediatamente anterior (i - 1)
        // Prioridade 2: outras recontagens anteriores (i - 2 ... 1)
        // Prioridade 3: contagem base (índice 0)
        let foundMatchIdx: number | null = null;

        if (q[i - 1] !== null && currentQ === q[i - 1]) {
          foundMatchIdx = i - 1;
        } else {
          for (let prevIdx = i - 2; prevIdx >= 1; prevIdx--) {
            if (q[prevIdx] !== null && currentQ === q[prevIdx]) {
              foundMatchIdx = prevIdx;
              break;
            }
          }
          if (foundMatchIdx === null && q[0] !== null && currentQ === q[0]) {
            foundMatchIdx = 0;
          }
        }

        if (foundMatchIdx !== null) {
          prod.cellMatches[i] = {
            matched: true,
            withRound: foundMatchIdx,
          };
          confirmedInRound = i + 1;
          confirmedWithRound = foundMatchIdx + 1;
          matchedQty = currentQ;
          matchLabel = foundMatchIdx === 0
            ? 'a Contagem Base'
            : `${foundMatchIdx}ª Recontagem (Cont. ${foundMatchIdx + 1})`;
        } else {
          prod.cellMatches[i] = {
            matched: false,
            withRound: -1,
          };
        }
      }

      if (confirmedInRound !== null) {
        prod.isMatched = true;
        prod.matchedInRound = confirmedInRound;
        prod.matchedWithRound = confirmedWithRound;
        prod.matchedWithLabel = matchLabel;
        prod.statusText = `✓ Bateu c/ ${matchLabel}`;
        prod.statusColor = 'green';
        prod.confirmedQty = matchedQty;
      } else {
        if (prod.hasAnyRecontagem) {
          prod.isMatched = false;
          prod.divergentInLast = true;
          const nextRound = numCounts + 1;
          prod.statusText = `Divergente (Recontar na Cont. ${nextRound})`;
          prod.statusColor = 'amber';
          prod.confirmedQty = null;
        } else {
          prod.isMatched = false;
          prod.statusText = 'Apenas na Base (Não Recontado)';
          prod.statusColor = 'blue';
          prod.confirmedQty = q[0] ?? null;
        }
      }
    });

    const allWarehouseItems = Array.from(allProducts.values()).sort((a, b) => a.cleanCode - b.cleanCode);
    const recountedItems = allWarehouseItems.filter(x => x.hasAnyRecontagem);

    // Conforme especificado pelo usuário:
    // "Basicamente só vai aparecer os itens que estiverem na primeira recontagem que são os itens que quer analisar.
    // Fazendo isso partimos para uma segunda recontagem... verificar com a contagem base e com a primeira..."
    // Se há 2 ou mais contagens, o foco padrão é estritamente os itens recontados.
    const activeItems = (numCounts >= 2 && viewScope === 'recontados')
      ? recountedItems
      : allWarehouseItems;

    const matchedCount = activeItems.filter(x => x.isMatched).length;
    const divergentCount = activeItems.filter(x => x.divergentInLast).length;
    const pendingCount = activeItems.filter(x => !x.isMatched && !x.divergentInLast).length;

    return {
      allWarehouseItems,
      recountedItems,
      activeItems,
      allWarehouseCount: allWarehouseItems.length,
      recountedCount: recountedItems.length,
      totalActive: activeItems.length,
      matchedCount,
      divergentCount,
      pendingCount,
      numCounts,
      countsList,
    };
  }, [contagemState.counts, catalogMap, viewScope]);

  // Lista filtrada por busca e tipo de status
  const filteredList = useMemo(() => {
    let list = comparativeData.activeItems;

    if (filterType === 'divergent') {
      list = list.filter(item => item.divergentInLast);
    } else if (filterType === 'matched') {
      list = list.filter(item => item.isMatched);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(item => 
        item.code.includes(q) ||
        item.cleanCode.toString().includes(q) ||
        item.desc.toLowerCase().includes(q)
      );
    }

    return list;
  }, [comparativeData.activeItems, filterType, searchTerm]);

  // Exportar Excel Completo
  const handleExportFullExcel = () => {
    if (comparativeData.activeItems.length === 0) return;

    const headers = [
      'Código',
      'Código Limpo',
      'Descrição',
      'Status',
      ...comparativeData.countsList.map((c, idx) => {
        const info = getCountHeaderInfo(idx);
        return `${info.main} - ${info.sub} (${c.fileName || '02.11.01'})`;
      }),
      'Saldo Confirmado',
    ];

    const dataRows = comparativeData.activeItems.map(item => [
      item.code,
      item.cleanCode,
      item.desc,
      item.statusText,
      ...item.quantities.map(q => (q !== null ? q : '')),
      item.confirmedQty !== null ? item.confirmedQty : 'PENDENTE',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comparativo 02.11.01');
    XLSX.writeFile(wb, `Comparativo_Contagens_021101_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Exportar apenas itens divergentes para envio ao coletor / próxima contagem
  const handleExportDivergentExcel = () => {
    const divergentItems = comparativeData.activeItems.filter(x => x.divergentInLast);
    if (divergentItems.length === 0) {
      alert('Nenhum item divergente pendente no momento!');
      return;
    }

    const nextCountNumber = comparativeData.numCounts + 1;
    const nextRecNumber = comparativeData.numCounts;
    const headers = [
      'Código',
      'Código Formatado',
      'Descrição',
      'Status Atual',
      ...comparativeData.countsList.map((_, idx) => {
        const info = getCountHeaderInfo(idx);
        return `${info.main} (${info.sub})`;
      }),
      `Contagem ${nextCountNumber} (${nextRecNumber}ª Recontagem)`,
    ];

    const dataRows = divergentItems.map(item => [
      item.cleanCode,
      item.code,
      item.desc,
      item.statusText,
      ...item.quantities.map(q => (q !== null ? q : '-')),
      '', // Coluna em branco para anotação / contagem no coletor
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Recontar_Contagem_${nextCountNumber}`);
    XLSX.writeFile(
      wb, 
      `Itens_Para_Contagem_${nextCountNumber}_021101_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <div className="w-full bg-slate-50 min-h-screen p-4 md:p-6 font-sans flex justify-center">
      <div className="w-full max-w-5xl mx-auto space-y-6">
        
        {/* CABEÇALHO CENTRALIZADO */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col items-center justify-center text-center gap-3">
          <div className="flex flex-col items-center justify-center text-center max-w-2xl">
            <div className="flex items-center justify-center gap-2">
              <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-md uppercase tracking-wider">
                Rotina 02.11.01
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-500">Conferência Cega & Comparativo de Recontagens</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-2 text-center">
              Contagem 02.11.01 (Múltiplas Rodadas)
            </h1>
            <p className="text-sm text-slate-600 mt-1 text-center">
              <b>Contagem 1:</b> Base geral do armazém (~250 itens). <b>Recontagens (2ª, 3ª, 4ª...):</b> Comparativo direto com a Base e recontagens anteriores para validar quais itens <b className="text-emerald-700">bateram</b>.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 flex-wrap">
            {comparativeData.activeItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExportFullExcel}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition shadow-xs cursor-pointer"
                  title="Exportar planilha Excel completa"
                >
                  <Download size={14} />
                  <span>Exportar Excel</span>
                </button>

                {comparativeData.divergentCount > 0 && (
                  <button
                    type="button"
                    onClick={handleExportDivergentExcel}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition shadow-xs cursor-pointer"
                    title="Exportar apenas itens divergentes para coletor"
                  >
                    <FileSpreadsheet size={14} />
                    <span>Lista p/ Recontar ({comparativeData.divergentCount})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 transition shadow-xs cursor-pointer"
                  title="Limpar todas as contagens importadas"
                >
                  <Trash2 size={14} />
                  <span>Limpar Tudo</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* ÁREA DE IMPORTAÇÃO CENTRALIZADA */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs flex flex-col items-center text-center">
          <div className="flex flex-col items-center justify-center text-center mb-4 max-w-2xl">
            <h2 className="text-sm font-bold text-slate-900 flex items-center justify-center gap-2">
              <Upload size={16} className="text-purple-600" />
              <span>Importar Arquivo 02.11.01 (Contagem / Recontagem)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 text-center">
              Suporta planilhas Excel (<b>.xlsx</b>, <b>.xls</b>) e arquivos de coletor (<b>.csv</b>, <b>.txt</b>). O sistema extrai automaticamente o <b>Código (Col. C)</b>, <b>Descrição (Col. D)</b> e <b>Quantidade (Col. J)</b> da rotina 02.11.01 PW03018R.
            </p>
            <div className="mt-2.5 flex justify-center">
              {contagemState.counts.length === 0 ? (
                <span className="text-xs font-bold px-3 py-1 bg-purple-100 text-purple-800 rounded-full inline-block">
                  1º Arquivo: <b>Contagem 1 (Base do Armazém Inteiro)</b>
                </span>
              ) : contagemState.counts.length === 1 ? (
                <span className="text-xs font-bold px-3 py-1 bg-amber-100 text-amber-900 rounded-full inline-block">
                  Próximo arquivo: <b>1ª Recontagem (Contagem 2)</b>
                </span>
              ) : (
                <span className="text-xs font-bold px-3 py-1 bg-purple-100 text-purple-900 rounded-full inline-block">
                  Próximo arquivo: <b>{contagemState.counts.length}ª Recontagem (Contagem {contagemState.counts.length + 1})</b>
                </span>
              )}
            </div>
          </div>

          <div className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/30 rounded-xl p-5 transition text-center cursor-pointer relative w-full max-w-3xl mx-auto">
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              multiple
              onChange={handleRecFiles}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              title="Clique ou arraste arquivos 02.11.01 aqui"
            />
            <div className="flex flex-col items-center justify-center pointer-events-none py-1">
              <Upload size={24} className="text-purple-600 mb-1" />
              <span className="text-sm font-semibold text-purple-900 text-center">
                {contagemState.counts.length === 0 
                  ? 'Selecione a Contagem 1 (Base do Armazém Inteiro ~250 itens)' 
                  : contagemState.counts.length === 1 
                  ? 'Selecione a 1ª Recontagem (Contagem 2 ~20 a 40 itens) para comparar com a Base'
                  : `Selecione a ${contagemState.counts.length}ª Recontagem (Contagem ${contagemState.counts.length + 1})`}
              </span>
              <span className="text-xs text-purple-700/80 mt-0.5 text-center max-w-xl">
                {contagemState.counts.length === 0
                  ? 'O 1º arquivo será a Contagem Base do armazém inteiro.'
                  : contagemState.counts.length === 1
                  ? 'O sistema comparará a 1ª Recontagem com a Base e exibirá apenas os itens recontados que você quer analisar.'
                  : `O sistema analisará as ${contagemState.counts.length + 1} contagens juntas (verificando se bate com a Base ou com recontagens anteriores).`}
              </span>
            </div>
          </div>

          {statusRec && (
            <div className={`mt-3 text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-2 ${
              errorRec ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}>
              {errorRec ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
              <span>{statusRec}</span>
            </div>
          )}

          {/* LISTA DE CONTAGENS CARREGADAS */}
          {contagemState.counts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 block mb-2">
                Arquivos / Rodadas Carregadas ({contagemState.counts.length}):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {contagemState.counts.map((c, i) => {
                  const info = getCountHeaderInfo(i, c.label);
                  return (
                    <div
                      key={c.id || i}
                      className={`p-2.5 border rounded-lg flex items-center justify-between text-xs transition ${
                        info.isBase ? 'bg-purple-50/60 border-purple-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                          <span className={`w-2 h-2 rounded-full ${info.isBase ? 'bg-purple-700' : 'bg-emerald-600'}`}></span>
                          <span className="truncate">{info.main}</span>
                          <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded">
                            {info.sub}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5" title={c.fileName || ''}>
                          {c.fileName || 'Arquivo 02.11.01'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {c.totalItems ? `${c.totalItems} produtos lidos` : (c.rows?.length ? `${c.rows.length} linhas` : 'Carregado')}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCount(i)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                        title={`Remover ${info.main}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>


        {/* BANNER DE ITENS QUE BATERAM (CONFIRMADOS) */}
        {comparativeData.matchedCount > 0 && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex items-center justify-between flex-wrap gap-3 text-xs text-emerald-950 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="blink-recontagem text-lg">⚡</span>
              <div>
                <div className="font-bold flex items-center gap-1.5 text-[12.5px] text-emerald-900">
                  <span>{comparativeData.matchedCount} PRODUTO(S) COM RECONTAGEM BATIDA:</span>
                  <span className="bg-emerald-600 text-white text-[9.5px] font-black px-1.5 py-0.5 rounded">
                    DIFERENÇA CONFIRMADA
                  </span>
                </div>
                <div className="text-emerald-800 text-[11px] mt-0.5">
                  Estes itens coincidiram com a Contagem Base (ou recontagem anterior). A contagem física foi confirmada e os produtos estão <b>piscando com o selo ⚡ BATEU</b> aqui e também no <b>Dashboard Principal</b>.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFilterType(filterType === 'matched' ? 'all' : 'matched')}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg transition shadow-xs cursor-pointer text-xs flex items-center gap-1.5"
            >
              <span>⚡</span>
              <span>{filterType === 'matched' ? 'Ver Todos os Itens' : `Filtrar os que Bateram (${comparativeData.matchedCount})`}</span>
            </button>
          </div>
        )}

        {/* TABELA COMPARATIVA */}
        {comparativeData.activeItems.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            
            {/* BARRA DE FILTROS E ESCOPO */}
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2 flex-wrap">
                
                {/* Seletor de Escopo (Apenas Recontados vs Todos do Armazém) */}
                {comparativeData.numCounts >= 2 && (
                  <div className="inline-flex rounded-lg border border-purple-200 bg-purple-50/60 p-0.5 mr-1">
                    <button
                      type="button"
                      onClick={() => setViewScope('recontados')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                        viewScope === 'recontados'
                          ? 'bg-purple-700 text-white shadow-xs'
                          : 'text-purple-900 hover:bg-purple-100/70'
                      }`}
                      title="Exibe somente os itens que foram para recontagem (análise focada)"
                    >
                      Apenas Recontados ({comparativeData.recountedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewScope('all')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
                        viewScope === 'all'
                          ? 'bg-purple-700 text-white shadow-xs'
                          : 'text-purple-900 hover:bg-purple-100/70'
                      }`}
                      title="Exibe todos os produtos da contagem base do armazém"
                    >
                      Todos da Base ({comparativeData.allWarehouseCount})
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Todos ({filteredList.length})
                </button>

                <button
                  type="button"
                  onClick={() => setFilterType('matched')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    filterType === 'matched'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <CheckCircle2 size={13} />
                  <span>Bateram ({comparativeData.matchedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterType('divergent')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                    filterType === 'divergent'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  <AlertTriangle size={13} />
                  <span>Divergentes / Recontar ({comparativeData.divergentCount})</span>
                </button>
              </div>

              <div className="relative w-full md:w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por código ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>

            {/* TABELA DE DADOS */}
            <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold sticky top-0 z-10 border-b border-slate-200 text-[11px] tracking-wider">
                  <tr>
                    <th className="py-3 px-3 w-28 text-center">Código</th>
                    <th className="py-3 px-4 min-w-[240px] text-center">Descrição</th>
                    <th className="py-3 px-3 min-w-[150px] text-center bg-blue-50/70 border-x border-blue-200 text-blue-950">
                      <div className="font-bold">Disponível 02.05.02</div>
                      <div className="text-[9.5px] font-semibold text-blue-700 uppercase tracking-wider">
                        Saldo Importado
                      </div>
                    </th>
                    {comparativeData.countsList.map((c, idx) => {
                      const info = getCountHeaderInfo(idx, c.label);
                      return (
                        <th 
                          key={c.id || idx} 
                          className={`py-3 px-3 text-center min-w-[130px] ${
                            info.isBase ? 'bg-purple-100/60 border-x border-purple-200' : ''
                          }`}
                        >
                          <div className="font-bold text-slate-900">{info.main}</div>
                          <div className={`text-[10px] font-semibold uppercase tracking-wider ${info.isBase ? 'text-purple-800' : 'text-slate-600'}`}>
                            {info.sub}
                          </div>
                          <div className="text-[9px] font-normal text-slate-400 normal-case truncate max-w-[140px] mx-auto mt-0.5" title={c.fileName || ''}>
                            {c.fileName || '02.11.01'}
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-3 px-3 text-center w-36 bg-slate-200/60">
                      Saldo Confirmado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredList.length === 0 ? (
                    <tr>
                      <td 
                        colSpan={4 + comparativeData.numCounts} 
                        className="py-12 text-center text-slate-400 font-medium"
                      >
                        Nenhum produto encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((item) => {
                      return (
                        <tr key={item.code} className={`transition ${item.isMatched ? 'bg-emerald-50/50 hover:bg-emerald-100/60' : 'hover:bg-slate-50/80'}`}>
                          
                          {/* CÓDIGO */}
                          <td className="py-2 px-3 font-mono font-semibold text-slate-800 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <div className="flex items-center gap-1">
                                <span>{item.code}</span>
                                {item.isMatched && (
                                  <span className="blink-recontagem text-[10px]" title="Recontagem bateu com a Base / contagem anterior">
                                    ⚡
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-normal">
                                #{item.cleanCode}
                              </div>
                            </div>
                          </td>

                          {/* DESCRIÇÃO */}
                          <td className="py-2 px-4 text-slate-800 font-medium text-center">
                            {item.desc}
                          </td>

                          {/* DISPONÍVEL DA 02.05.02 IMPORTADA */}
                          <td className="py-2 px-3 text-center bg-blue-50/20 border-x border-blue-100">
                            {(() => {
                              const dispInfo = disp020502Map.get(item.cleanCode) || disp020502Map.get(Number(item.code));
                              if (!dispInfo) {
                                return (
                                  <div className="flex flex-col items-center justify-center">
                                    <span className="text-slate-300 font-mono text-xs" title="Produto não consta na 02.05.02 importada">
                                      —
                                    </span>
                                    {item.isMatched && (
                                      <span className="blink-recontagem inline-flex items-center gap-0.5 mt-0.5 text-[9.5px] font-bold text-emerald-700" title={item.statusText}>
                                        ⚡ Bateu
                                      </span>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <div className="flex flex-col items-center justify-center">
                                  <div 
                                    className={`inline-flex items-baseline gap-1 px-2.5 py-1 rounded-md font-mono font-bold text-xs shadow-xs border ${
                                      dispInfo.isNegative 
                                        ? 'bg-rose-50 text-rose-800 border-rose-300' 
                                        : 'bg-white text-blue-950 border-blue-200'
                                    }`}
                                    title={`Disponível no relatório 02.05.02: ${dispInfo.raw} ${dispInfo.unit}`}
                                  >
                                    <span className="text-[12px]">{dispInfo.raw}</span>
                                    {dispInfo.unit && (
                                      <span className="text-[10px] font-semibold text-blue-700/80 uppercase">
                                        {dispInfo.unit}
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Indicador de validação da conferência cega */}
                                  {item.isMatched ? (
                                    <span 
                                      className="blink-recontagem inline-flex items-center gap-0.5 mt-1 text-[9.5px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded border border-emerald-300 shadow-2xs"
                                      title={item.statusText}
                                    >
                                      <span>⚡ Bateu</span>
                                    </span>
                                  ) : item.divergentInLast ? (
                                    <span 
                                      className="inline-flex items-center gap-0.5 mt-1 text-[9px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-300"
                                      title={item.statusText}
                                    >
                                      <span>⚠ Recontar</span>
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </td>

                          {/* COLUNAS DE CADA CONTAGEM (Base, 1ª Rec, 2ª Rec, 3ª Rec, 4ª Rec...) */}
                          {comparativeData.countsList.map((_, cIdx) => {
                            const val = item.quantities[cIdx];
                            const matchInfo = item.cellMatches?.[cIdx];

                            if (cIdx === 0) {
                              // Contagem Base (Contagem 1)
                              return (
                                <td
                                  key={cIdx}
                                  className="py-2 px-3 text-center font-mono font-medium text-slate-800 bg-purple-50/20 border-r border-slate-200"
                                >
                                  {val !== null ? (
                                    <span>{val.toLocaleString('pt-BR')}</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                              );
                            }

                            // Recontagens (cIdx >= 1)
                            const isMatch = matchInfo?.matched;
                            const matchedPriorIdx = matchInfo?.withRound;
                            const isDivergent = val !== null && !isMatch;
                            const wasAlreadyConfirmed = item.isMatched && (item.matchedInRound ?? 99) <= cIdx;

                            return (
                              <td
                                key={cIdx}
                                className={`py-2 px-3 text-center font-mono transition ${
                                  isMatch
                                    ? 'bg-emerald-100/90 text-emerald-950 font-bold border-x border-emerald-300'
                                    : isDivergent
                                    ? 'bg-amber-100/80 text-amber-950 font-bold border-x border-amber-300'
                                    : wasAlreadyConfirmed && val === null
                                    ? 'bg-emerald-50/40 text-emerald-800/60 italic'
                                    : 'text-slate-700'
                                }`}
                              >
                                {val !== null ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span>{val.toLocaleString('pt-BR')}</span>
                                    {isMatch && (
                                      <span 
                                        className="blink-recontagem inline-block text-[10px] px-1.5 py-0.5 bg-emerald-200 text-emerald-950 rounded font-sans font-bold shadow-xs"
                                        title={`Bateu com ${matchedPriorIdx === 0 ? 'a Contagem Base' : `${matchedPriorIdx}ª Recontagem`}! (Diferença confirmada no Dashboard)`}
                                      >
                                        ⚡ ✓ {matchedPriorIdx === 0 ? 'Base' : `${matchedPriorIdx}ª Rec`}
                                      </span>
                                    )}
                                    {isDivergent && (
                                      <span 
                                        className="inline-block text-[10px] px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded font-sans font-bold"
                                        title="Divergente em relação às contagens anteriores"
                                      >
                                        ≠
                                      </span>
                                    )}
                                  </div>
                                ) : wasAlreadyConfirmed ? (
                                  <span className="text-[10px] text-emerald-700 font-sans block text-center font-semibold" title="Dispensado de recontagem pois já bateu anteriormente">
                                    — (Confirmado)
                                  </span>
                                ) : (
                                  <span className="text-slate-300 block text-center">—</span>
                                )}
                              </td>
                            );
                          })}

                          {/* SALDO CONFIRMADO */}
                          <td className="py-2 px-3 text-center font-mono font-bold bg-slate-50 border-l border-slate-200">
                            {item.confirmedQty !== null ? (
                              <span className="text-emerald-700 inline-block font-extrabold text-[13px]">
                                {item.confirmedQty.toLocaleString('pt-BR')}
                              </span>
                            ) : (
                              <span className="text-amber-600 font-sans text-[11px] font-semibold inline-block">
                                Pendente
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* LEGENDA / RODAPÉ */}
            <div className="p-3 bg-slate-100/80 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 text-[11px] text-slate-600">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block"></span>
                  <b className="text-emerald-800">Verdinho (Bateu):</b> Bateu com a Contagem Base ou com alguma recontagem anterior (item confirmado).
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block"></span>
                  <b className="text-amber-800">Divergente:</b> Quantidade não bateu (precisa de nova recontagem na próxima rodada).
                </span>
              </div>
              <div className="text-slate-500 font-medium">
                Mostrando {filteredList.length} itens {viewScope === 'recontados' && comparativeData.numCounts >= 2 ? '(Foco em itens recontados)' : ''}
              </div>
            </div>

          </div>
        )}

        {/* MENSAGEM QUANDO VAZIO */}
        {comparativeData.activeItems.length === 0 && (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-12 text-center">
            <FileSpreadsheet size={42} className="mx-auto text-slate-400 mb-3" />
            <h3 className="text-base font-bold text-slate-800">Nenhuma contagem 02.11.01 importada</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Importe o primeiro arquivo da rotina <b>02.11.01</b> (PW03018R) acima para carregar a <b>Contagem 1 (Base do Armazém)</b>. Em seguida, importe a <b>1ª Recontagem (Contagem 2)</b> para comparar os itens automaticamente com a base.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
