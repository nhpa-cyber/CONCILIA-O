import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { RawData, CalculatedProduct } from '../data/types';
import { parseColL } from '../utils/importer020502';
import { PERMANENT_GRADE_ITEMS } from '../utils/gradeCalculations';
import { 
  Search, 
  Copy, 
  Check, 
  Download, 
  FileSpreadsheet, 
  ArrowUpDown,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Layers
} from 'lucide-react';

interface ExportGradeViewProps {
  data: RawData;
  calculatedMap: Record<number, CalculatedProduct>;
  calculatedProducts: CalculatedProduct[];
  onImport020502?: (content: string, fileName: string) => void;
  ecBannerHtml?: string | null;
}

export interface GradeExportRow {
  code: number;
  desc: string;
  disp020502: number;
  ajusteDiferenca: number;
  ajusteAvarias: number;
  quantidadeProduto: number;
  codigoGrade: number;
  quantidadeReserva: number;
  has020502: boolean;
  isPermanente?: boolean;
  hasDiferenca: boolean;
  hasAvaria: boolean;
  hasBoth: boolean;
  isZero: boolean;
}

export const ExportGradeView: React.FC<ExportGradeViewProps> = ({
  data,
  calculatedMap,
  calculatedProducts,
  onImport020502,
  ecBannerHtml,
}) => {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'oficial' | 'detalhado'>('oficial');
  const [filterMode, setFilterMode] = useState<'grade_valid' | 'all' | 'adjustments' | 'both' | 'zero'>('grade_valid');
  const [codigoGradePadrao, setCodigoGradePadrao] = useState<number>(1);
  const [quantidadeReservaPadrao, setQuantidadeReservaPadrao] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [sortField, setSortField] = useState<'code' | 'desc' | 'quantidadeProduto'>('code');
  const [sortAsc, setSortAsc] = useState(true);

  // 1. Fonte dos dados da 02.05.02 (prioriza gradeEc específica ou ec geral)
  const ecSource = useMemo(() => {
    if (data.gradeEc && Array.isArray(data.gradeEc.r) && data.gradeEc.r.length > 0) {
      return data.gradeEc;
    }
    if (data.ec && Array.isArray(data.ec.r) && data.ec.r.length > 0) {
      return data.ec;
    }
    return null;
  }, [data.gradeEc, data.ec]);

  // 2. Mapeamento da Coluna L (Disponível Fiscal) e Colunas da 02.05.02
  const ecMap = useMemo(() => {
    const map: Record<number, { disp: number; desc?: string; dif020502?: number }> = {};
    if (!ecSource || !Array.isArray(ecSource.r)) return map;

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
    if (dispIdx < 0) dispIdx = 11; // Coluna L (índice 11)

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

      // Lê diferença diretamente da Coluna N (13) ou Coluna O (14) se existir
      let dif020502 = 0;
      if (row.length > 13 && row[13] !== undefined && row[13] !== '') {
        dif020502 = parseColL(row[13]);
      }
      if (dif020502 === 0 && row.length > 14 && row[14] !== undefined && row[14] !== '') {
        dif020502 = parseColL(row[14]);
      }

      const desc = (row[dIdx] && String(row[dIdx]).trim()) || `PRODUTO ${code}`;
      map[code] = { disp: dispVal, desc, dif020502 };
    });

    return map;
  }, [ecSource]);

  // 3. Mapeamento das Avarias e Quebras (data.aj.av + rn manual)
  const avariasMap = useMemo(() => {
    const map: Record<number, number> = {};

    // Avarias pendentes em data.aj.av
    if (Array.isArray(data.aj?.av)) {
      data.aj.av.forEach((r) => {
        const code = Number(r[1]);
        const isPendente = r[4] === 'Pendente' || !r[4];
        if (code > 0 && isPendente) {
          map[code] = (map[code] || 0) + Number(r[3] || 0);
        }
      });
    }

    // Avarias manuais (rn no resRow)
    if (Array.isArray(data.res)) {
      data.res.forEach((r) => {
        const code = r[0];
        const rn = Number(r[10] || 0);
        if (code > 0 && rn > 0) {
          map[code] = (map[code] || 0) + rn;
        }
      });
    }

    return map;
  }, [data.aj, data.res]);

  // 4. Mapeamento dos Ajustes de Diferença (data.dia / 02.05.02 / data.men / calc.R)
  const diferencasMap = useMemo(() => {
    const map: Record<number, number> = {};

    // Prioridade 1: data.dia (diferença diária congelada ou do dia atual)
    if (Array.isArray(data.dia)) {
      data.dia.forEach((d) => {
        const code = d[0];
        const val = d[2] !== 0 ? d[2] : d[1];
        if (val !== 0) {
          map[code] = val;
        }
      });
    }

    // Prioridade 2: data.men (DIF Mensal - busca último dia preenchido)
    if (Array.isArray(data.men)) {
      data.men.forEach((row) => {
        const code = row[0];
        if (map[code] === undefined) {
          const days = row[4] || [];
          let lastVal: number | null = null;
          for (let i = days.length - 1; i >= 0; i--) {
            if (days[i] !== null && days[i] !== undefined) {
              lastVal = days[i];
              break;
            }
          }
          if (lastVal !== null && lastVal !== 0) {
            map[code] = lastVal;
          } else if (row[3] !== null && row[3] !== undefined && row[3] !== 0) {
            map[code] = row[3];
          }
        }
      });
    }

    // Prioridade 4: calculatedMap[code].R (diferença atual apurada no Resumo)
    if (calculatedMap) {
      Object.entries(calculatedMap).forEach(([cStr, calc]) => {
        const code = Number(cStr);
        if (map[code] === undefined && calc.R !== 0) {
          map[code] = calc.R;
        }
      });
    }

    return map;
  }, [data.dia, data.men, calculatedMap, ecSource]);

  // 5. Linhas calculadas da Grade de Exportação (Todos os produtos da 02.05.02 preservados)
  const rawExportRows = useMemo<GradeExportRow[]>(() => {
    const rows: GradeExportRow[] = [];
    const seenCodes = new Set<number>();
    const desativadosSet = new Set(data.desativados || []);

    // Se temos 02.05.02 importada, percorre todos os produtos da 02.05.02
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

        const ecItem = ecMap[code];
        const calc = calculatedMap[code];
        const resRow = (data.res || []).find((r) => r[0] === code);

        const desc = ecItem?.desc || calc?.d || resRow?.[1] || `PRODUTO ${code}`;
        const disp020502 = ecItem ? Math.round(ecItem.disp) : Math.round(row.length > 11 ? parseColL(row[11]) : 0);

        // Ajuste Diferença Diária / Congelamento / 02.05.02 (Sobra soma, Falta reduz)
        const ajusteDiferenca = Math.round(diferencasMap[code] || 0);

        // Ajuste de Avarias / Quebras em caixas (reduz a quantidade que pode ir para a grade)
        const fatorCx = calc?.V || resRow?.[4] || 1;
        const totalAvariasUnid = avariasMap[code] || 0;
        const ajusteAvarias = Math.round(totalAvariasUnid / (fatorCx > 0 ? fatorCx : 1));

        // Se for permanente, fixa a quantidade permanente solicitada (ex: 20 cx)
        const perm = PERMANENT_GRADE_ITEMS[code];
        const quantidadeProduto = perm 
          ? perm.qty 
          : Math.max(0, Math.round(disp020502 + ajusteDiferenca - ajusteAvarias));

        const hasDiferenca = ajusteDiferenca !== 0;
        const hasAvaria = ajusteAvarias !== 0;
        const hasBoth = hasDiferenca && hasAvaria;
        const isZero = quantidadeProduto <= 0;

        rows.push({
          code,
          desc,
          disp020502: perm ? perm.qty : disp020502,
          ajusteDiferenca: perm ? 0 : ajusteDiferenca,
          ajusteAvarias: perm ? 0 : ajusteAvarias,
          quantidadeProduto,
          codigoGrade: codigoGradePadrao,
          quantidadeReserva: quantidadeReservaPadrao,
          has020502: true,
          isPermanente: !!perm,
          hasDiferenca,
          hasAvaria,
          hasBoth,
          isZero,
        });
      });
    } else {
      // Se a 02.05.02 não foi importada ainda, usa a lista da Tabela 7 como base
      (data.res || []).forEach((r) => {
        const code = r[0];
        if (code <= 0 || seenCodes.has(code) || code === 6181 || desativadosSet.has(code)) return;
        seenCodes.add(code);

        const calc = calculatedMap[code];
        const desc = calc?.d || r[1] || `PRODUTO ${code}`;
        const fatorCx = calc?.V || r[4] || 1;
        const disp020502 = Math.round(calc?.H !== undefined ? calc.H : (fatorCx > 1 ? Math.floor(r[3] / fatorCx) : r[3]));

        const ajusteDiferenca = Math.round(diferencasMap[code] || 0);
        const totalAvariasUnid = avariasMap[code] || 0;
        const ajusteAvarias = Math.round(totalAvariasUnid / (fatorCx > 0 ? fatorCx : 1));

        const perm = PERMANENT_GRADE_ITEMS[code];
        const quantidadeProduto = perm 
          ? perm.qty 
          : Math.max(0, Math.round(disp020502 + ajusteDiferenca - ajusteAvarias));

        const hasDiferenca = ajusteDiferenca !== 0;
        const hasAvaria = ajusteAvarias !== 0;
        const hasBoth = hasDiferenca && hasAvaria;
        const isZero = quantidadeProduto <= 0;

        rows.push({
          code,
          desc,
          disp020502: perm ? perm.qty : disp020502,
          ajusteDiferenca: perm ? 0 : ajusteDiferenca,
          ajusteAvarias: perm ? 0 : ajusteAvarias,
          quantidadeProduto,
          codigoGrade: codigoGradePadrao,
          quantidadeReserva: quantidadeReservaPadrao,
          has020502: false,
          isPermanente: !!perm,
          hasDiferenca,
          hasAvaria,
          hasBoth,
          isZero,
        });
      });
    }

    // Inclusão garantida de produtos permanentes da grade (mesmo que NÃO apareçam na 02.05.02)
    Object.entries(PERMANENT_GRADE_ITEMS).forEach(([cStr, perm]) => {
      const code = Number(cStr);
      if (code === 6181 || desativadosSet.has(code)) return;
      if (!seenCodes.has(code)) {
        seenCodes.add(code);
        const calc = calculatedMap[code];
        const resRow = (data.res || []).find((r) => r[0] === code);
        const desc = calc?.d || resRow?.[1] || perm.desc;

        rows.push({
          code,
          desc,
          disp020502: perm.qty,
          ajusteDiferenca: 0,
          ajusteAvarias: 0,
          quantidadeProduto: perm.qty,
          codigoGrade: codigoGradePadrao,
          quantidadeReserva: quantidadeReservaPadrao,
          has020502: !!ecMap[code],
          isPermanente: true,
          hasDiferenca: false,
          hasAvaria: false,
          hasBoth: false,
          isZero: false,
        });
      }
    });

    return rows;
  }, [
    ecSource,
    ecMap,
    calculatedMap,
    data.res,
    data.desativados,
    diferencasMap,
    avariasMap,
    codigoGradePadrao,
    quantidadeReservaPadrao,
  ]);

  // 6. KPIs de Auditoria e Resumo Geral
  const summaryKpis = useMemo(() => {
    const validRows = rawExportRows.filter((r) => r.quantidadeProduto > 0);
    const totalCaixasGrade = validRows.reduce((acc, r) => acc + r.quantidadeProduto, 0);
    const totalDisp020502 = rawExportRows.reduce((acc, r) => acc + r.disp020502, 0);
    const difRows = rawExportRows.filter((r) => r.hasDiferenca);
    const totalAjusteDiferenca = rawExportRows.reduce((acc, r) => acc + r.ajusteDiferenca, 0);
    const avariaRows = rawExportRows.filter((r) => r.hasAvaria);
    const totalAjusteAvarias = rawExportRows.reduce((acc, r) => acc + r.ajusteAvarias, 0);
    const bothRows = rawExportRows.filter((r) => r.hasBoth);
    const zeroRows = rawExportRows.filter((r) => r.isZero);
    const permRows = rawExportRows.filter((r) => r.isPermanente);

    return {
      totalEc: rawExportRows.length,
      validGradeCount: validRows.length,
      totalCaixasGrade,
      totalDisp020502,
      difItemsCount: difRows.length,
      totalAjusteDiferenca,
      avariaItemsCount: avariaRows.length,
      totalAjusteAvarias,
      bothCount: bothRows.length,
      zeroCount: zeroRows.length,
      permCount: permRows.length,
    };
  }, [rawExportRows]);

  // 7. Filtragem e Busca
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rawExportRows.filter((r) => {
      // Se o usuário digitou uma busca específica (por código ou descrição), exibe o item correspondente mesmo se zerado
      if (q) {
        const matchesQuery = (r.code + ' ' + r.desc).toLowerCase().includes(q);
        if (!matchesQuery) return false;
        if (filterMode === 'both' && !r.hasBoth) return false;
        if (filterMode === 'adjustments' && !r.hasDiferenca && !r.hasAvaria) return false;
        return true;
      }

      // Filtros rápidos quando não há busca por texto
      if (filterMode === 'grade_valid' && r.quantidadeProduto <= 0) {
        return false;
      }
      if (filterMode === 'adjustments' && !r.hasDiferenca && !r.hasAvaria) {
        return false;
      }
      if (filterMode === 'both' && !r.hasBoth) {
        return false;
      }
      if (filterMode === 'zero' && r.quantidadeProduto > 0) {
        return false;
      }

      return true;
    });
  }, [rawExportRows, filterMode, query]);

  // 8. Ordenação
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let vA: any = a[sortField];
      let vB: any = b[sortField];
      if (typeof vA === 'string') {
        vA = vA.toLowerCase();
        vB = (vB as string).toLowerCase();
      }
      if (vA < vB) return sortAsc ? -1 : 1;
      if (vA > vB) return sortAsc ? 1 : -1;
      return a.code - b.code;
    });
  }, [filteredRows, sortField, sortAsc]);

  const toggleSort = (field: 'code' | 'desc' | 'quantidadeProduto') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Linhas válidas para faturamento e carregamento no Promax (Promax rejeita se houver QuantidadeProduto === 0)
  const promaxExportableRows = useMemo(() => {
    return rawExportRows
      .filter((r) => r.quantidadeProduto > 0)
      .sort((a, b) => a.code - b.code);
  }, [rawExportRows]);

  // 9. Copiar Tabela Exatamente com as 4 Colunas (TSV para colar em Excel/Promax)
  const handleCopyOficial = () => {
    const header = ['CodigoProduto', 'CodigoGrade', 'QuantidadeProduto', 'QuantidadeReserva'].join('\t');
    const body = promaxExportableRows
      .map((r) => `${r.code}\t${r.codigoGrade}\t${r.quantidadeProduto}\t${r.quantidadeReserva}`)
      .join('\r\n');
    const tsv = `${header}\r\n${body}`;

    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // 10. Exportar Arquivo Excel (.xlsx) Oficial com 4 Colunas
  const handleExportExcel = () => {
    const wsData = [
      ['CodigoProduto', 'CodigoGrade', 'QuantidadeProduto', 'QuantidadeReserva'],
      ...promaxExportableRows.map((r) => [r.code, r.codigoGrade, r.quantidadeProduto, r.quantidadeReserva]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    ws['!cols'] = [
      { wch: 16 }, // CodigoProduto
      { wch: 14 }, // CodigoGrade
      { wch: 20 }, // QuantidadeProduto
      { wch: 20 }, // QuantidadeReserva
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Grade');
    const dataStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `grade_exportacao_${dataStr}.xlsx`);
  };

  // 11. Exportar Arquivo CSV Oficial Promax exatamente no formato importacaoGrade.csv (separado por ;)
  const handleExportImportacaoGradeCsv = () => {
    const header = 'CodigoProduto;CodigoGrade;QuantidadeProduto;QuantidadeReserva';
    const body = promaxExportableRows
      .map((r) => `${r.code};${r.codigoGrade};${r.quantidadeProduto};${r.quantidadeReserva}`)
      .join('\r\n');
    const content = `${header}\r\n${body}\r\n`;

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'importacaoGrade.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 12. Copiar no formato oficial Promax com ponto e vírgula (;)
  const handleCopyPromaxCsv = () => {
    const header = 'CodigoProduto;CodigoGrade;QuantidadeProduto;QuantidadeReserva';
    const body = promaxExportableRows
      .map((r) => `${r.code};${r.codigoGrade};${r.quantidadeProduto};${r.quantidadeReserva}`)
      .join('\r\n');
    const csv = `${header}\r\n${body}\r\n`;

    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <section className="w-full flex flex-col p-4 md:p-6 bg-slate-50 min-h-screen">
      {/* CABEÇALHO PRINCIPAL */}
      <div className="bg-slate-900 text-white rounded-xl shadow-md p-5 mb-4 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-2xl">📦</span>
              <h1 className="text-xl font-black tracking-wide text-white">
                EXPORTAÇÃO DE GRADE
              </h1>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  ecSource ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                }`}
              >
                {ecSource ? '✓ 02.05.02 Conectada (Coluna L)' : '⚠️ Aguardando 02.05.02 (Usando Tabela 7)'}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-600 text-white">
                Ajustes Automáticos: Congelamentos + Quebras/Avarias
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500 text-slate-950">
                Padrão Promax: importacaoGrade.csv (;)
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Gera a exportação oficial com as colunas <strong className="text-amber-300">CodigoProduto;CodigoGrade;QuantidadeProduto;QuantidadeReserva</strong> no arquivo oficial <strong className="text-emerald-400">importacaoGrade.csv</strong> pronto para carregamento e faturamento no Promax.
            </p>
          </div>

          {/* BOTÕES DE AÇÃO: EXPORTAR CSV PROMAX, COPIAR E EXCEL */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportImportacaoGradeCsv}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-md transition transform hover:-translate-y-0.5"
              title="Baixar arquivo oficial importacaoGrade.csv com delimitador ponto e vírgula (;)"
            >
              <Download size={15} />
              <span>BAIXAR CSV (importacaoGrade.csv)</span>
            </button>

            <button
              type="button"
              onClick={handleCopyPromaxCsv}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg shadow transition ${
                copied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
              }`}
              title="Copiar no formato oficial Promax com delimitador ponto e vírgula (;)"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              <span>{copied ? 'CSV COPIADO!' : 'COPIAR CSV ( ; )'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyOficial}
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
              title="Copiar com tabulação (TAB) para colar no Excel"
            >
              <Copy size={14} />
              <span>COPIAR TAB</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
              title="Baixar planilha Excel (.xlsx)"
            >
              <FileSpreadsheet size={14} />
              <span>EXCEL (.XLSX)</span>
            </button>
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNER DA IMPORTAÇÃO 02.05.02 */}
      {ecBannerHtml && (
        <div
          className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-xs"
          dangerouslySetInnerHTML={{ __html: ecBannerHtml }}
        />
      )}

      {/* CARDS KPIS DE AUDITORIA COMPLETA (CONFIRMAÇÃO DOS PRODUTOS DA 02.05.02, DIFERENÇAS E QUEBRAS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {/* PRODUTOS NA GRADE */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            PRODUTOS NA GRADE
          </span>
          <div className="my-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{summaryKpis.validGradeCount}</span>
            <span className="text-xs text-slate-400 font-semibold">itens</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
            <CheckCircle2 size={12} /> Saldo &gt; 0 para carga
          </span>
        </div>

        {/* TOTAL CAIXAS GRADE */}
        <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">
            TOTAL CAIXAS GRADE
          </span>
          <div className="my-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-900">
              {summaryKpis.totalCaixasGrade.toLocaleString('pt-BR')}
            </span>
            <span className="text-xs text-amber-700 font-bold">cx</span>
          </div>
          <span className="text-[11px] text-amber-700 font-semibold">
            Quantidade total carga Promax
          </span>
        </div>

        {/* DISPONÍVEL 02.05.02 */}
        <div className="bg-white p-3.5 rounded-xl border border-blue-200 bg-blue-50/20 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-900">
            DISPONÍVEL 02.05.02
          </span>
          <div className="my-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-blue-900">
              {summaryKpis.totalDisp020502.toLocaleString('pt-BR')}
            </span>
            <span className="text-xs text-blue-700 font-bold">cx</span>
          </div>
          <span className="text-[11px] text-blue-700 font-semibold">
            Base fiscal (Coluna L: {summaryKpis.totalEc} itens)
          </span>
        </div>

        {/* AJUSTE DIF DIÁRIA / CONGELADA */}
        <div className="bg-white p-3.5 rounded-xl border border-purple-200 bg-purple-50/20 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-900">
            AJUSTE DIF DIÁRIA
          </span>
          <div className="my-1 flex items-baseline gap-1.5">
            <span className={`text-2xl font-black ${summaryKpis.totalAjusteDiferenca < 0 ? 'text-red-700' : 'text-purple-900'}`}>
              {summaryKpis.totalAjusteDiferenca > 0 ? `+${summaryKpis.totalAjusteDiferenca}` : summaryKpis.totalAjusteDiferenca}
            </span>
            <span className="text-xs text-purple-700 font-bold">cx</span>
          </div>
          <span className="text-[11px] text-purple-700 font-semibold">
            {summaryKpis.difItemsCount} itens com divergência
          </span>
        </div>

        {/* AVARIAS / QUEBRAS */}
        <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/20 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-900">
            AVARIAS / QUEBRAS
          </span>
          <div className="my-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-700">
              -{summaryKpis.totalAjusteAvarias}
            </span>
            <span className="text-xs text-rose-700 font-bold">cx</span>
          </div>
          <span className="text-[11px] text-rose-700 font-semibold">
            {summaryKpis.avariaItemsCount} itens com quebra abatida
          </span>
        </div>

        {/* ITENS COM DIFERENÇA + QUEBRAS */}
        <div className="bg-white p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/20 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900">
            DIF + QUEBRAS
          </span>
          <div className="my-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-indigo-900">
              {summaryKpis.bothCount}
            </span>
            <span className="text-xs text-indigo-700 font-bold">itens</span>
          </div>
          <span className="text-[11px] text-indigo-700 font-semibold">
            Com ambos os ajustes aplicados
          </span>
        </div>
      </div>

      {/* BARRA DE FERRAMENTAS, FILTROS RÁPIDOS E MODO DE VISUALIZAÇÃO */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Campo de Busca */}
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar código ou descrição do produto..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filtros Rápidos por Categoria de Ajuste */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-slate-400 font-semibold text-[11px] mr-1 flex items-center gap-1">
              <Filter size={12} /> Filtro:
            </span>

            <button
              type="button"
              onClick={() => setFilterMode('grade_valid')}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                filterMode === 'grade_valid'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="Exibir produtos com quantidade positiva prontos para exportar"
            >
              <span>✓ Na Grade ({summaryKpis.validGradeCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                filterMode === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="Exibir todos os produtos do relatório 02.05.02 (inclusive zerados)"
            >
              <span>Todos da 02.05.02 ({summaryKpis.totalEc})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('both')}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                filterMode === 'both'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="Filtrar apenas produtos que possuem AMBOS: DIF Diária E Quebras/Avarias"
            >
              <Flame size={12} />
              <span>DIF + Quebras ({summaryKpis.bothCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('adjustments')}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                filterMode === 'adjustments'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="Filtrar produtos com qualquer ajuste (DIF diária ou quebras)"
            >
              <span>Com Ajustes ({summaryKpis.difItemsCount + summaryKpis.avariaItemsCount - summaryKpis.bothCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('zero')}
              className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                filterMode === 'zero'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="Produtos com saldo zerado (omitidos da exportação Promax)"
            >
              <span>Zerados ({summaryKpis.zeroCount})</span>
            </button>
          </div>

          {/* Alternador de Modo e Parâmetros */}
          <div className="flex items-center gap-3 flex-wrap text-xs">
            <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('oficial')}
                className={`px-3 py-1.5 rounded-md font-bold transition ${
                  viewMode === 'oficial'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Exibir exatamente as 4 colunas solicitadas para exportação"
              >
                📋 Formato Oficial (4 Colunas)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detalhado')}
                className={`px-3 py-1.5 rounded-md font-bold transition ${
                  viewMode === 'detalhado'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Exibir memória de cálculo (Disp 02.05.02, Diferença, Avarias)"
              >
                🔍 Memória de Cálculo
              </button>
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <label className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                <span>Cód. Grade:</span>
                <input
                  type="number"
                  value={codigoGradePadrao}
                  onChange={(e) => setCodigoGradePadrao(Number(e.target.value) || 1)}
                  className="w-12 px-1.5 py-0.5 text-xs text-center border border-slate-300 rounded font-bold"
                />
              </label>

              <label className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                <span>Reserva:</span>
                <input
                  type="number"
                  value={quantidadeReservaPadrao}
                  onChange={(e) => setQuantidadeReservaPadrao(Number(e.target.value) || 0)}
                  className="w-12 px-1.5 py-0.5 text-xs text-center border border-slate-300 rounded font-bold"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ÁREA DA TABELA: PADRÃO OU MEMÓRIA DE CÁLCULO */}
      <div className="bg-white rounded-xl border border-slate-300 shadow overflow-hidden flex-1">
        <div className="overflow-x-auto max-h-[calc(100vh-340px)]">
          {viewMode === 'oficial' ? (
            /* TABELA OFICIAL EXATAMENTE CONFORME A IMAGEM ANEXADA:
               CodigoProduto | CodigoGrade | QuantidadeProduto | QuantidadeReserva */
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-[#FFC000] text-black font-black text-sm tracking-wide border-b-2 border-amber-500 sticky top-0 z-10 shadow-sm">
                  <th
                    onClick={() => toggleSort('code')}
                    className="py-3 px-4 cursor-pointer hover:bg-amber-400 border-r border-amber-300 select-none text-center"
                    title="Código do Produto Promax / Fiscal"
                  >
                    <div className="inline-flex items-center justify-center gap-1 font-black">
                      <span>CodigoProduto</span>
                      <ArrowUpDown size={13} className="text-black/60" />
                    </div>
                  </th>
                  <th className="py-3 px-4 border-r border-amber-300 select-none text-center font-black">
                    CodigoGrade
                  </th>
                  <th
                    onClick={() => toggleSort('quantidadeProduto')}
                    className="py-3 px-4 cursor-pointer hover:bg-amber-400 border-r border-amber-300 select-none text-center"
                    title="Quantidade calculada (02.05.02 Coluna L ajustada com congelamentos e avarias)"
                  >
                    <div className="inline-flex items-center justify-center gap-1 font-black">
                      <span>QuantidadeProduto</span>
                      <ArrowUpDown size={13} className="text-black/60" />
                    </div>
                  </th>
                  <th className="py-3 px-4 select-none text-center font-black">
                    QuantidadeReserva
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm font-semibold text-slate-800">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      Nenhum produto encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr
                      key={row.code}
                      className={`hover:bg-amber-50/70 transition-colors ${
                        row.isZero ? 'bg-slate-50 text-slate-400' : ''
                      }`}
                    >
                      {/* CodigoProduto */}
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900 border-r border-slate-100">
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <span>{row.code}</span>
                          {row.isPermanente && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black bg-purple-100 text-purple-800 rounded border border-purple-300" title="Quantidade permanente fixada na grade (20 cx)">
                              FIXA
                            </span>
                          )}
                          {row.hasBoth && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black bg-indigo-100 text-indigo-800 rounded border border-indigo-200" title={`DIF: ${row.ajusteDiferenca > 0 ? '+' : ''}${row.ajusteDiferenca} cx | Quebra: -${row.ajusteAvarias} cx`}>
                              DIF+QUEBRA
                            </span>
                          )}
                          {row.isZero && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-600 rounded">
                              ZERADO
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CodigoGrade */}
                      <td className="py-2.5 px-4 font-mono text-slate-600 border-r border-slate-100">
                        {row.codigoGrade}
                      </td>

                      {/* QuantidadeProduto */}
                      <td className="py-2.5 px-4 font-mono font-bold border-r border-slate-100">
                        <span className={row.isZero ? 'text-slate-400' : 'text-slate-900'}>
                          {row.quantidadeProduto}
                        </span>
                      </td>

                      {/* QuantidadeReserva */}
                      <td className="py-2.5 px-4 font-mono text-slate-500">
                        {row.quantidadeReserva}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            /* TABELA DETALHADA COM MEMÓRIA DE CÁLCULO COMPLETA */
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="bg-[#FFC000] text-black font-black text-xs uppercase tracking-wider border-b-2 border-amber-500 sticky top-0 z-10 shadow-sm">
                  <th
                    onClick={() => toggleSort('code')}
                    className="py-3 px-3 cursor-pointer hover:bg-amber-400 border-r border-amber-300 text-center"
                  >
                    Código
                  </th>
                  <th
                    onClick={() => toggleSort('desc')}
                    className="py-3 px-4 cursor-pointer hover:bg-amber-400 border-r border-amber-300 text-left"
                  >
                    Descrição do Produto
                  </th>
                  <th className="py-3 px-3 border-r border-amber-300 text-center" title="Disponível fiscal da Coluna L">
                    Disp. 02.05.02 (L)
                  </th>
                  <th className="py-3 px-3 border-r border-amber-300 text-center" title="Ajuste de congelamento / DIF diária / 02.05.02">
                    Ajuste DIF Diária
                  </th>
                  <th className="py-3 px-3 border-r border-amber-300 text-center" title="Quebras e avarias abatidas">
                    Quebras / Avarias
                  </th>
                  <th
                    onClick={() => toggleSort('quantidadeProduto')}
                    className="py-3 px-3 cursor-pointer hover:bg-amber-400 border-r border-amber-300 text-center font-black bg-amber-400"
                    title="Quantidade calculada para a grade: Disp + DIF - Avarias"
                  >
                    Quantidade Grade
                  </th>
                  <th className="py-3 px-3 border-r border-amber-300 text-center">
                    Cód. Grade
                  </th>
                  <th className="py-3 px-3 border-r border-amber-300 text-center">
                    Reserva
                  </th>
                  <th className="py-3 px-3 text-center">
                    Auditoria de Ajustes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      Nenhum produto encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
                    <tr
                      key={row.code}
                      className={`hover:bg-amber-50/70 transition-colors ${
                        row.hasBoth ? 'bg-indigo-50/30' : row.isZero ? 'bg-slate-50 text-slate-400' : ''
                      }`}
                    >
                      {/* Código */}
                      <td className="py-2 px-3 font-mono font-bold text-slate-900 border-r border-slate-100">
                        #{row.code}
                      </td>

                      {/* Descrição */}
                      <td className="py-2 px-4 text-left font-bold text-slate-800 border-r border-slate-100 truncate max-w-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{row.desc}</span>
                          {row.isPermanente && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-black bg-purple-100 text-purple-800 rounded border border-purple-300" title="Quantidade permanente fixada na grade (20 cx)">
                              GRADE FIXA (20 CX)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Disponível na 02.05.02 */}
                      <td className="py-2 px-3 font-mono font-semibold text-blue-900 border-r border-slate-100">
                        {row.disp020502.toLocaleString('pt-BR')} cx
                      </td>

                      {/* Ajuste Diferença */}
                      <td className="py-2 px-3 font-mono font-bold border-r border-slate-100">
                        {row.ajusteDiferenca === 0 ? (
                          <span className="text-slate-400">0</span>
                        ) : row.ajusteDiferenca > 0 ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                            +{row.ajusteDiferenca} cx (Sobra)
                          </span>
                        ) : (
                          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200 font-mono">
                            {row.ajusteDiferenca} cx (Falta)
                          </span>
                        )}
                      </td>

                      {/* Quebras / Avarias */}
                      <td className="py-2 px-3 font-mono font-bold border-r border-slate-100">
                        {row.ajusteAvarias === 0 ? (
                          <span className="text-slate-400">0</span>
                        ) : (
                          <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-mono">
                            -{row.ajusteAvarias} cx
                          </span>
                        )}
                      </td>

                      {/* Quantidade Final Grade */}
                      <td className="py-2 px-3 font-mono font-black border-r border-slate-100 text-sm">
                        <span className={row.isZero ? 'text-slate-400' : 'text-amber-950 font-black'}>
                          {row.quantidadeProduto.toLocaleString('pt-BR')}
                        </span>
                      </td>

                      {/* CodigoGrade */}
                      <td className="py-2 px-3 font-mono text-slate-600 border-r border-slate-100">
                        {row.codigoGrade}
                      </td>

                      {/* QuantidadeReserva */}
                      <td className="py-2 px-3 font-mono text-slate-500 border-r border-slate-100">
                        {row.quantidadeReserva}
                      </td>

                      {/* Auditoria de Ajustes */}
                      <td className="py-2 px-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1 flex-wrap">
                          {row.hasBoth ? (
                            <span className="px-2 py-0.5 text-[10px] font-black bg-indigo-100 text-indigo-900 rounded border border-indigo-300">
                              ⚡ DIF + QUEBRA
                            </span>
                          ) : row.hasDiferenca ? (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-50 text-purple-800 rounded border border-purple-200">
                              DIF APLICADA
                            </span>
                          ) : row.hasAvaria ? (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-50 text-rose-800 rounded border border-rose-200">
                              QUEBRA ABATIDA
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">
                              Sem ajuste
                            </span>
                          )}
                          {row.isZero && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 text-slate-600 rounded">
                              ZERADO
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* RODAPÉ INFORMATIVO DA TABELA */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-2">
          <div>
            Mostrando <strong>{sortedRows.length}</strong> de <strong>{rawExportRows.length}</strong> produtos mapeados da 02.05.02.
            {filterMode === 'grade_valid' && (
              <span className="ml-1 text-emerald-700 font-semibold">
                (Apenas itens com saldo &gt; 0 prontos para faturamento/carga no Promax).
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span>Fórmula: <strong className="text-slate-800">QtdGrade = Máx(0, Disp020502 + DIF - Quebras)</strong></span>
          </div>
        </div>
      </div>
    </section>
  );
};
