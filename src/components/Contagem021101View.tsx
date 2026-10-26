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

        // Atribui label legível sequencial: "Contagem 1", "Contagem 2", etc.
        const countNumber = newCounts.length + 1;
        const cleanName = f.name.replace(/\.[^/.]+$/, '');
        const label = `Contagem ${countNumber}`;

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
    // Renomeia sequencialmente para manter Contagem 1, Contagem 2...
    const renumbered = updated.map((c, i) => ({
      ...c,
      label: `Contagem ${i + 1}`,
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
   * Processa todas as contagens e gera a lista comparativa completa com status de conferência
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

    // 2. Cria mapa unificado de todos os produtos que aparecem em pelo menos uma contagem
    const allProducts = new Map<
      string,
      {
        code: string;
        cleanCode: number;
        desc: string;
        quantities: (number | null)[];
        isMatched: boolean;
        matchedInRound: number | null; // ex: 2 se bateu na contagem 2 com contagem 1
        divergentInLast: boolean;
        statusText: string;
        statusColor: 'green' | 'amber' | 'neutral' | 'blue';
        confirmedQty: number | null;
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
            isMatched: false,
            matchedInRound: null,
            divergentInLast: false,
            statusText: '',
            statusColor: 'neutral',
            confirmedQty: null,
          });
        }
        const record = allProducts.get(code)!;
        record.quantities[cIdx] = item.qty;
        if ((!record.desc || /^\d+$/.test(record.desc)) && item.desc) {
          record.desc = item.desc;
        }
      });
    });

    // 3. Aplica a lógica de conferência da recontagem rotativa:
    // "Contagem 1 importada
    // Contagem 2 tem que bater igual com a contagem 1
    // Contagem 3 tem que bater igual com a contagem 2 e assim segue essa logica
    // O itens que forem batendo tem que ficar verdinho assim eu deixo de contagem na proxima contagem."
    allProducts.forEach((prod) => {
      const q = prod.quantities;

      if (numCounts === 0) return;

      if (numCounts === 1) {
        prod.isMatched = false;
        prod.statusText = '1ª Contagem Realizada';
        prod.statusColor = 'neutral';
        prod.confirmedQty = q[0];
        return;
      }

      // Verifica correspondências sequenciais
      let confirmedRound: number | null = null;
      let matchedQty: number | null = null;

      // Regra 1: Contagem 2 bateu com Contagem 1?
      if (q[1] !== null && q[0] !== null && q[1] === q[0]) {
        confirmedRound = 2;
        matchedQty = q[1];
      }

      // Regra 2: Contagens subsequentes (3, 4, 5...)
      for (let i = 2; i < numCounts; i++) {
        const currentQ = q[i];
        const prevQ = q[i - 1];

        // Se o produto já estava confirmado anteriormente e não foi recontado (pois já bateu), continua confirmado!
        if (confirmedRound !== null && currentQ === null) {
          continue;
        }

        // Se recontou na rodada i e bateu com a rodada anterior (i-1)
        if (currentQ !== null && prevQ !== null && currentQ === prevQ) {
          confirmedRound = i + 1;
          matchedQty = currentQ;
        } else if (currentQ !== null && confirmedRound === null) {
          // Também confere se bateu com alguma rodada anterior confirmada ou primeira
          for (let prevIdx = 0; prevIdx < i; prevIdx++) {
            if (q[prevIdx] !== null && currentQ === q[prevIdx]) {
              confirmedRound = i + 1;
              matchedQty = currentQ;
              break;
            }
          }
        }
      }

      if (confirmedRound !== null) {
        prod.isMatched = true;
        prod.matchedInRound = confirmedRound;
        prod.statusText = `✓ Bateu na Contagem ${confirmedRound}`;
        prod.statusColor = 'green';
        prod.confirmedQty = matchedQty;
      } else {
        // Não bateu ainda
        const countedIndices = q.map((v, i) => (v !== null ? i : -1)).filter(i => i >= 0);
        if (countedIndices.length >= 2) {
          prod.isMatched = false;
          prod.divergentInLast = true;
          const nextRound = numCounts + 1;
          prod.statusText = `Divergente (Recontar na Cont. ${nextRound})`;
          prod.statusColor = 'amber';
          prod.confirmedQty = null;
        } else {
          prod.isMatched = false;
          prod.statusText = 'Aguardando próxima contagem';
          prod.statusColor = 'blue';
          prod.confirmedQty = q[countedIndices[0]] ?? null;
        }
      }
    });

    const items = Array.from(allProducts.values()).sort((a, b) => a.cleanCode - b.cleanCode);

    // Métricas para cards
    const totalItems = items.length;
    const matchedCount = items.filter(x => x.isMatched).length;
    const divergentCount = items.filter(x => x.divergentInLast).length;
    const pendingCount = items.filter(x => !x.isMatched && !x.divergentInLast).length;

    return {
      items,
      totalItems,
      matchedCount,
      divergentCount,
      pendingCount,
      numCounts,
      countsList,
    };
  }, [contagemState.counts, catalogMap]);

  // Lista filtrada por busca e tipo de status
  const filteredList = useMemo(() => {
    let list = comparativeData.items;

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
  }, [comparativeData.items, filterType, searchTerm]);

  // Exportar Excel Completo
  const handleExportFullExcel = () => {
    if (comparativeData.items.length === 0) return;

    const headers = [
      'Código',
      'Código Limpo',
      'Descrição',
      'Status',
      ...comparativeData.countsList.map(c => `${c.label} (${c.fileName || '02.11.01'})`),
      'Saldo Confirmado',
    ];

    const dataRows = comparativeData.items.map(item => [
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
    const divergentItems = comparativeData.items.filter(x => x.divergentInLast);
    if (divergentItems.length === 0) {
      alert('Nenhum item divergente pendente no momento!');
      return;
    }

    const nextCountNumber = comparativeData.numCounts + 1;
    const headers = [
      'Código',
      'Código Formatado',
      'Descrição',
      'Status Atual',
      ...comparativeData.countsList.map(c => c.label),
      `Contagem ${nextCountNumber} (Nova)`,
    ];

    const dataRows = divergentItems.map(item => [
      item.cleanCode,
      item.code,
      item.desc,
      item.statusText,
      ...item.quantities.map(q => (q !== null ? q : '-')),
      '', // Coluna em branco para anotação / contagem
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
    <div className="w-full bg-slate-50 min-h-screen p-4 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-md uppercase tracking-wider">
                Rotina 02.11.01
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-semibold text-slate-500">Conferência Cega & Comparativo de Recontagens</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mt-1">
              Contagem 02.11.01 (Múltiplas Rodadas)
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Importe múltiplos arquivos de contagem (Contagem 1, 2, 3, 4...). Os itens que baterem com a contagem anterior ficam <b className="text-emerald-700">verdinhos</b> e não precisam ser recontados na rodada seguinte.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {comparativeData.items.length > 0 && (
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

        {/* ÁREA DE IMPORTAÇÃO */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Upload size={16} className="text-purple-600" />
                <span>Importar Arquivo 02.11.01 (Contagem / Recontagem)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Suporta planilhas Excel (<b>.xlsx</b>, <b>.xls</b>) e arquivos de texto/coletor (<b>.csv</b>, <b>.txt</b>). O sistema extrai automaticamente o <b>Código (Col. C)</b>, <b>Descrição (Col. D)</b> e <b>Quantidade (Col. J)</b> da rotina 02.11.01 PW03018R.
              </p>
            </div>
            {contagemState.counts.length > 0 && (
              <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
                Próximo arquivo será a <b>Contagem {contagemState.counts.length + 1}</b>
              </span>
            )}
          </div>

          <div className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/30 rounded-xl p-4 transition text-center cursor-pointer relative">
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
              <span className="text-sm font-semibold text-purple-900">
                Selecione ou arraste um ou mais arquivos da rotina 02.11.01
              </span>
              <span className="text-xs text-purple-700/80 mt-0.5">
                {contagemState.counts.length === 0 
                  ? 'O 1º arquivo importado será a Contagem 1, o 2º será a Contagem 2, etc.' 
                  : `Adicione a Contagem ${contagemState.counts.length + 1} para comparar automaticamente`}
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
                {contagemState.counts.map((c, i) => (
                  <div
                    key={c.id || i}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:bg-slate-100 transition"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                        <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                        <span className="truncate">{c.label}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate" title={c.fileName || ''}>
                        {c.fileName || 'Arquivo 02.11.01'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {c.totalItems || (c.rows?.length ? `${c.rows.length} linhas` : 'Carregado')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCount(i)}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                      title={`Remover ${c.label}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* MÉTRICAS E CARDS RESUMO */}
        {comparativeData.items.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 block">Total de Produtos</span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {comparativeData.totalItems.toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Itens únicos encontrados
              </span>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs font-semibold text-emerald-800 block flex items-center justify-between">
                <span>Confirmados (Bateram)</span>
                <CheckCircle2 size={15} className="text-emerald-600" />
              </span>
              <span className="text-2xl font-bold text-emerald-700 mt-1 block">
                {comparativeData.matchedCount.toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">
                {comparativeData.totalItems > 0 
                  ? `${Math.round((comparativeData.matchedCount / comparativeData.totalItems) * 100)}% conferido` 
                  : '0%'}
              </span>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs font-semibold text-amber-900 block flex items-center justify-between">
                <span>Divergentes (Recontar)</span>
                <AlertTriangle size={15} className="text-amber-600" />
              </span>
              <span className="text-2xl font-bold text-amber-800 mt-1 block">
                {comparativeData.divergentCount.toLocaleString('pt-BR')}
              </span>
              <span className="text-[11px] text-amber-700 font-medium mt-0.5 block">
                {comparativeData.divergentCount > 0 
                  ? 'Aguardando próxima contagem' 
                  : 'Nenhuma divergência'}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 block flex items-center justify-between">
                <span>Rodadas de Contagem</span>
                <Layers size={15} className="text-purple-600" />
              </span>
              <span className="text-2xl font-bold text-slate-900 mt-1 block">
                {comparativeData.numCounts}
              </span>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                {comparativeData.numCounts === 1 
                  ? 'Aguardando Contagem 2' 
                  : `${comparativeData.numCounts} arquivos comparados`}
              </span>
            </div>
          </div>
        )}

        {/* TABELA COMPARATIVA */}
        {comparativeData.items.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            
            {/* BARRA DE FILTROS E BUSCA */}
            <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                    filterType === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Todos ({comparativeData.totalItems})
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
                  <span>Confirmados ({comparativeData.matchedCount})</span>
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
                    <th className="py-3 px-3 w-40 text-center">Status</th>
                    {comparativeData.countsList.map((c, idx) => (
                      <th key={c.id || idx} className="py-3 px-3 text-center min-w-[120px]">
                        <div>{c.label}</div>
                        <div className="text-[9px] font-normal text-slate-500 normal-case truncate max-w-[140px] mx-auto">
                          {c.fileName || '02.11.01'}
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-3 text-center w-32 bg-slate-200/60">
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
                        <tr key={item.code} className="hover:bg-slate-50/80 transition">
                          
                          {/* CÓDIGO */}
                          <td className="py-2 px-3 font-mono font-semibold text-slate-800 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <div>{item.code}</div>
                              <div className="text-[10px] text-slate-400 font-normal">
                                #{item.cleanCode}
                              </div>
                            </div>
                          </td>

                          {/* DESCRIÇÃO */}
                          <td className="py-2 px-4 text-slate-800 font-medium text-center">
                            {item.desc}
                          </td>

                          {/* STATUS GERAL */}
                          <td className="py-2 px-3 text-center">
                            {item.isMatched ? (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 size={12} className="text-emerald-700" />
                                <span>Bateu (Cont. {item.matchedInRound})</span>
                              </span>
                            ) : item.divergentInLast ? (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                <AlertTriangle size={12} className="text-amber-700" />
                                <span>Divergente</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <span>1ª Contagem</span>
                              </span>
                            )}
                          </td>

                          {/* COLUNAS DE CADA CONTAGEM (Contagem 1, Contagem 2, Contagem 3, ...) */}
                          {comparativeData.countsList.map((_, cIdx) => {
                            const val = item.quantities[cIdx];
                            const prevVal = cIdx > 0 ? item.quantities[cIdx - 1] : null;

                            // Lógica de correspondência visual para o usuário:
                            // Contagem 2: verde se bateu com Contagem 1
                            // Contagem 3: verde se bateu com Contagem 2 (ou se bateu e confirmou)
                            let isMatchWithPrev = false;
                            let isDivergentWithPrev = false;

                            if (cIdx === 1) {
                              if (val !== null && prevVal !== null) {
                                isMatchWithPrev = val === prevVal;
                                isDivergentWithPrev = val !== prevVal;
                              }
                            } else if (cIdx >= 2) {
                              if (val !== null && prevVal !== null) {
                                isMatchWithPrev = val === prevVal;
                                isDivergentWithPrev = val !== prevVal;
                              } else if (val !== null && item.quantities[0] !== null) {
                                isMatchWithPrev = val === item.quantities[0];
                              }
                            }

                            // Se o item já havia batido em rodada anterior e não foi recontado nesta rodada
                            const wasAlreadyConfirmed = item.isMatched && (item.matchedInRound ?? 99) <= cIdx;

                            return (
                              <td
                                key={cIdx}
                                className={`py-2 px-3 text-center font-mono transition ${
                                  isMatchWithPrev
                                    ? 'bg-emerald-100/90 text-emerald-950 font-bold border-x border-emerald-300'
                                    : isDivergentWithPrev
                                    ? 'bg-amber-100/80 text-amber-950 font-bold border-x border-amber-300'
                                    : wasAlreadyConfirmed && val === null
                                    ? 'bg-emerald-50/40 text-emerald-800/60 italic'
                                    : 'text-slate-700'
                                }`}
                              >
                                {val !== null ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <span>{val.toLocaleString('pt-BR')}</span>
                                    {isMatchWithPrev && (
                                      <span 
                                        className="inline-block text-[10px] px-1 py-0.2 bg-emerald-200 text-emerald-800 rounded font-sans font-bold"
                                        title={`Bateu igual com a Contagem ${cIdx}!`}
                                      >
                                        ✓
                                      </span>
                                    )}
                                    {isDivergentWithPrev && (
                                      <span 
                                        className="inline-block text-[10px] px-1 py-0.2 bg-amber-200 text-amber-800 rounded font-sans font-bold"
                                        title={`Divergência de ${(val - (prevVal ?? 0))} caixas em relação à Contagem ${cIdx}`}
                                      >
                                        ≠
                                      </span>
                                    )}
                                  </div>
                                ) : wasAlreadyConfirmed ? (
                                  <span className="text-[10px] text-emerald-600/80 font-sans block text-center" title="Dispensado de recontagem pois já bateu anteriormente">
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
                              <span className="text-emerald-700 inline-block">
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
                  <b className="text-emerald-800">Verdinho (Bateu):</b> Contagem bateu igual com a contagem anterior (item confirmado, dispensado das próximas).
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block"></span>
                  <b className="text-amber-800">Divergente:</b> Quantidade diferiu da contagem anterior (precisa ser recontado na próxima).
                </span>
              </div>
              <div className="text-slate-500 font-medium">
                Mostrando {filteredList.length} de {comparativeData.totalItems} produtos
              </div>
            </div>

          </div>
        )}

        {/* MENSAGEM QUANDO VAZIO */}
        {comparativeData.items.length === 0 && (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-12 text-center">
            <FileSpreadsheet size={42} className="mx-auto text-slate-400 mb-3" />
            <h3 className="text-base font-bold text-slate-800">Nenhuma contagem 02.11.01 importada</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Importe o primeiro arquivo da rotina <b>02.11.01</b> (PW03018R) acima para carregar a primeira contagem. Depois importe o segundo arquivo (Contagem 2) para visualizar o comparativo automático com destaque verdinho para os itens confirmados.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
