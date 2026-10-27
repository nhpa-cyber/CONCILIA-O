import React, { useState, useMemo } from 'react';
import { RawData, ContagemEstoqueItem, CalculatedProduct } from '../data/types';
import { consolidateContagens, getItemDateString } from '../utils/contagemUtils';
import { 
  Calendar, 
  Search, 
  Download, 
  Copy, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  ArrowLeft,
  Boxes,
  FileSpreadsheet,
  Layers,
  Package,
  Plus
} from 'lucide-react';

interface ContagemDiaViewProps {
  data: RawData;
  calculatedProducts: CalculatedProduct[];
  onUpdateContagem: (item: ContagemEstoqueItem) => void;
  onDeleteContagem: (id: string) => void;
  onClearContagensDoDia?: (dateStr: string) => void;
  onAplicarContagensAoEstoque?: (items: ContagemEstoqueItem[]) => void;
  onNavigateToContagem: () => void;
}

export const ContagemDiaView: React.FC<ContagemDiaViewProps> = ({
  data,
  calculatedProducts,
  onUpdateContagem,
  onDeleteContagem,
  onClearContagensDoDia,
  onAplicarContagensAoEstoque,
  onNavigateToContagem,
}) => {
  const allContagens = useMemo(
    () => consolidateContagens(data.contagensEstoque || []),
    [data.contagensEstoque]
  );

  // Extrair datas disponíveis de todas as contagens
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    const today = new Date().toLocaleDateString('pt-BR');
    dates.add(today);

    allContagens.forEach((it) => {
      const d = getItemDateString(it);
      if (d) dates.add(d);
    });

    return Array.from(dates).sort((a, b) => {
      // Ordena por data decrescente
      const [da, ma, ya] = a.split('/').map(Number);
      const [db, mb, yb] = b.split('/').map(Number);
      const dateA = new Date(ya, ma - 1, da).getTime();
      const dateB = new Date(yb, mb - 1, db).getTime();
      return dateB - dateA;
    });
  }, [allContagens]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toLocaleDateString('pt-BR');
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal de edição de item
  const [editingItem, setEditingItem] = useState<ContagemEstoqueItem | null>(null);
  const [editPallets, setEditPallets] = useState<number>(0);
  const [editLastros, setEditLastros] = useState<number>(0);
  const [editCaixas, setEditCaixas] = useState<number>(0);
  const [editUnidades, setEditUnidades] = useState<number>(0);

  const showToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtrar contagens da data selecionada (e consolida/soma itens idênticos)
  const contagensDoDia = useMemo(() => {
    const list = allContagens.filter((it) => {
      const itemDate = getItemDateString(it);
      return itemDate === selectedDate;
    });
    return consolidateContagens(list);
  }, [allContagens, selectedDate]);

  // Filtrar com base na pesquisa
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return contagensDoDia;
    return contagensDoDia.filter((it) => {
      const codStr = String(it.cod);
      const descStr = (it.desc || '').toLowerCase();
      return codStr.includes(q) || descStr.includes(q);
    });
  }, [contagensDoDia, searchQuery]);

  // Totais do dia
  const summary = useMemo(() => {
    let totPallets = 0;
    let totLastros = 0;
    let totCaixas = 0;
    let totUnidadesSoltas = 0;
    let totUnidadesGerais = 0;
    let totCaixasFechadas = 0;

    contagensDoDia.forEach((it) => {
      totPallets += it.pallets || 0;
      totLastros += it.lastros || 0;
      totCaixas += it.caixas || 0;
      totUnidadesSoltas += it.unidades || 0;
      totUnidadesGerais += it.totalUnidades || 0;
      const fator = it.fatorCx || 1;
      totCaixasFechadas += Math.floor((it.totalUnidades || 0) / fator);
    });

    return {
      totalItens: contagensDoDia.length,
      totPallets,
      totLastros,
      totCaixas,
      totUnidadesSoltas,
      totUnidadesGerais,
      totCaixasFechadas,
    };
  }, [contagensDoDia]);

  // Iniciar edição
  const handleStartEdit = (item: ContagemEstoqueItem) => {
    setEditingItem(item);
    setEditPallets(item.pallets || 0);
    setEditLastros(item.lastros || 0);
    setEditCaixas(item.caixas || 0);
    setEditUnidades(item.unidades || 0);
  };

  // Salvar edição
  const handleSaveEdit = () => {
    if (!editingItem) return;
    const fator = editingItem.fatorCx || 1;
    const cxPallet = editingItem.caixasPorPallet || 0;
    const cxLastro = editingItem.caixasPorLastro || 0;

    const newUnits =
      (editPallets * cxPallet + editLastros * cxLastro + editCaixas) * fator + editUnidades;

    const cx = Math.floor(newUnits / fator);
    const un = newUnits % fator;
    const formattedBoxes = `${cx} cx${un ? ` + ${un} un` : ''}`;

    const updatedItem: ContagemEstoqueItem = {
      ...editingItem,
      pallets: editPallets,
      lastros: editLastros,
      caixas: editCaixas,
      unidades: editUnidades,
      totalUnidades: newUnits,
      totalCaixasDecimal: newUnits / fator,
      totalCaixasFormatado: formattedBoxes,
    };

    onUpdateContagem(updatedItem);
    setEditingItem(null);
    showToast(`✅ Produto [${editingItem.cod}] atualizado com sucesso!`);
  };

  // Excluir item
  const handleDeleteItem = (id: string, cod: number) => {
    if (window.confirm(`Tem certeza que deseja remover o produto [${cod}] da contagem do dia?`)) {
      onDeleteContagem(id);
      showToast(`Item [${cod}] removido.`);
    }
  };

  // Copiar para o Excel
  const handleCopyToExcel = async () => {
    if (contagensDoDia.length === 0) {
      showToast('Nenhum item na contagem desta data para copiar.');
      return;
    }

    const header = 'Código\tDescrição\tPallets\tLastros\tCaixas\tUnidades soltas\tTotal Caixas\tTotal Unidades\tData/Hora';
    const rows = contagensDoDia.map((it) => {
      const fator = it.fatorCx || 1;
      const cx = Math.floor(it.totalUnidades / fator);
      const soltas = it.totalUnidades % fator;
      return [
        it.cod,
        it.desc,
        it.pallets || 0,
        it.lastros || 0,
        it.caixas || 0,
        soltas,
        cx,
        it.totalUnidades,
        it.dataHora || selectedDate,
      ].join('\t');
    });

    const text = [header, ...rows].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      showToast('✅ Tabela copiada! Cole direto no Excel ou Planilhas.');
    } catch {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      showToast('✅ Tabela copiada com sucesso!');
    }
  };

  // Exportar CSV
  const handleExportCsv = () => {
    if (contagensDoDia.length === 0) return;
    const header = 'Codigo;Descricao;Pallets;Lastros;Caixas;UnidadesSoltas;TotalCaixas;TotalUnidades;DataHora\n';
    const rows = contagensDoDia
      .map((it) => {
        const fator = it.fatorCx || 1;
        const cx = Math.floor(it.totalUnidades / fator);
        const soltas = it.totalUnidades % fator;
        return `${it.cod};"${(it.desc || '').replace(/"/g, '""')}";${it.pallets || 0};${it.lastros || 0};${it.caixas || 0};${soltas};${cx};${it.totalUnidades};"${it.dataHora || selectedDate}"`;
      })
      .join('\n');

    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contagem_estoque_${selectedDate.replace(/\//g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Arquivo CSV baixado!');
  };

  // Aplicar ao estoque oficial
  const handleApplyToStock = () => {
    if (contagensDoDia.length === 0 || !onAplicarContagensAoEstoque) return;
    if (
      window.confirm(
        `Deseja aplicar os ${contagensDoDia.length} itens contados no dia ${selectedDate} diretamente na coluna de inventário físico da plataforma?`
      )
    ) {
      onAplicarContagensAoEstoque(contagensDoDia);
      showToast(`✅ Contagens de ${selectedDate} aplicadas com sucesso à base oficial de estoque!`);
    }
  };

  // Zerar dia
  const handleResetDay = () => {
    if (contagensDoDia.length === 0) return;
    if (
      window.confirm(
        `ATENÇÃO: Deseja apagar todas as ${contagensDoDia.length} contagens registradas no dia ${selectedDate}?`
      )
    ) {
      contagensDoDia.forEach((it) => {
        onDeleteContagem(it.id);
      });
      showToast(`Contagens do dia ${selectedDate} apagadas.`);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4 font-sans text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-sm font-semibold flex items-center gap-2 border border-slate-700 animate-fade-in">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-sm">
              <Calendar size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                CONTAGEM DO DIA
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Relatório consolidado de tudo o que foi registrado pelos conferentes
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 shadow-inner">
            <Calendar size={15} className="text-amber-600" />
            <span className="text-xs font-bold text-slate-600 uppercase">Data:</span>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold text-sm text-slate-900 outline-none cursor-pointer"
            >
              {availableDates.map((d) => (
                <option key={d} value={d}>
                  {d} {d === new Date().toLocaleDateString('pt-BR') ? '(Hoje)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={onNavigateToContagem}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-3 py-2 rounded-lg transition-colors shadow-sm"
            title="Ir para a tela de lançamento de produtos"
          >
            <Plus size={15} />
            <span>Novo Lançamento</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Itens Contados
          </span>
          <div className="text-2xl font-black text-slate-900 mt-0.5">
            {summary.totalItens}
          </div>
          <span className="text-[11px] text-slate-400">produtos distintos</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm border-l-4 border-l-blue-500">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Pallets Totais
          </span>
          <div className="text-2xl font-black text-blue-700 mt-0.5">
            {summary.totPallets}
          </div>
          <span className="text-[11px] text-slate-400">{summary.totLastros} lastros</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm border-l-4 border-l-emerald-500">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Caixas Fechadas
          </span>
          <div className="text-2xl font-black text-emerald-700 mt-0.5">
            {summary.totCaixasFechadas.toLocaleString('pt-BR')}
          </div>
          <span className="text-[11px] text-slate-400">calculadas por pallet/lastro/cx</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm border-l-4 border-l-purple-500">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total de Unidades
          </span>
          <div className="text-2xl font-black text-purple-700 mt-0.5">
            {summary.totUnidadesGerais.toLocaleString('pt-BR')}
          </div>
          <span className="text-[11px] text-slate-400">unidades físicas totais</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar produto por código ou nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyToExcel}
              disabled={contagensDoDia.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-bold transition-colors shadow-xs"
              title="Copiar dados para colar no Excel"
            >
              <Copy size={14} className="text-slate-500" />
              <span>Copiar para Excel</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={contagensDoDia.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-bold transition-colors shadow-xs"
              title="Baixar planilha CSV"
            >
              <FileSpreadsheet size={14} className="text-emerald-600" />
              <span>Exportar CSV</span>
            </button>

            {onAplicarContagensAoEstoque && (
              <button
                onClick={handleApplyToStock}
                disabled={contagensDoDia.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-xs"
                title="Substituir inventário físico no estoque oficial com estes números"
              >
                <CheckCircle2 size={14} />
                <span>Aplicar ao Estoque</span>
              </button>
            )}

            <button
              onClick={handleResetDay}
              disabled={contagensDoDia.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 text-xs font-bold transition-colors shadow-xs"
              title="Apagar contagens desta data"
            >
              <Trash2 size={14} />
              <span>Zerar Dia</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Package size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-700 text-base">
              Nenhuma contagem registrada em {selectedDate}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              As contagens lançadas pelos conferentes na aba{' '}
              <b className="text-amber-600">CONTAGEM ESTOQUE</b> são salvas e consolidadas
              aqui nesta data automaticamente.
            </p>
            <button
              onClick={onNavigateToContagem}
              className="mt-4 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={15} />
              <span>Ir para Contagem Estoque</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 w-20">CÓDIGO</th>
                  <th className="py-2.5 px-3">DESCRIÇÃO</th>
                  <th className="py-2.5 px-3 text-center">PALLETS</th>
                  <th className="py-2.5 px-3 text-center">LASTROS</th>
                  <th className="py-2.5 px-3 text-center">CAIXAS</th>
                  <th className="py-2.5 px-3 text-center">UNIDADES</th>
                  <th className="py-2.5 px-3 text-right">TOTAL CAIXAS</th>
                  <th className="py-2.5 px-3 text-right">TOTAL UNID</th>
                  <th className="py-2.5 px-3 text-center">REGISTRO</th>
                  <th className="py-2.5 px-3 text-center w-24">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => {
                  const fator = item.fatorCx || 1;
                  const cxFechadas = Math.floor(item.totalUnidades / fator);
                  const unSoltas = item.totalUnidades % fator;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-amber-50/60 transition-colors odd:bg-white even:bg-slate-50/50"
                    >
                      <td className="py-2 px-3 text-center font-mono text-slate-400 text-[10px]">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">
                        {item.cod}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-800">
                        {item.desc}
                      </td>
                      <td className="py-2 px-3 text-center font-mono font-bold text-blue-800">
                        {item.pallets || 0}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {item.lastros || 0}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {item.caixas || 0}
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-600">
                        {item.unidades || 0}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                        {cxFechadas} cx{unSoltas ? ` + ${unSoltas} un` : ''}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {item.totalUnidades.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2 px-3 text-center text-slate-500 font-mono text-[10px]">
                        {item.dataHora?.split(/[\s,]+/)[1] || item.dataHora || '-'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="p-1 rounded text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Editar quantidades deste item"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id, item.cod)}
                            className="p-1 rounded text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Remover item da contagem"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Edição de Quantidades */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 border border-slate-200 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Editar Contagem: [{editingItem.cod}]
                </h3>
                <p className="text-xs text-slate-500 line-clamp-1">{editingItem.desc}</p>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Pallets:</label>
                  <input
                    type="number"
                    min="0"
                    value={editPallets}
                    onChange={(e) => setEditPallets(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold text-center text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Lastros:</label>
                  <input
                    type="number"
                    min="0"
                    value={editLastros}
                    onChange={(e) => setEditLastros(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold text-center text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Caixas:</label>
                  <input
                    type="number"
                    min="0"
                    value={editCaixas}
                    onChange={(e) => setEditCaixas(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold text-center text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Unidades soltas:</label>
                  <input
                    type="number"
                    min="0"
                    value={editUnidades}
                    onChange={(e) => setEditUnidades(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2 border border-slate-300 rounded-lg font-mono font-bold text-center text-sm"
                  />
                </div>
              </div>

              {/* Preview recalculado */}
              <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center">
                <span className="text-[11px] text-slate-500 font-bold block">
                  NOVO TOTAL CALCULADO:
                </span>
                <span className="text-lg font-black text-emerald-700 font-mono">
                  {Math.floor(
                    ((editPallets * (editingItem.caixasPorPallet || 0) +
                      editLastros * (editingItem.caixasPorLastro || 0) +
                      editCaixas) *
                      (editingItem.fatorCx || 1) +
                      editUnidades) /
                      (editingItem.fatorCx || 1)
                  )}{' '}
                  cx +{' '}
                  {((editPallets * (editingItem.caixasPorPallet || 0) +
                    editLastros * (editingItem.caixasPorLastro || 0) +
                    editCaixas) *
                    (editingItem.fatorCx || 1) +
                    editUnidades) %
                    (editingItem.fatorCx || 1)}{' '}
                  un
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-xs"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
