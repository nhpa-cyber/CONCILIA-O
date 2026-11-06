import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { RawData, CalculatedProduct } from '../data/types';
import {
  calculateExpectedGrade,
  parseLancamentoGradeFile,
  parseLancamentoText,
  compareGradeLaunch,
  CheckGradeComparisonRow,
  CheckStatus,
  LancadoGradeItem,
} from '../utils/gradeCalculations';
import {
  Search,
  Upload,
  FileSpreadsheet,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  RotateCcw,
  Download,
  ClipboardPaste,
  ShieldCheck,
  Layers,
  ArrowUpDown,
  Filter,
} from 'lucide-react';

interface CheckLancamentoGradeViewProps {
  data: RawData;
  calculatedMap: Record<number, CalculatedProduct>;
  onNavigateToExportGrade?: () => void;
}

export const CheckLancamentoGradeView: React.FC<CheckLancamentoGradeViewProps> = ({
  data,
  calculatedMap,
  onNavigateToExportGrade,
}) => {
  // Estado dos itens lançados carregados
  const [launchedData, setLaunchedData] = useState<{
    items: LancadoGradeItem[];
    fileName: string;
    checkedAt: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('estoque_grade_check_cache');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'divergencias' | 'nao_lancado' | 'correto'>('all');
  const [sortField, setSortField] = useState<'code' | 'desc' | 'esperado' | 'lancado' | 'diferenca'>('code');
  const [sortAsc, setSortAsc] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Calcula os produtos esperados da plataforma (mesma regra da exportação)
  const expectedMap = useMemo(() => {
    return calculateExpectedGrade(data, calculatedMap);
  }, [data, calculatedMap]);

  // 2. Compara os dados esperados com os lançados
  const comparisonRows = useMemo<CheckGradeComparisonRow[]>(() => {
    if (!launchedData || launchedData.items.length === 0) {
      // Se não carregou arquivo ainda, exibe o preview dos esperados
      return Array.from(expectedMap.values()).map((exp) => ({
        code: exp.code,
        desc: exp.desc,
        quantidadeEsperada: exp.quantidadeEsperada,
        quantidadeLancada: 0,
        diferenca: -exp.quantidadeEsperada,
        status: 'nao_lancado',
        statusLabel: 'Aguardando verificação',
      }));
    }

    return compareGradeLaunch(expectedMap, launchedData.items, calculatedMap);
  }, [expectedMap, launchedData, calculatedMap]);

  // Salva no cache local para persistência rápida
  const updateLaunchedData = (newData: { items: LancadoGradeItem[]; fileName: string; checkedAt: string } | null) => {
    setLaunchedData(newData);
    if (newData) {
      try {
        localStorage.setItem('estoque_grade_check_cache', JSON.stringify(newData));
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
    } else {
      localStorage.removeItem('estoque_grade_check_cache');
    }
  };

  // Upload de arquivo
  const handleFileUpload = async (file: File) => {
    try {
      const parsed = await parseLancamentoGradeFile(file);
      if (parsed.items.length === 0) {
        alert('Nenhum produto válido encontrado no arquivo. Verifique o formato.');
        return;
      }
      updateLaunchedData({
        items: parsed.items,
        fileName: parsed.fileName,
        checkedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
    } catch (e: any) {
      alert(`Erro ao ler arquivo: ${e.message || e}`);
    }
  };

  // Processamento de texto colado
  const handleProcessPastedText = () => {
    if (!pastedText.trim()) {
      alert('Cole o texto ou planilha da grade antes de confirmar.');
      return;
    }
    const parsed = parseLancamentoText(pastedText, 'Texto Colado Manualmente');
    if (parsed.items.length === 0) {
      alert('Não foi possível identificar códigos e quantidades no texto colado.');
      return;
    }
    updateLaunchedData({
      items: parsed.items,
      fileName: 'Texto Colado Manualmente',
      checkedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
    setIsPasteModalOpen(false);
    setPastedText('');
  };

  // Métricas do Check
  const metrics = useMemo(() => {
    let corretos = 0;
    let divergencias = 0;
    let naoLancados = 0;
    let extras = 0;
    let totalEsperadoCx = 0;
    let totalLancadoCx = 0;

    comparisonRows.forEach((r) => {
      totalEsperadoCx += r.quantidadeEsperada;
      totalLancadoCx += r.quantidadeLancada;

      if (r.status === 'correto') corretos++;
      else if (r.status === 'divergencia') divergencias++;
      else if (r.status === 'nao_lancado') naoLancados++;
      else if (r.status === 'extra') extras++;
    });

    const totalDivergentes = divergencias + naoLancados + extras;
    const diferencaLiquida = totalLancadoCx - totalEsperadoCx;

    return {
      totalItens: comparisonRows.length,
      corretos,
      divergencias,
      naoLancados,
      extras,
      totalDivergentes,
      totalEsperadoCx,
      totalLancadoCx,
      diferencaLiquida,
    };
  }, [comparisonRows]);

  // Filtragem
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return comparisonRows.filter((r) => {
      if (q && !(r.code + ' ' + r.desc).toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter === 'divergencias' && r.status === 'correto') {
        return false;
      }
      if (statusFilter === 'nao_lancado' && r.status !== 'nao_lancado') {
        return false;
      }
      if (statusFilter === 'correto' && r.status !== 'correto') {
        return false;
      }
      return true;
    });
  }, [comparisonRows, query, statusFilter]);

  // Ordenação
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      let vA: any = a.code;
      let vB: any = b.code;

      if (sortField === 'desc') {
        vA = a.desc.toLowerCase();
        vB = b.desc.toLowerCase();
      } else if (sortField === 'esperado') {
        vA = a.quantidadeEsperada;
        vB = b.quantidadeEsperada;
      } else if (sortField === 'lancado') {
        vA = a.quantidadeLancada;
        vB = b.quantidadeLancada;
      } else if (sortField === 'diferenca') {
        vA = a.diferenca;
        vB = b.diferenca;
      }

      if (vA < vB) return sortAsc ? -1 : 1;
      if (vA > vB) return sortAsc ? 1 : -1;
      return a.code - b.code;
    });
  }, [filteredRows, sortField, sortAsc]);

  const toggleSort = (field: 'code' | 'desc' | 'esperado' | 'lancado' | 'diferenca') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Copiar Relatório de Auditoria
  const handleCopyReport = () => {
    const header = [
      'CodigoProduto',
      'DescricaoProduto',
      'UnidadeMedida',
      'GradeEstoque',
      'QtdEsperada',
      'GradeCadastrada',
      'Diferenca',
      'Diagnostico',
      'Reserva',
      'Saida',
      'SaldoDisponivel',
    ].join('\t');

    const body = sortedRows
      .map(
        (r) =>
          `${r.code}\t${r.desc}\t${r.unidadeMedida || 'cx'}\t${r.gradeEstoque ?? 1}\t${r.quantidadeEsperada}\t${r.quantidadeLancada}\t${r.diferenca}\t${r.statusLabel}\t${r.reserva ?? 0}\t${r.saida ?? 0}\t${r.saldoDisponivel ?? 0}`
      )
      .join('\r\n');

    navigator.clipboard.writeText(`${header}\r\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Baixar Excel da Auditoria
  const handleExportExcel = () => {
    const dataRows = [
      [
        'CodigoProduto',
        'DescricaoProduto',
        'UnidadeMedida',
        'GradeEstoque',
        'QtdEsperada',
        'GradeCadastrada',
        'Diferenca',
        'Diagnostico',
        'Reserva',
        'Saida',
        'SaldoDisponivel',
      ],
      ...sortedRows.map((r) => [
        r.code,
        r.desc,
        r.unidadeMedida || 'cx',
        r.gradeEstoque ?? 1,
        r.quantidadeEsperada,
        r.quantidadeLancada,
        r.diferenca,
        r.statusLabel,
        r.reserva ?? 0,
        r.saida ?? 0,
        r.saldoDisponivel ?? 0,
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dataRows);

    ws['!cols'] = [
      { wch: 14 }, // CodigoProduto
      { wch: 42 }, // DescricaoProduto
      { wch: 14 }, // UnidadeMedida
      { wch: 14 }, // GradeEstoque
      { wch: 16 }, // QtdEsperada
      { wch: 18 }, // GradeCadastrada
      { wch: 14 }, // Diferenca
      { wch: 30 }, // Diagnostico
      { wch: 12 }, // Reserva
      { wch: 12 }, // Saida
      { wch: 16 }, // SaldoDisponivel
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Check Lancamento Grade');
    const dataStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `check_lancamento_grade_${dataStr}.xlsx`);
  };

  return (
    <section className="w-full flex flex-col p-4 md:p-6 bg-slate-50 min-h-screen">
      {/* CABEÇALHO */}
      <div className="bg-slate-900 text-white rounded-xl shadow-md p-5 mb-5 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-2xl">🔍</span>
              <h1 className="text-xl font-black tracking-wide text-white">
                CHECK DE LANÇAMENTO DA GRADE
              </h1>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  launchedData ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                }`}
              >
                {launchedData ? `✓ Relatório do Sistema Carregado (${launchedData.items.length} itens)` : 'Aguardando Relatório da Grade'}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-600 text-white">
                {expectedMap.size} produtos esperados na plataforma
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Faça o upload do arquivo gerado pelo Promax após lançar a grade para conferir se todas as quantidades foram registradas com precisão e sem omissões.
            </p>
          </div>

          {/* BOTÕES DE AÇÃO: UPLOAD, COLAR, LIMPAR, EXPORTAR */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow transition border border-blue-500"
              title="Carregar arquivo da grade exportada do sistema (.xlsx, .xls, .csv, .txt)"
            >
              <Upload size={14} />
              <span>{launchedData ? 'SUBSTITUIR ARQUIVO' : 'SUBIR ARQUIVO DA GRADE'}</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".txt,.csv,.tsv,.xlsx,.xls,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => setIsPasteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
              title="Colar texto ou tabela diretamente da área de transferência"
            >
              <ClipboardPaste size={14} />
              <span>Colar Dados</span>
            </button>

            {launchedData && (
              <button
                type="button"
                onClick={() => updateLaunchedData(null)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-950 hover:bg-rose-900 text-rose-200 text-xs font-semibold rounded-lg border border-rose-800 transition"
                title="Limpar conferência e iniciar novo check"
              >
                <RotateCcw size={14} />
                <span>Nova Conferência</span>
              </button>
            )}

            {launchedData && (
              <>
                <button
                  type="button"
                  onClick={handleCopyReport}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg shadow transition ${
                    copied ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black'
                  }`}
                  title="Copiar resultado da conferência"
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copied ? 'COPIADO!' : 'COPIAR CHECK'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-green-700 hover:bg-green-600 text-white text-xs font-bold rounded-lg shadow transition"
                  title="Baixar planilha da conferência"
                >
                  <FileSpreadsheet size={15} />
                  <span>BAIXAR EXCEL</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ÁREA DE STATUS SE HOUVER CHECK CARREGADO */}
      {launchedData ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
          {/* Card Total Auditados */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Produtos Auditados</div>
            <div className="text-xl font-black text-slate-900 mt-1">{metrics.totalItens}</div>
            <div className="text-[10px] text-slate-400 mt-0.5 truncate">{launchedData.fileName}</div>
          </div>

          {/* Card Corretos */}
          <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 shadow-sm">
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">100% Corretos</div>
            <div className="text-xl font-black text-emerald-950 mt-1 flex items-center gap-1.5">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span>{metrics.corretos}</span>
            </div>
            <div className="text-[10px] text-emerald-700 mt-0.5">Quantidades idênticas ao esperado</div>
          </div>

          {/* Card Divergências */}
          <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 shadow-sm">
            <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Com Divergência</div>
            <div className="text-xl font-black text-amber-950 mt-1 flex items-center gap-1.5">
              <AlertTriangle size={18} className="text-amber-600" />
              <span>{metrics.divergencias}</span>
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5">Qtd lançada != Qtd esperada</div>
          </div>

          {/* Card Não Lançados */}
          <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200 shadow-sm">
            <div className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Não Lançados</div>
            <div className="text-xl font-black text-rose-950 mt-1 flex items-center gap-1.5">
              <XCircle size={18} className="text-rose-600" />
              <span>{metrics.naoLancados}</span>
            </div>
            <div className="text-[10px] text-rose-700 mt-0.5">Constavam na grade mas faltaram</div>
          </div>

          {/* Card Volume Total */}
          <div className="bg-blue-50 p-3.5 rounded-xl border border-blue-200 shadow-sm">
            <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">Volume de Caixas</div>
            <div className="text-sm font-bold text-slate-800 mt-1">
              Esperado: <span className="font-mono text-blue-900">{metrics.totalEsperadoCx.toLocaleString('pt-BR')}</span>
            </div>
            <div className="text-sm font-bold text-slate-800">
              Lançado: <span className="font-mono text-blue-900">{metrics.totalLancadoCx.toLocaleString('pt-BR')}</span>
            </div>
            <div className={`text-[10px] font-bold mt-0.5 ${metrics.diferencaLiquida === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              Saldo: {metrics.diferencaLiquida > 0 ? `+${metrics.diferencaLiquida}` : metrics.diferencaLiquida} cx
            </div>
          </div>
        </div>
      ) : (
        /* BANNER GUIA QUANDO AINDA NÃO CARREGOU O ARQUIVO */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold mb-3 border border-blue-200">
                <ShieldCheck size={14} />
                <span>Auditoria e Validação de Lançamentos de Grade</span>
              </div>
              <h2 className="text-lg font-black text-slate-900 mb-2">
                Como fazer o Check de Lançamento da Grade:
              </h2>
              <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside font-medium">
                <li>
                  Gere e baixe a exportação da grade na aba <strong className="text-slate-900">EXPORTAR GRADE</strong>.
                </li>
                <li>
                  Importe o arquivo no seu sistema <strong className="text-slate-900">Promax / ERP</strong> para lançar os itens da grade.
                </li>
                <li>
                  Extraia o relatório da grade lançada do sistema e faça o upload aqui (ou cole a tabela).
                </li>
                <li>
                  O sistema apontará na hora qualquer divergência de quantidade ou produtos que deixaram de ser lançados.
                </li>
              </ol>
            </div>

            {/* Dropzone de upload rápido */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full md:w-80 border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50 hover:bg-blue-50 rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
            >
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-1">
                <Upload size={22} />
              </div>
              <div className="text-xs font-black text-slate-800">Clique para Subir o Arquivo da Grade</div>
              <div className="text-[11px] text-slate-500">Aceita Excel (.xlsx, .xls), CSV ou TXT</div>
            </div>
          </div>
        </div>
      )}

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Busca */}
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código ou descrição do produto..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
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

          {/* Filtros de Status */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todos ({comparisonRows.length})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('divergencias')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                statusFilter === 'divergencias'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              ⚠️ Apenas Divergências ({metrics.totalDivergentes})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('nao_lancado')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                statusFilter === 'nao_lancado'
                  ? 'bg-rose-700 text-white shadow-sm'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              ❌ Não Lançados ({metrics.naoLancados})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('correto')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                statusFilter === 'correto'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              ✓ Corretos ({metrics.corretos})
            </button>
          </div>
        </div>
      </div>

      {/* TABELA DE AUDITORIA / CONFERÊNCIA */}
      <div className="bg-white rounded-xl border border-slate-300 shadow overflow-hidden flex-1">
        <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-[#FFC000] text-black font-black text-xs uppercase tracking-wider border-b-2 border-amber-500 sticky top-0 z-10 shadow-sm">
                <th
                  onClick={() => toggleSort('code')}
                  className="py-3 px-3 cursor-pointer hover:bg-amber-400 border-r border-amber-300 text-center select-none"
                  title="Código do Produto"
                >
                  <div className="inline-flex items-center justify-center gap-1 font-black">
                    <span>Código</span>
                    <ArrowUpDown size={12} className="text-black/60" />
                  </div>
                </th>

                <th
                  onClick={() => toggleSort('desc')}
                  className="py-3 px-4 cursor-pointer hover:bg-amber-400 border-r border-amber-300 text-left select-none"
                  title="Descrição do Produto"
                >
                  <div className="inline-flex items-center gap-1 font-black">
                    <span>Descrição do Produto</span>
                    <ArrowUpDown size={12} className="text-black/60" />
                  </div>
                </th>

                <th className="py-3 px-2 border-r border-amber-300 text-center select-none font-black" title="Unidade de Medida">
                  Unid.
                </th>

                <th
                  onClick={() => toggleSort('esperado')}
                  className="py-3 px-3 cursor-pointer hover:bg-amber-400 border-r border-amber-300 text-center select-none"
                  title="Quantidade calculada na plataforma (Exportar Grade)"
                >
                  <div className="inline-flex items-center justify-center gap-1 font-black">
                    <span>Qtd. Esperada</span>
                    <ArrowUpDown size={12} className="text-black/60" />
                  </div>
                </th>

                <th
                  onClick={() => toggleSort('lancado')}
                  className="py-3 px-3 cursor-pointer hover:bg-amber-400 border-r border-amber-300 text-center select-none bg-amber-400"
                  title="Coluna GradeCadastrada do relatório importado"
                >
                  <div className="inline-flex items-center justify-center gap-1 font-black">
                    <span>Grade Cadastrada</span>
                    <ArrowUpDown size={12} className="text-black/60" />
                  </div>
                </th>

                <th
                  onClick={() => toggleSort('diferenca')}
                  className="py-3 px-3 cursor-pointer hover:bg-amber-400 border-r border-amber-300 text-center select-none"
                  title="Diferença: Grade Cadastrada - Esperado"
                >
                  <div className="inline-flex items-center justify-center gap-1 font-black">
                    <span>Diferença</span>
                    <ArrowUpDown size={12} className="text-black/60" />
                  </div>
                </th>

                <th className="py-3 px-3 text-center select-none font-black border-r border-amber-300">
                  Diagnóstico / Status
                </th>

                <th className="py-3 px-2 border-r border-amber-300 text-center select-none font-black" title="Saída lançada na grade">
                  Saída
                </th>

                <th className="py-3 px-2 text-center select-none font-black" title="Saldo Disponível restante">
                  Saldo Disp.
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-xs">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-medium">
                    Nenhum produto encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const isCorreto = row.status === 'correto';
                  const isNaoLancado = row.status === 'nao_lancado';
                  const isDivergente = row.status === 'divergencia';
                  const isExtra = row.status === 'extra';

                  return (
                    <tr
                      key={row.code}
                      className={`transition-colors ${
                        isNaoLancado
                          ? 'bg-rose-50/70 hover:bg-rose-100/70'
                          : isDivergente
                          ? 'bg-amber-50/70 hover:bg-amber-100/70'
                          : isExtra
                          ? 'bg-purple-50/70 hover:bg-purple-100/70'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Código */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 border-r border-slate-100">
                        #{row.code}
                      </td>

                      {/* Descrição */}
                      <td className="py-2.5 px-4 text-left font-bold text-slate-800 border-r border-slate-100 truncate max-w-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{row.desc}</span>
                          {row.isPermanente && (
                            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-black bg-purple-100 text-purple-800 rounded border border-purple-300" title="Quantidade permanente fixada na grade (20 cx)">
                              GRADE FIXA (20 CX)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Unidade */}
                      <td className="py-2.5 px-2 text-center text-slate-500 font-semibold border-r border-slate-100">
                        {row.unidadeMedida || 'cx'}
                      </td>

                      {/* Quantidade Esperada */}
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-950 border-r border-slate-100 bg-blue-50/30">
                        {row.quantidadeEsperada.toLocaleString('pt-BR')} cx
                      </td>

                      {/* Grade Cadastrada */}
                      <td
                        className={`py-2.5 px-3 font-mono font-black border-r border-slate-100 ${
                          isNaoLancado
                            ? 'text-rose-700 bg-rose-100/50'
                            : isDivergente
                            ? 'text-amber-900 bg-amber-100/50'
                            : 'text-emerald-950 bg-emerald-50/40'
                        }`}
                      >
                        {row.quantidadeLancada.toLocaleString('pt-BR')} cx
                      </td>

                      {/* Diferença */}
                      <td className="py-2.5 px-3 font-mono font-black border-r border-slate-100">
                        {row.diferenca === 0 ? (
                          <span className="text-emerald-600 font-bold">0</span>
                        ) : row.diferenca > 0 ? (
                          <span className="text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-black">
                            +{row.diferenca} cx
                          </span>
                        ) : (
                          <span className="text-rose-700 bg-rose-100 px-2 py-0.5 rounded font-black">
                            {row.diferenca} cx
                          </span>
                        )}
                      </td>

                      {/* Diagnóstico / Status */}
                      <td className="py-2.5 px-3 text-center border-r border-slate-100">
                        {isCorreto && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 size={13} />
                            <span>100% CORRETO</span>
                          </span>
                        )}

                        {isNaoLancado && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                            <XCircle size={13} />
                            <span>NÃO LANÇADO</span>
                          </span>
                        )}

                        {isDivergente && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertTriangle size={13} />
                            <span>{row.diferenca > 0 ? `+${row.diferenca} cx` : `${row.diferenca} cx`}</span>
                          </span>
                        )}

                        {isExtra && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                            <HelpCircle size={13} />
                            <span>NÃO PREVISTO (+{row.quantidadeLancada})</span>
                          </span>
                        )}
                      </td>

                      {/* Saída */}
                      <td className="py-2.5 px-2 font-mono text-slate-600 border-r border-slate-100">
                        {row.saida !== undefined ? row.saida : '-'}
                      </td>

                      {/* Saldo Disponível */}
                      <td className="py-2.5 px-2 font-mono font-semibold text-slate-800">
                        {row.saldoDisponivel !== undefined ? row.saldoDisponivel : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* RODAPÉ INFORMATIVO */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            Mostrando <strong>{sortedRows.length}</strong> de <strong>{comparisonRows.length}</strong> itens auditados.
          </div>
          <div className="flex items-center gap-3">
            <span>Diagnóstico: <strong className="text-slate-800">Diferença = Lançado no Sistema - Esperado na Grade</strong></span>
          </div>
        </div>
      </div>

      {/* MODAL PARA COLAR DADOS */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-5 border border-slate-200">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <ClipboardPaste size={16} className="text-blue-600" />
                <span>Colar Relatório / Tabela da Grade Lançada</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Copie os dados da planilha ou relatório da grade no Promax/Excel e cole abaixo. O sistema identificará automaticamente as colunas de <strong>Código</strong> e <strong>Quantidade</strong>.
            </p>

            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Cole aqui o conteúdo copiado (Ctrl+V)..."
              rows={8}
              className="w-full p-3 font-mono text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3 bg-slate-50"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleProcessPastedText}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow transition"
              >
                Conferir Lançamento
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
