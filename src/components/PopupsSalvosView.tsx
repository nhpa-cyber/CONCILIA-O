import React, { useState, useMemo, useRef } from 'react';
import { SavedPopupItem } from '../data/types';
import { 
  ArrowLeft, 
  Trash2, 
  Printer, 
  Search, 
  TrendingDown, 
  TrendingUp, 
  Clock, 
  ShieldAlert, 
  AlertCircle,
  Camera,
  Loader2,
  Columns,
  LayoutGrid,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatBRL } from '../utils/formatters';
import { toJpeg } from 'html-to-image';

interface PopupsSalvosViewProps {
  savedPopups: SavedPopupItem[];
  onRemovePopup: (id: string) => void;
  onClearAll: () => void;
  onNavigateToDashboard: () => void;
}

/**
 * Extrai e normaliza os dados de variação e impacto financeiro de Ontem para Hoje
 * usando o Preço da Caixa da Tabela 7
 */
export const getPopupVariationInfo = (item: SavedPopupItem) => {
  const ontem = item.analysis ? item.analysis.ontem : 0;
  const hoje = item.analysis ? item.analysis.hoje : item.qtde;
  const variacaoCx = item.variacaoCx !== undefined ? item.variacaoCx : (hoje - ontem);
  const absVariacao = Math.abs(variacaoCx);

  // Preço unitário da caixa na Tabela 7
  let unitPrice = item.unitPrice;
  if (!unitPrice || unitPrice <= 0) {
    if (item.qtde > 0 && item.valor) {
      unitPrice = Math.abs(item.valor) / item.qtde;
    } else if (hoje > 0 && item.valor) {
      unitPrice = Math.abs(item.valor) / hoje;
    } else {
      unitPrice = 0;
    }
  }

  // Impacto financeiro da variação de ontem para hoje:
  // Se for falta:
  //   - aumento de falta (hoje > ontem, variacaoCx > 0): piorou o estoque -> impacto negativo (-variacaoCx * unitPrice)
  //   - redução de falta (hoje < ontem, variacaoCx < 0): recuperou o estoque -> impacto positivo
  // Se for sobra:
  //   - aumento de sobra (hoje > ontem, variacaoCx > 0): gerou sobra nova -> impacto positivo (+variacaoCx * unitPrice)
  //   - redução de sobra (hoje < ontem, variacaoCx < 0): reduziu sobra -> impacto negativo
  let impactoFinanceiro = 0;
  if (item.impactoVariacao !== undefined) {
    impactoFinanceiro = item.impactoVariacao;
  } else {
    impactoFinanceiro = item.isFalta ? -(variacaoCx * unitPrice) : (variacaoCx * unitPrice);
  }

  return {
    ontem,
    hoje,
    variacaoCx,
    absVariacao,
    unitPrice,
    impactoFinanceiro,
  };
};

export const PopupsSalvosView: React.FC<PopupsSalvosViewProps> = ({
  savedPopups,
  onRemovePopup,
  onClearAll,
  onNavigateToDashboard,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'falta' | 'sobra'>('all');

  const filteredPopups = useMemo(() => {
    return savedPopups.filter((item) => {
      const matchSearch =
        item.code.toString().includes(searchTerm) ||
        item.desc.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType =
        filterType === 'all' ||
        (filterType === 'falta' && item.isFalta) ||
        (filterType === 'sobra' && !item.isFalta);
      return matchSearch && matchType;
    });
  }, [savedPopups, searchTerm, filterType]);

  // Totais baseados ESTRITAMENTE na VARIAÇÃO e no IMPACTO FINANCEIRO da variação de Ontem para Hoje
  const totals = useMemo(() => {
    let totalImpactoFaltas = 0;
    let totalImpactoSobras = 0;
    let totalVariacaoCxFaltas = 0;
    let totalVariacaoCxSobras = 0;
    let countFaltas = 0;
    let countSobras = 0;

    savedPopups.forEach((p) => {
      const v = getPopupVariationInfo(p);
      if (p.isFalta) {
        // Se a falta aumentou (+7 cx), o impacto financeiro é negativo (-R$ 287,05)
        totalImpactoFaltas += v.impactoFinanceiro;
        totalVariacaoCxFaltas += v.variacaoCx;
        countFaltas++;
      } else {
        totalImpactoSobras += v.impactoFinanceiro;
        totalVariacaoCxSobras += v.variacaoCx;
        countSobras++;
      }
    });

    const saldoLiquido = totalImpactoSobras + totalImpactoFaltas;

    return {
      totalImpactoFaltas,
      totalImpactoSobras,
      totalVariacaoCxFaltas,
      totalVariacaoCxSobras,
      saldoLiquido,
      countFaltas,
      countSobras,
    };
  }, [savedPopups]);

  const printAreaRef = useRef<HTMLDivElement>(null);
  const rowScrollRef = useRef<HTMLDivElement>(null);
  const [isExportingJpg, setIsExportingJpg] = useState(false);
  const [exportingCardId, setExportingCardId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<'fit' | 'scroll' | 'grid'>('fit'); // Padrão: 'fit' (Ajustar todos os cards na tela sem barra)

  const handlePrint = () => {
    window.print();
  };

  const scrollRow = (direction: 'left' | 'right') => {
    if (rowScrollRef.current) {
      rowScrollRef.current.scrollBy({
        left: direction === 'left' ? -380 : 380,
        behavior: 'smooth',
      });
    }
  };

  /**
   * Exporta toda a visualização dos cards e métricas salvos em arquivo JPG
   */
  const handleExportBoardJpg = async () => {
    if (!printAreaRef.current || savedPopups.length === 0) return;
    try {
      setIsExportingJpg(true);
      // Pequena pausa para garantir renderização estável
      await new Promise((r) => setTimeout(r, 120));

      const node = printAreaRef.current;
      const dataUrl = await toJpeg(node, {
        quality: 0.95,
        backgroundColor: '#f8fafc',
        pixelRatio: 2,
        cacheBust: true,
        width: node.scrollWidth,
        height: node.scrollHeight,
      });

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
      const link = document.createElement('a');
      link.download = `auditoria-popups-salvos-${dateStr}_${timeStr}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao gerar print em JPG:', err);
      alert('Não foi possível gerar a imagem JPG. Tente novamente.');
    } finally {
      setIsExportingJpg(false);
    }
  };

  /**
   * Exporta um único card individual de produto em arquivo JPG
   */
  const handleExportSingleCardJpg = async (cardId: string, desc: string, code: number) => {
    const cardEl = document.getElementById(`popup-card-${cardId}`);
    if (!cardEl) return;
    try {
      setExportingCardId(cardId);
      await new Promise((r) => setTimeout(r, 100));

      const dataUrl = await toJpeg(cardEl, {
        quality: 0.96,
        backgroundColor: '#ffffff',
        pixelRatio: 2.5,
      });

      const cleanDesc = desc
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .slice(0, 25);

      const link = document.createElement('a');
      link.download = `card-${code}_${cleanDesc}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Erro ao exportar card em JPG:', err);
    } finally {
      setExportingCardId(null);
    }
  };

  return (
    <div className="w-full bg-slate-50 min-h-screen pb-16 font-sans">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs sticky top-0 z-10 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateToDashboard}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
              title="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Pop-ups Salvos para Auditoria
                </h1>
                <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {savedPopups.length} {savedPopups.length === 1 ? 'item' : 'itens'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Variação de Ontem para Hoje e Impacto Financeiro calculado pelo Preço da Tabela 7
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Print em JPG */}
            <button
              onClick={handleExportBoardJpg}
              disabled={savedPopups.length === 0 || isExportingJpg}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg border transition shadow-xs ${
                savedPopups.length === 0 || isExportingJpg
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 active:scale-95'
              }`}
              title="Baixar print de auditoria em arquivo de imagem JPG"
            >
              {isExportingJpg ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Gerando JPG...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4 text-white" />
                  <span>Print em JPG</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrint}
              disabled={savedPopups.length === 0}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition shadow-xs ${
                savedPopups.length === 0
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Imprimir</span>
            </button>

            <button
              onClick={onClearAll}
              disabled={savedPopups.length === 0}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition shadow-xs ${
                savedPopups.length === 0
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              }`}
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Limpar Tudo</span>
            </button>
          </div>
        </div>

        {/* Metrics Cards: Focados no IMPACTO DA VARIAÇÃO de Ontem para Hoje */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {/* FALTAS SALVAS */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider block">
                Faltas Salvas ({totals.countFaltas})
              </span>
              <span className="text-lg font-black text-red-900 mt-0.5 block">
                {totals.totalImpactoFaltas === 0
                  ? 'R$ 0,00'
                  : `${totals.totalImpactoFaltas < 0 ? '-' : '+'}R$ ${Math.abs(totals.totalImpactoFaltas).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <span className="text-[10px] text-red-700/80 font-semibold block mt-0.5">
                Variação: {totals.totalVariacaoCxFaltas > 0 ? `+${totals.totalVariacaoCxFaltas}` : totals.totalVariacaoCxFaltas} cx vs ontem
              </span>
            </div>
            <TrendingDown className="w-6 h-6 text-red-500" />
          </div>

          {/* SOBRAS SALVAS */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">
                Sobras Salvas ({totals.countSobras})
              </span>
              <span className="text-lg font-black text-emerald-900 mt-0.5 block">
                {totals.totalImpactoSobras === 0
                  ? 'R$ 0,00'
                  : `${totals.totalImpactoSobras < 0 ? '-' : '+'}R$ ${Math.abs(totals.totalImpactoSobras).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <span className="text-[10px] text-emerald-700/80 font-semibold block mt-0.5">
                Variação: {totals.totalVariacaoCxSobras > 0 ? `+${totals.totalVariacaoCxSobras}` : totals.totalVariacaoCxSobras} cx vs ontem
              </span>
            </div>
            <TrendingUp className="w-6 h-6 text-emerald-500" />
          </div>

          {/* SALDO LÍQUIDO SALVO */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider block">
                Saldo Líquido da Variação
              </span>
              <span className={`text-lg font-black mt-0.5 block ${totals.saldoLiquido < 0 ? 'text-red-700' : totals.saldoLiquido > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                {totals.saldoLiquido < 0 ? '-' : totals.saldoLiquido > 0 ? '+' : ''}R$ {Math.abs(totals.saldoLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-purple-700/80 font-semibold block mt-0.5">
                Impacto financeiro diário (Hoje vs Ontem)
              </span>
            </div>
            <ShieldAlert className="w-6 h-6 text-purple-500" />
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-200">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por código ou descrição do produto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-md border transition ${
                filterType === 'all'
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Todos ({savedPopups.length})
            </button>
            <button
              onClick={() => setFilterType('falta')}
              className={`px-3 py-1 text-xs font-semibold rounded-md border transition ${
                filterType === 'falta'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Faltas ({totals.countFaltas})
            </button>
            <button
              onClick={() => setFilterType('sobra')}
              className={`px-3 py-1 text-xs font-semibold rounded-md border transition ${
                filterType === 'sobra'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Sobras ({totals.countSobras})
            </button>

            {/* Alternador de Layout: Ajustar à Tela (Sem barra) vs Com Rolagem vs Grade */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2.5 ml-1">
              <button
                onClick={() => setLayoutMode('fit')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md border transition ${
                  layoutMode === 'fit'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
                title="Ajustar todos os cards na tela sem barra de rolagem"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Ajustar à Tela (Sem barra)</span>
              </button>
              <button
                onClick={() => setLayoutMode('scroll')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md border transition ${
                  layoutMode === 'scroll'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
                title="Cards em tamanho maior com barra de rolagem horizontal"
              >
                <ChevronRight className="w-3.5 h-3.5" />
                <span>Com Rolagem</span>
              </button>
              <button
                onClick={() => setLayoutMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md border transition ${
                  layoutMode === 'grid'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
                title="Visualizar em grade (várias linhas)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grade</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid of Saved Pop-ups (Área de Captura do Print em JPG) */}
      <div ref={printAreaRef} className="w-full px-3 sm:px-5 py-4">
        {/* Cabeçalho do Relatório para o Print em JPG */}
        {filteredPopups.length > 0 && (
          <div className="mb-4 bg-white border-2 border-slate-200 rounded-xl p-3.5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-slate-200">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>Relatório de Auditoria — Pop-ups Salvos</span>
                  <span className="bg-purple-100 text-purple-800 text-xs font-bold px-2 py-0.5 rounded-full">
                    {filteredPopups.length} {filteredPopups.length === 1 ? 'item' : 'itens'}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Variação de Ontem para Hoje e Impacto Financeiro calculado pelo Preço da Tabela 7
                </p>
              </div>
              <div className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                Data: {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {/* Mini Cards de Resumo no Print */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">Faltas Salvas ({totals.countFaltas})</span>
                  <span className="text-sm font-black text-red-900 block mt-0.5">
                    {totals.totalImpactoFaltas === 0 ? 'R$ 0,00' : `${totals.totalImpactoFaltas < 0 ? '-' : '+'}R$ ${Math.abs(totals.totalImpactoFaltas).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                  <span className="text-[10px] text-red-700/80 font-semibold block">
                    Variação: {totals.totalVariacaoCxFaltas > 0 ? `+${totals.totalVariacaoCxFaltas}` : totals.totalVariacaoCxFaltas} cx
                  </span>
                </div>
                <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Sobras Salvas ({totals.countSobras})</span>
                  <span className="text-sm font-black text-emerald-900 block mt-0.5">
                    {totals.totalImpactoSobras === 0 ? 'R$ 0,00' : `${totals.totalImpactoSobras < 0 ? '-' : '+'}R$ ${Math.abs(totals.totalImpactoSobras).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                  <span className="text-[10px] text-emerald-700/80 font-semibold block">
                    Variação: {totals.totalVariacaoCxSobras > 0 ? `+${totals.totalVariacaoCxSobras}` : totals.totalVariacaoCxSobras} cx
                  </span>
                </div>
                <TrendingUp className="w-5 h-5 text-emerald-500 shrink-0" />
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">Saldo Líquido da Variação</span>
                  <span className={`text-sm font-black block mt-0.5 ${totals.saldoLiquido < 0 ? 'text-red-700' : totals.saldoLiquido > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                    {totals.saldoLiquido < 0 ? '-' : totals.saldoLiquido > 0 ? '+' : ''}R$ {Math.abs(totals.saldoLiquido).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[10px] text-purple-700/80 font-semibold block">
                    Impacto diário consolidado
                  </span>
                </div>
                <ShieldAlert className="w-5 h-5 text-purple-500 shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* Informação / Barra de Navegação Horizontal */}
        {filteredPopups.length > 0 && (
          <div className="flex items-center justify-between mb-2.5 px-1 text-xs text-slate-600 font-semibold print:hidden">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-600"></span>
              {layoutMode === 'fit' ? (
                <span>Todos os <b>{filteredPopups.length}</b> cards lado a lado ajustados na tela (sem rolagem):</span>
              ) : layoutMode === 'scroll' ? (
                <span>Cards lado a lado com barra de rolagem (use o scroll ou setas):</span>
              ) : (
                <span>Cards distribuídos em grade:</span>
              )}
            </div>
            {layoutMode === 'scroll' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scrollRow('left')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs transition font-bold"
                  title="Rolar cards para a esquerda"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Anterior</span>
                </button>
                <button
                  onClick={() => scrollRow('right')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-2xs transition font-bold"
                  title="Rolar cards para a direita"
                >
                  <span>Próximo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {filteredPopups.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl shadow-xs p-8 max-w-lg mx-auto">
            <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-purple-100">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Nenhum pop-up salvo no momento
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              Para salvar um pop-up de auditoria, dê um <b>duplo clique</b> na célula de <b>QTDE</b> de qualquer produto na tabela de faltas ou sobras do Dashboard.
            </p>
            <button
              onClick={onNavigateToDashboard}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ir para o Dashboard</span>
            </button>
          </div>
        ) : (
          <div
            ref={rowScrollRef}
            className={
              layoutMode === 'fit'
                ? 'grid w-full gap-2 items-stretch'
                : layoutMode === 'scroll'
                ? 'flex flex-row flex-nowrap gap-4 overflow-x-auto pb-4 pt-1 items-stretch scroll-smooth w-full'
                : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
            }
            style={
              layoutMode === 'fit'
                ? { gridTemplateColumns: `repeat(${Math.max(filteredPopups.length, 1)}, minmax(0, 1fr))` }
                : undefined
            }
          >
            {filteredPopups.map((popup) => {
              const v = getPopupVariationInfo(popup);
              const isNegativeImpact = v.impactoFinanceiro < 0;
              const isPositiveImpact = v.impactoFinanceiro > 0;
              const isCompact = (layoutMode === 'fit' && filteredPopups.length >= 4) || filteredPopups.length >= 6;

              return (
                <div
                  key={popup.id}
                  id={`popup-card-${popup.id}`}
                  className={`${
                    layoutMode === 'fit'
                      ? 'w-full min-w-0'
                      : layoutMode === 'scroll'
                      ? 'w-[340px] shrink-0'
                      : 'w-full'
                  } bg-white rounded-xl border-2 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col ${
                    popup.isFalta
                      ? 'border-red-200/90 hover:border-red-300'
                      : 'border-emerald-200/90 hover:border-emerald-300'
                  }`}
                >
                  {/* Barra de destaque superior bem marcada */}
                  <div className={`h-1.5 w-full ${popup.isFalta ? 'bg-red-500' : 'bg-emerald-500'}`} />

                  {/* Header card bem delineado */}
                  <div
                    className={`border-b-2 flex items-start justify-between ${
                      popup.isFalta
                        ? 'bg-red-50/80 border-red-200/80'
                        : 'bg-emerald-50/80 border-emerald-200/80'
                    } ${isCompact ? 'p-2' : 'p-3.5'}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`font-mono font-bold text-slate-800 bg-white rounded border border-slate-300 shadow-2xs ${
                          isCompact ? 'text-[9px] px-1 py-0.5' : 'text-xs px-2 py-0.5'
                        }`}>
                          #{popup.code}
                        </span>
                        <span
                          className={`font-extrabold rounded uppercase tracking-wider shadow-2xs ${
                            isCompact ? 'text-[8px] px-1.5 py-0.5' : 'text-[10px] px-2.5 py-0.5'
                          } ${
                            popup.isFalta
                              ? 'bg-red-600 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {popup.isFalta ? 'Falta' : 'Sobra'}
                        </span>
                      </div>
                      <h3
                        className={`font-extrabold text-slate-900 line-clamp-2 leading-tight ${
                          isCompact ? 'text-[10px] mt-1 h-7' : 'text-xs mt-1.5'
                        }`}
                        title={popup.desc}
                      >
                        {popup.desc}
                      </h3>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0 ml-1">
                      {/* Botão de Print JPG Individual deste Card */}
                      <button
                        onClick={() => handleExportSingleCardJpg(popup.id, popup.desc, popup.code)}
                        disabled={exportingCardId === popup.id}
                        className="text-slate-400 hover:text-indigo-600 p-1 rounded hover:bg-indigo-50 transition"
                        title="Baixar print deste card em JPG"
                      >
                        {exportingCardId === popup.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        ) : (
                          <Camera className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => onRemovePopup(popup.id)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-100 transition"
                        title="Excluir este pop-up salvo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* DESTAQUE PRINCIPAL: Variação e Impacto Financeiro da Variação de Ontem para Hoje */}
                  <div className={`border-b-2 border-slate-200 ${isCompact ? 'p-1.5 bg-slate-50/70' : 'p-3.5 bg-slate-50/50'}`}>
                    <div className={`font-extrabold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between ${
                      isCompact ? 'text-[8px]' : 'text-[10px]'
                    }`}>
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${popup.isFalta ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                        <span>Variação & Impacto</span>
                      </span>
                      <span className={`font-mono font-bold text-slate-700 bg-white rounded border border-slate-300 shadow-2xs ${
                        isCompact ? 'text-[8px] px-1 py-0.2' : 'text-[10px] px-2 py-0.5'
                      }`}>
                        Tab. 7
                      </span>
                    </div>

                    <div className={`bg-white rounded-lg border-2 border-slate-200 shadow-2xs ${isCompact ? 'p-1.5' : 'p-3'}`}>
                      {isCompact ? (
                        <>
                          <div className="grid grid-cols-2 gap-1 text-center border-b border-slate-100 pb-1 mb-1">
                            <div>
                              <span className="text-[7px] text-slate-500 font-extrabold block uppercase">Variação</span>
                              <span
                                className={`text-[11px] font-black block leading-tight ${
                                  v.variacaoCx === 0
                                    ? 'text-slate-600'
                                    : popup.isFalta
                                    ? v.variacaoCx > 0
                                      ? 'text-red-600'
                                      : 'text-emerald-600'
                                    : v.variacaoCx > 0
                                    ? 'text-emerald-600'
                                    : 'text-red-600'
                                }`}
                              >
                                {v.variacaoCx > 0 ? `+${v.variacaoCx}` : v.variacaoCx} cx
                              </span>
                            </div>
                            <div>
                              <span className="text-[7px] text-slate-500 font-extrabold block uppercase">Impacto</span>
                              <span
                                className={`text-[10px] font-black block leading-tight truncate ${
                                  isNegativeImpact
                                    ? 'text-red-700'
                                    : isPositiveImpact
                                    ? 'text-emerald-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {v.impactoFinanceiro === 0
                                  ? 'R$ 0'
                                  : `${isNegativeImpact ? '-' : '+'}R$ ${Math.abs(v.impactoFinanceiro).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                              </span>
                            </div>
                          </div>
                          <div className="text-center">
                            <span className="text-[7px] text-slate-400 font-bold block uppercase">Preço Tab. 7</span>
                            <span className="text-[9px] font-extrabold text-slate-900 block leading-tight">
                              R$ {v.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {/* Variação em Caixas */}
                          <div className="border-r border-slate-200 pr-1">
                            <span className="text-[10px] text-slate-500 font-extrabold block uppercase tracking-wide">
                              Variação
                            </span>
                            <span
                              className={`text-base font-black block mt-0.5 ${
                                v.variacaoCx === 0
                                  ? 'text-slate-600'
                                  : popup.isFalta
                                  ? v.variacaoCx > 0
                                    ? 'text-red-600'
                                    : 'text-emerald-600'
                                  : v.variacaoCx > 0
                                  ? 'text-emerald-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {v.variacaoCx > 0 ? `+${v.variacaoCx}` : v.variacaoCx} cx
                            </span>
                          </div>

                          {/* Impacto Financeiro da Variação */}
                          <div className="border-r border-slate-200 px-1">
                            <span className="text-[10px] text-slate-500 font-extrabold block uppercase tracking-wide">
                              Impacto (R$)
                            </span>
                            <span
                              className={`text-base font-black block mt-0.5 ${
                                isNegativeImpact
                                  ? 'text-red-700'
                                  : isPositiveImpact
                                  ? 'text-emerald-700'
                                  : 'text-slate-700'
                              }`}
                            >
                              {v.impactoFinanceiro === 0
                                ? 'R$ 0,00'
                                : `${isNegativeImpact ? '-' : '+'}R$ ${Math.abs(v.impactoFinanceiro).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </span>
                          </div>

                          {/* Preço Unitário por Caixa (Tabela 7) */}
                          <div className="pl-1">
                            <span className="text-[10px] text-slate-500 font-extrabold block uppercase tracking-wide">
                              Preço Tab. 7
                            </span>
                            <span className="text-xs font-black text-slate-900 block mt-1">
                              R$ {v.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comparativo Ontem vs Hoje detalhado */}
                  <div className={`border-b-2 border-slate-200 bg-white ${isCompact ? 'p-1.5 space-y-1' : 'p-3.5 space-y-2'}`}>
                    <div className={`font-extrabold text-slate-800 flex items-center justify-between ${
                      isCompact ? 'text-[9px]' : 'text-[11px]'
                    }`}>
                      <span>Ontem vs Hoje</span>
                      <span
                        className={`font-bold rounded border shadow-2xs whitespace-nowrap ${
                          isCompact ? 'text-[8px] px-1 py-0.2' : 'text-[10px] px-2.5 py-0.5'
                        }`}
                        style={{
                          backgroundColor: popup.analysis.bg,
                          color: popup.analysis.color,
                          borderColor: popup.analysis.color + '40',
                        }}
                      >
                        {popup.analysis.label}
                      </span>
                    </div>

                    <div className={`grid grid-cols-2 gap-1 bg-slate-50 rounded-lg border border-slate-200 ${
                      isCompact ? 'p-1' : 'p-2.5'
                    }`}>
                      <div>
                        <span className="text-[8px] text-slate-400 block font-bold">Ontem:</span>
                        <span className={`font-extrabold text-slate-900 ${isCompact ? 'text-[10px]' : 'text-sm'}`}>{v.ontem} cx</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 block font-bold">Hoje:</span>
                        <span className={`font-extrabold text-slate-900 ${isCompact ? 'text-[10px]' : 'text-sm'}`}>{v.hoje} cx</span>
                      </div>
                    </div>

                    {/* Referência do Saldo Total Acumulado */}
                    <div className={`flex items-center justify-between text-slate-500 pt-1 border-t border-slate-200 truncate ${
                      isCompact ? 'text-[8px]' : 'text-[11px]'
                    }`}>
                      <span className="font-medium">Saldo Hoje:</span>
                      <span className="font-bold text-slate-800 truncate ml-1">
                        {popup.qtde} cx ({formatBRL(popup.valor)})
                      </span>
                    </div>
                  </div>

                  {/* Variação dos Últimos 5 Dias */}
                  {popup.last5Days && popup.last5Days.days && (
                    <div className={`border-b-2 border-slate-200 bg-white ${isCompact ? 'p-1.5' : 'p-3.5'}`}>
                      <div className={`flex items-center justify-between font-extrabold text-slate-800 mb-1 ${
                        isCompact ? 'text-[8px]' : 'text-[11px]'
                      }`}>
                        <span>Últimos 5 Dias</span>
                        <span className={`font-bold text-slate-600 bg-slate-100 rounded border border-slate-200 ${
                          isCompact ? 'text-[7px] px-1 py-0.2' : 'text-[10px] px-2 py-0.5'
                        }`}>
                          Méd: {popup.last5Days.avg}
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-0.5 text-center">
                        {popup.last5Days.days.map((d, idx) => (
                          <div
                            key={idx}
                            className={`rounded border transition ${
                              isCompact ? 'p-0.5 text-[7px]' : 'p-1.5 text-[10px] border-2'
                            } ${
                              d.isToday
                                ? 'bg-purple-50 border-purple-500 font-black text-purple-950 shadow-2xs'
                                : 'bg-slate-50 border-slate-200 text-slate-800 font-bold'
                            }`}
                          >
                            <span className="block text-slate-400 font-bold leading-tight truncate">
                              {isCompact ? d.label.slice(0, 3) : d.label}
                            </span>
                            <span className={`block font-black leading-tight ${isCompact ? 'text-[8px] mt-0.5' : 'text-xs mt-0.5'}`}>
                              {d.qty}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer timestamp */}
                  <div className={`bg-slate-50 text-slate-500 flex items-center justify-between mt-auto ${
                    isCompact ? 'p-1.5 text-[8px]' : 'p-2.5 text-[10px]'
                  }`}>
                    <span className="flex items-center gap-1 font-medium truncate">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{popup.savedAt}</span>
                    </span>
                    {popup.matched021101 && (
                      <span className="text-emerald-800 font-bold bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300 text-[8px] whitespace-nowrap">
                        {popup.matched021101.statusText}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
