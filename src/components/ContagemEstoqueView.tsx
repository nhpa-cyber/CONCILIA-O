import React, { useState, useMemo, useEffect, useRef } from 'react';
import { RawData, ResRow, ContagemEstoqueItem, CalculatedProduct } from '../data/types';
import { getProductPalletSpec, calculateCountTotals, saveProductPalletConfig, ProductPalletConfig } from '../utils/palletSpec';
import { 
  Boxes, 
  Layers, 
  Package, 
  Box, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Edit3, 
  Download, 
  Copy, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  Check, 
  FileSpreadsheet, 
  Sliders, 
  ArrowRight,
  Info
} from 'lucide-react';

interface ContagemEstoqueViewProps {
  data: RawData;
  calculatedProducts: CalculatedProduct[];
  onSaveContagem: (item: ContagemEstoqueItem) => void;
  onUpdateContagem: (item: ContagemEstoqueItem) => void;
  onDeleteContagem: (id: string) => void;
  onClearAllContagens: () => void;
  onAplicarContagensAoEstoque?: (items: ContagemEstoqueItem[]) => void;
}

export const ContagemEstoqueView: React.FC<ContagemEstoqueViewProps> = ({
  data,
  calculatedProducts,
  onSaveContagem,
  onUpdateContagem,
  onDeleteContagem,
  onClearAllContagens,
  onAplicarContagensAoEstoque,
}) => {
  // Lista unificada de produtos disponíveis no sistema
  const allAvailableProducts = useMemo(() => {
    const list: { cod: number; desc: string; tipo: string; fatorCx: number; dispPromaxUnid?: number }[] = [];
    const seen = new Set<number>();

    // 1. Dos calculados (mais recente)
    calculatedProducts.forEach((p) => {
      if (!seen.has(p.c)) {
        seen.add(p.c);
        list.push({
          cod: p.c,
          desc: p.d || `PRODUTO ${p.c}`,
          tipo: p.t || 'cx',
          fatorCx: p.V > 0 ? p.V : 1,
          dispPromaxUnid: p.G,
        });
      }
    });

    // 2. Do estoque central
    if (data.ec?.r) {
      data.ec.r.forEach((row) => {
        const cod = Number(row[3]);
        if (cod && !seen.has(cod)) {
          seen.add(cod);
          list.push({
            cod,
            desc: String(row[4] || `PRODUTO ${cod}`),
            tipo: String(row[5] || 'cx'),
            fatorCx: 1,
          });
        }
      });
    }

    return list.sort((a, b) => a.cod - b.cod);
  }, [calculatedProducts, data.ec]);

  // Estados do formulário de contagem vertical
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<{
    cod: number;
    desc: string;
    tipo: string;
    fatorCx: number;
    dispPromaxUnid?: number;
  } | null>(null);

  const [pallets, setPallets] = useState<number>(0);
  const [lastros, setLastros] = useState<number>(0);
  const [caixas, setCaixas] = useState<number>(0);
  const [unidades, setUnidades] = useState<number>(0);
  const [observacao, setObservacao] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Modal / Edição de Especificação do Pallet (Lastro / Pallet)
  const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
  const [customFatorCx, setCustomFatorCx] = useState<number>(1);
  const [customCaixasPorLastro, setCustomCaixasPorLastro] = useState<number>(10);
  const [customCaixasPorPallet, setCustomCaixasPorPallet] = useState<number>(60);

  // Estados da Tela do que foi contado
  const [filterQuery, setFilterQuery] = useState('');
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'warn' } | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmApplyOpen, setConfirmApplyOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Especificação atual do produto selecionado
  const currentSpec: ProductPalletConfig = useMemo(() => {
    if (!selectedProduct) {
      return { fatorCx: 1, caixasPorLastro: 10, caixasPorPallet: 60, lastrosPorPallet: 6 };
    }
    return getProductPalletSpec(selectedProduct.cod, selectedProduct.desc, selectedProduct.fatorCx);
  }, [selectedProduct]);

  // Quando seleciona produto ou abre modal de spec, inicializa os campos de spec
  useEffect(() => {
    if (selectedProduct) {
      setCustomFatorCx(currentSpec.fatorCx);
      setCustomCaixasPorLastro(currentSpec.caixasPorLastro);
      setCustomCaixasPorPallet(currentSpec.caixasPorPallet);
    }
  }, [selectedProduct, currentSpec]);

  // Selecionar o primeiro produto automaticamente se nenhum estiver selecionado
  useEffect(() => {
    if (!selectedProduct && allAvailableProducts.length > 0) {
      setSelectedProduct(allAvailableProducts[0]);
    }
  }, [allAvailableProducts, selectedProduct]);

  // Lista de produtos filtrados para o dropdown de busca
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allAvailableProducts.filter(
      (p) => p.cod.toString().includes(q) || p.desc.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [allAvailableProducts, searchQuery]);

  // Cálculo em tempo real dos totais
  const countTotals = useMemo(() => {
    return calculateCountTotals(pallets, lastros, caixas, unidades, currentSpec);
  }, [pallets, lastros, caixas, unidades, currentSpec]);

  // Informações de saldo do sistema do produto atual (se cadastrado)
  const systemProductInfo = useMemo(() => {
    if (!selectedProduct) return null;
    const calc = calculatedProducts.find((p) => p.c === selectedProduct.cod);
    if (!calc) return null;

    const fator = currentSpec.fatorCx > 0 ? currentSpec.fatorCx : 1;
    const dispUnid = calc.G || 0;
    const dispCxInteiras = Math.floor(dispUnid / fator);
    const dispUnidResto = dispUnid % fator;
    const dispCxFormatado = `${dispCxInteiras.toLocaleString('pt-BR')}/${dispUnidResto.toString().padStart(2, '0')}`;

    // Diferença estimada (Contado - Disponível Promax)
    const difUnid = countTotals.totalUnidades - dispUnid;
    const difCxInteiras = Math.floor(Math.abs(difUnid) / fator);
    const difUnidResto = Math.abs(difUnid) % fator;
    const sinal = difUnid > 0 ? '+' : difUnid < 0 ? '-' : '';
    const difCxFormatado = `${sinal}${difCxInteiras}/${difUnidResto.toString().padStart(2, '0')}`;

    return {
      dispUnid,
      dispCxFormatado,
      difUnid,
      difCxFormatado,
      status: difUnid === 0 ? 'bateu' : difUnid > 0 ? 'sobra' : 'falta',
    };
  }, [selectedProduct, calculatedProducts, currentSpec, countTotals]);

  // Notificação com auto-dismiss
  const showToast = (text: string, type: 'success' | 'warn' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Salvar contagem
  const handleSave = () => {
    if (!selectedProduct) {
      showToast('Selecione um produto para registrar a contagem!', 'warn');
      return;
    }

    if (countTotals.totalUnidades === 0 && pallets === 0 && lastros === 0 && caixas === 0 && unidades === 0) {
      if (!window.confirm(`A contagem de ${selectedProduct.desc} está zerada (0). Deseja registrar produto zerado no estoque?`)) {
        return;
      }
    }

    const now = new Date();
    const dataHoraStr = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const newItem: ContagemEstoqueItem = {
      id: editingId || `cnt_${Date.now()}_${selectedProduct.cod}`,
      cod: selectedProduct.cod,
      desc: selectedProduct.desc,
      tipo: selectedProduct.tipo,
      fatorCx: currentSpec.fatorCx,
      caixasPorLastro: currentSpec.caixasPorLastro,
      caixasPorPallet: currentSpec.caixasPorPallet,
      pallets,
      lastros,
      caixas,
      unidades,
      totalCaixasFormatado: countTotals.formatoFormatado,
      totalCaixasDecimal: countTotals.totalCaixasDecimal,
      totalUnidades: countTotals.totalUnidades,
      saldoSistemaCxFormatado: systemProductInfo?.dispCxFormatado,
      saldoSistemaUnid: systemProductInfo?.dispUnid,
      divergenciaCx: systemProductInfo ? systemProductInfo.difUnid / (currentSpec.fatorCx || 1) : undefined,
      divergenciaFormatada: systemProductInfo?.difCxFormatado,
      dataHora: dataHoraStr,
      timestamp: Date.now(),
      observacao: observacao.trim() || undefined,
    };

    if (editingId) {
      onUpdateContagem(newItem);
      showToast(`✓ Contagem do produto #${selectedProduct.cod} atualizada com sucesso!`);
      setEditingId(null);
    } else {
      onSaveContagem(newItem);
      showToast(`✓ Contagem do produto #${selectedProduct.cod} registrada: ${countTotals.formatoFormatado} cx!`);
    }

    // Limpar campos de contagem para o próximo produto
    setPallets(0);
    setLastros(0);
    setCaixas(0);
    setUnidades(0);
    setObservacao('');
    setSearchQuery('');
  };

  // Carregar item para edição
  const handleEdit = (item: ContagemEstoqueItem) => {
    const prod = allAvailableProducts.find((p) => p.cod === item.cod) || {
      cod: item.cod,
      desc: item.desc,
      tipo: item.tipo,
      fatorCx: item.fatorCx,
    };
    setSelectedProduct(prod);
    setPallets(item.pallets);
    setLastros(item.lastros);
    setCaixas(item.caixas);
    setUnidades(item.unidades);
    setObservacao(item.observacao || '');
    setEditingId(item.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Salvar configuração customizada do produto
  const handleSaveCustomSpec = () => {
    if (!selectedProduct) return;
    saveProductPalletConfig(selectedProduct.cod, {
      fatorCx: customFatorCx,
      caixasPorLastro: customCaixasPorLastro,
      caixasPorPallet: customCaixasPorPallet,
    });
    setIsSpecModalOpen(false);
    showToast(`✓ Padrão de pallet do produto #${selectedProduct.cod} salvo!`);
  };

  // Lista de contagens registradas
  const contagens: ContagemEstoqueItem[] = data.contagensEstoque || [];

  // Filtragem da tela do que foi contado
  const filteredContagens = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return contagens;
    return contagens.filter(
      (c) => c.cod.toString().includes(q) || c.desc.toLowerCase().includes(q)
    );
  }, [contagens, filterQuery]);

  // Métricas agregadas da contagem realizada
  const summaryContagem = useMemo(() => {
    let totPallets = 0;
    let totLastros = 0;
    let totCaixasSoltas = 0;
    let totUnidades = 0;

    contagens.forEach((c) => {
      totPallets += c.pallets;
      totLastros += c.lastros;
      totCaixasSoltas += c.caixas;
      totUnidades += c.totalUnidades;
    });

    return {
      totalItens: contagens.length,
      totPallets,
      totLastros,
      totCaixasSoltas,
      totUnidades,
    };
  }, [contagens]);

  // Exportar para CSV / Excel
  const handleExportCsv = () => {
    if (contagens.length === 0) {
      showToast('Nenhuma contagem registrada para exportar!', 'warn');
      return;
    }

    const headers = [
      'Código',
      'Descrição',
      'Unidade',
      'Pallets (P)',
      'Lastros (L)',
      'Caixas Soltas (C)',
      'Unid Soltas (U)',
      'Total Caixas/Unid',
      'Total Unidades',
      'Saldo Sistema Promax',
      'Divergência Estimada',
      'Data/Hora',
      'Observação',
    ];

    const rows = contagens.map((c) => [
      c.cod,
      `"${c.desc.replace(/"/g, '""')}"`,
      c.tipo,
      c.pallets,
      c.lastros,
      c.caixas,
      c.unidades,
      `"${c.totalCaixasFormatado}"`,
      c.totalUnidades,
      `"${c.saldoSistemaCxFormatado || '-'}"`,
      `"${c.divergenciaFormatada || '-'}"`,
      `"${c.dataHora}"`,
      `"${(c.observacao || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Contagem_Estoque_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('✓ Arquivo de contagem exportado com sucesso!');
  };

  // Copiar resumo formatado para o clipboard
  const handleCopyResumo = () => {
    if (contagens.length === 0) {
      showToast('Nenhuma contagem para copiar!', 'warn');
      return;
    }

    let text = `📦 RESUMO DA CONTAGEM DE ESTOQUE - ${new Date().toLocaleDateString('pt-BR')}\n`;
    text += `Itens Contados: ${contagens.length} | Total Pallets: ${summaryContagem.totPallets} | Total Unidades: ${summaryContagem.totUnidades.toLocaleString('pt-BR')}\n`;
    text += `--------------------------------------------------------\n`;
    contagens.forEach((c, idx) => {
      text += `${idx + 1}. [${c.cod}] ${c.desc}\n`;
      text += `   ➔ ${c.pallets} Pallets | ${c.lastros} Lastros | ${c.caixas} Cx | ${c.unidades} Un\n`;
      text += `   ➔ TOTAL: ${c.totalCaixasFormatado} cx (${c.totalUnidades.toLocaleString('pt-BR')} un)`;
      if (c.divergenciaFormatada) {
        text += ` | Dif: ${c.divergenciaFormatada}`;
      }
      text += `\n`;
    });

    navigator.clipboard.writeText(text);
    showToast('✓ Resumo da contagem copiado para a área de transferência!');
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-4 space-y-6">
      {/* Toast Notificação */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-semibold flex items-center gap-2 transition-all ${
            notification.type === 'warn' ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {notification.type === 'warn' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Cabeçalho da Aba */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white p-5 rounded-xl shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Boxes className="w-7 h-7 text-white" />
            <h1 className="text-2xl font-black tracking-tight uppercase">Contagem de Estoque</h1>
            <span className="bg-black/30 text-amber-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
              Pallet / Lastro / Caixa / Unidades
            </span>
          </div>
          <p className="text-amber-100 text-xs mt-1">
            Lance a contagem física com facilidade selecionando o produto e inserindo as quantidades na vertical.
          </p>
        </div>

        {/* Resumo Rápido no Topo */}
        <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-lg border border-white/10 text-xs">
          <div className="text-center">
            <span className="block text-amber-200 font-bold uppercase text-[10px]">Itens Contados</span>
            <span className="text-lg font-black">{summaryContagem.totalItens}</span>
          </div>
          <div className="w-px h-7 bg-white/20" />
          <div className="text-center">
            <span className="block text-amber-200 font-bold uppercase text-[10px]">Pallets Totais</span>
            <span className="text-lg font-black">{summaryContagem.totPallets}</span>
          </div>
          <div className="w-px h-7 bg-white/20" />
          <div className="text-center">
            <span className="block text-amber-200 font-bold uppercase text-[10px]">Total Unidades</span>
            <span className="text-lg font-black">{summaryContagem.totUnidades.toLocaleString('pt-BR')}</span>
          </div>
        </div>
      </div>

      {/* Grid Principal: Formulário Vertical à esquerda / Tela do que foi contado à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ============================================================== */}
        {/* COLUNA ESQUERDA: FORMULÁRIO VERTICAL DE CONTAGEM (5 Colunas)  */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-5">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <h2 className="font-bold text-slate-800 text-base">
                {editingId ? 'Editar Contagem do Produto' : 'Nova Contagem Rápida'}
              </h2>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setPallets(0);
                  setLastros(0);
                  setCaixas(0);
                  setUnidades(0);
                }}
                className="text-xs text-rose-600 hover:underline font-semibold"
              >
                Cancelar Edição
              </button>
            )}
          </div>

          {/* 1. SELEÇÃO DO PRODUTO (CÓDIGO OU DESCRIÇÃO) */}
          <div className="space-y-1.5 relative">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
              1. Selecionar Produto (Código ou Descrição)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Digite o código ou nome do produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>

            {/* Dropdown de sugestões rápidas */}
            {searchResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.cod}
                    type="button"
                    onClick={() => {
                      setSelectedProduct(p);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 flex items-center justify-between border-b border-slate-100 last:border-b-0 transition-colors"
                  >
                    <div>
                      <span className="font-black text-amber-700 mr-2 bg-amber-100 px-1.5 py-0.5 rounded">
                        #{p.cod}
                      </span>
                      <span className="font-semibold text-slate-800">{p.desc}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Fator: {p.fatorCx} un/cx
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* CARD DO PRODUTO ATUAL SELECIONADO */}
          {selectedProduct && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-block bg-slate-900 text-white font-mono text-xs px-2 py-0.5 rounded font-bold">
                    CÓD: {selectedProduct.cod}
                  </span>
                  <h3 className="font-bold text-slate-900 text-sm mt-1 leading-snug">
                    {selectedProduct.desc}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSpecModalOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] bg-white border border-slate-300 text-slate-700 hover:text-amber-700 hover:border-amber-400 px-2 py-1 rounded shadow-2xs font-semibold whitespace-nowrap transition-colors"
                  title="Ajustar quantidade de caixas por Pallet ou por Lastro deste produto"
                >
                  <Sliders size={12} />
                  <span>Padrão Pallet</span>
                </button>
              </div>

              {/* Informações de Paletização do Produto */}
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">1 Caixa Tem</span>
                  <span className="text-xs font-black text-slate-800">{currentSpec.fatorCx} un</span>
                </div>
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">1 Lastro Tem</span>
                  <span className="text-xs font-black text-slate-800">{currentSpec.caixasPorLastro} cx</span>
                </div>
                <div className="bg-white p-1.5 rounded border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase">1 Pallet Tem</span>
                  <span className="text-xs font-black text-amber-700">{currentSpec.caixasPorPallet} cx</span>
                </div>
              </div>

              {/* Saldo no Sistema Promax (se disponível) */}
              {systemProductInfo && (
                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                  <span className="text-slate-600 font-medium">Disponível no Sistema:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {systemProductInfo.dispCxFormatado} cx ({systemProductInfo.dispUnid.toLocaleString('pt-BR')} un)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 2. CAMPOS NA VERTICAL: PALLET, LASTRO, CAIXA, UNIDADES */}
          <div className="space-y-3.5 pt-1">
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center justify-between">
              <span>2. Inserir Quantidades (Na Vertical)</span>
              <button
                type="button"
                onClick={() => {
                  setPallets(0);
                  setLastros(0);
                  setCaixas(0);
                  setUnidades(0);
                }}
                className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold"
              >
                Zerar Campos
              </button>
            </div>

            {/* CAMPO 1: PALLET */}
            <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-amber-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                    P
                  </span>
                  <div>
                    <span className="font-black text-slate-800 text-xs uppercase">Pallet(s) Fechado(s)</span>
                    <span className="block text-[10px] text-amber-800 font-medium">
                      x {currentSpec.caixasPorPallet} cx por pallet ({countTotals.caixasDePallets} cx)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPallets((v) => Math.max(0, v - 1))}
                    className="w-7 h-7 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={pallets === 0 ? '' : pallets}
                    placeholder="0"
                    onChange={(e) => setPallets(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 h-7 text-center font-black text-sm border border-amber-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={() => setPallets((v) => v + 1)}
                    className="w-7 h-7 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1 pl-8">
                {[1, 2, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPallets((v) => v + num)}
                    className="text-[10px] font-bold bg-white text-amber-900 border border-amber-300 hover:bg-amber-100 px-2 py-0.5 rounded"
                  >
                    +{num}
                  </button>
                ))}
              </div>
            </div>

            {/* CAMPO 2: LASTRO */}
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                    L
                  </span>
                  <div>
                    <span className="font-black text-slate-800 text-xs uppercase">Lastro(s) / Camada(s)</span>
                    <span className="block text-[10px] text-indigo-700 font-medium">
                      x {currentSpec.caixasPorLastro} cx por lastro ({countTotals.caixasDeLastros} cx)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setLastros((v) => Math.max(0, v - 1))}
                    className="w-7 h-7 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={lastros === 0 ? '' : lastros}
                    placeholder="0"
                    onChange={(e) => setLastros(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 h-7 text-center font-black text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setLastros((v) => v + 1)}
                    className="w-7 h-7 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1 pl-8">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setLastros((v) => v + num)}
                    className="text-[10px] font-bold bg-white text-indigo-900 border border-indigo-200 hover:bg-indigo-50 px-2 py-0.5 rounded"
                  >
                    +{num}
                  </button>
                ))}
              </div>
            </div>

            {/* CAMPO 3: CAIXA */}
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                    C
                  </span>
                  <div>
                    <span className="font-black text-slate-800 text-xs uppercase">Caixa(s) Solta(s)</span>
                    <span className="block text-[10px] text-emerald-700 font-medium">
                      Caixas inteiras normais soltas
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCaixas((v) => Math.max(0, v - 1))}
                    className="w-7 h-7 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={caixas === 0 ? '' : caixas}
                    placeholder="0"
                    onChange={(e) => setCaixas(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 h-7 text-center font-black text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setCaixas((v) => v + 1)}
                    className="w-7 h-7 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1 pl-8">
                {[1, 5, 10, 20].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setCaixas((v) => v + num)}
                    className="text-[10px] font-bold bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-50 px-2 py-0.5 rounded"
                  >
                    +{num}
                  </button>
                ))}
              </div>
            </div>

            {/* CAMPO 4: UNIDADES */}
            <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded bg-sky-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                    U
                  </span>
                  <div>
                    <span className="font-black text-slate-800 text-xs uppercase">Unidade(s) Solta(s)</span>
                    <span className="block text-[10px] text-sky-700 font-medium">
                      Latas / garrafas avulsas (fator {currentSpec.fatorCx} un/cx)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setUnidades((v) => Math.max(0, v - 1))}
                    className="w-7 h-7 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Minus size={13} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={unidades === 0 ? '' : unidades}
                    placeholder="0"
                    onChange={(e) => setUnidades(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-16 h-7 text-center font-black text-sm border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setUnidades((v) => v + 1)}
                    className="w-7 h-7 bg-white border border-slate-300 rounded font-bold hover:bg-slate-100 flex items-center justify-center text-slate-700"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 pt-1 pl-8">
                {[1, 2, 6, 12].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setUnidades((v) => v + num)}
                    className="text-[10px] font-bold bg-white text-sky-900 border border-sky-200 hover:bg-sky-50 px-2 py-0.5 rounded"
                  >
                    +{num}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Observação opcional */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Observação (opcional - Ex: Pallet na rua A, avaria separada, etc.)
            </label>
            <input
              type="text"
              placeholder="Ex: Rua 3, posição 12..."
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* 3. CARD DE CÁLCULO TOTAL EM TEMPO REAL */}
          <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase tracking-wider">
              <span>Resultado do Cálculo</span>
              <span>Em Tempo Real</span>
            </div>

            {/* Decomposição */}
            <div className="text-[11px] text-slate-300 space-y-1 font-mono border-b border-slate-800 pb-2">
              <div className="flex justify-between">
                <span>{pallets} Pallet(s) x {currentSpec.caixasPorPallet} cx:</span>
                <span className="text-white font-bold">{countTotals.caixasDePallets} cx</span>
              </div>
              <div className="flex justify-between">
                <span>{lastros} Lastro(s) x {currentSpec.caixasPorLastro} cx:</span>
                <span className="text-white font-bold">{countTotals.caixasDeLastros} cx</span>
              </div>
              <div className="flex justify-between">
                <span>{caixas} Caixa(s) solta(s):</span>
                <span className="text-white font-bold">{caixas} cx</span>
              </div>
              <div className="flex justify-between">
                <span>{unidades} Unidade(s) solta(s):</span>
                <span className="text-white font-bold">
                  {Math.floor(unidades / currentSpec.fatorCx)} cx + {unidades % currentSpec.fatorCx} un
                </span>
              </div>
            </div>

            {/* Total Grande */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="block text-[11px] text-slate-400 font-bold uppercase">Total em Caixas</span>
                <span className="text-2xl font-black text-amber-400 tracking-tight">
                  {countTotals.formatoFormatado} <span className="text-xs text-slate-300 font-normal">cx</span>
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-slate-400 font-bold uppercase">Total em Unidades</span>
                <span className="text-lg font-black text-white">
                  {countTotals.totalUnidades.toLocaleString('pt-BR')} <span className="text-xs text-slate-400 font-normal">un</span>
                </span>
              </div>
            </div>

            {/* Comparativo de Divergência com Saldo do Sistema */}
            {systemProductInfo && (
              <div className={`p-2.5 rounded-lg text-xs font-semibold flex items-center justify-between ${
                systemProductInfo.status === 'bateu'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                  : systemProductInfo.status === 'sobra'
                  ? 'bg-blue-950/80 text-blue-300 border border-blue-700'
                  : 'bg-rose-950/80 text-rose-300 border border-rose-700'
              }`}>
                <div className="flex items-center gap-1.5">
                  {systemProductInfo.status === 'bateu' ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <AlertTriangle size={16} className={systemProductInfo.status === 'sobra' ? 'text-blue-400' : 'text-rose-400'} />
                  )}
                  <span>
                    {systemProductInfo.status === 'bateu' && 'Estoque físico bateu com o sistema!'}
                    {systemProductInfo.status === 'sobra' && 'Sobra apurada em relação ao sistema:'}
                    {systemProductInfo.status === 'falta' && 'Falta apurada em relação ao sistema:'}
                  </span>
                </div>
                <span className="font-mono font-bold text-sm">
                  {systemProductInfo.difCxFormatado} cx
                </span>
              </div>
            )}

            {/* BOTÃO SALVAR / REGISTRAR CONTAGEM */}
            <button
              type="button"
              onClick={handleSave}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-black text-sm uppercase tracking-wide rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Check size={18} />
              <span>{editingId ? 'Confirmar Edição' : 'Salvar Contagem Deste Produto'}</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* COLUNA DIREITA: "TELA DO QUE FOI CONTADO" (7 Colunas)          */}
        {/* ============================================================== */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <h2 className="font-black text-slate-800 text-base uppercase tracking-tight">
                  Tela do Que Foi Contado
                </h2>
                <span className="bg-slate-100 text-slate-700 font-mono text-xs px-2 py-0.5 rounded font-bold">
                  {contagens.length} itens
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Histórico e conferência detalhada dos produtos contados nesta rodada.
              </p>
            </div>

            {/* Ações da Tela do que foi contado */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyResumo}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs transition-colors"
                title="Copiar resumo para área de transferência"
              >
                <Copy size={13} />
                <span>Copiar</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-xs shadow-2xs transition-colors"
                title="Exportar planilha Excel/CSV"
              >
                <FileSpreadsheet size={13} />
                <span>Exportar CSV</span>
              </button>

              {contagens.length > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded text-xs transition-colors"
                  title="Zerar todas as contagens"
                >
                  <Trash2 size={13} />
                  <span>Limpar</span>
                </button>
              )}
            </div>
          </div>

          {/* Busca na lista de contados */}
          {contagens.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrar por código ou descrição entre os contados..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Botão de Integração com o Estoque Físico da Base (Opcional) */}
              {onAplicarContagensAoEstoque && (
                <button
                  type="button"
                  onClick={() => setConfirmApplyOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-2xs transition-colors whitespace-nowrap"
                  title="Aplicar todas as contagens físicas apuradas diretamente ao Inventário Físico do Dashboard"
                >
                  <Boxes size={14} />
                  <span>Aplicar ao Inventário</span>
                </button>
              )}
            </div>
          )}

          {/* TABELA COM O QUE FOI CONTADO */}
          {contagens.length === 0 ? (
            <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                <Boxes size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 text-sm">Nenhum produto contado ainda</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Utilize o formulário vertical à esquerda para selecionar o produto e lançar Pallets, Lastros, Caixas e Unidades.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Código & Descrição</th>
                    <th className="py-2.5 px-2 text-center" title="Pallets Fechados">P</th>
                    <th className="py-2.5 px-2 text-center" title="Lastros (Camadas)">L</th>
                    <th className="py-2.5 px-2 text-center" title="Caixas Soltas">C</th>
                    <th className="py-2.5 px-2 text-center" title="Unidades Soltas">U</th>
                    <th className="py-2.5 px-3 text-right">Total Contado</th>
                    <th className="py-2.5 px-3 text-center">Diferença / Status</th>
                    <th className="py-2.5 px-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredContagens.map((item, idx) => {
                    const isSelected = selectedProduct?.cod === item.cod;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-amber-50/60 transition-colors ${
                          isSelected ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        {/* Índice */}
                        <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Produto */}
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="font-mono text-amber-800 bg-amber-100 px-1 py-0.5 rounded text-[10px]">
                              #{item.cod}
                            </span>
                            <span className="truncate max-w-[220px]" title={item.desc}>
                              {item.desc}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span>{item.dataHora}</span>
                            {item.observacao && (
                              <span className="text-amber-700 font-semibold truncate max-w-[150px]" title={item.observacao}>
                                • {item.observacao}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* P, L, C, U */}
                        <td className="py-2.5 px-2 text-center font-bold text-amber-700 font-mono">
                          {item.pallets > 0 ? item.pallets : '-'}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-indigo-700 font-mono">
                          {item.lastros > 0 ? item.lastros : '-'}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-emerald-700 font-mono">
                          {item.caixas > 0 ? item.caixas : '-'}
                        </td>
                        <td className="py-2.5 px-2 text-center font-bold text-sky-700 font-mono">
                          {item.unidades > 0 ? item.unidades : '-'}
                        </td>

                        {/* Total Contado */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="font-black text-slate-900 font-mono text-xs">
                            {item.totalCaixasFormatado} <span className="text-[10px] font-normal text-slate-500">cx</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.totalUnidades.toLocaleString('pt-BR')} un
                          </div>
                        </td>

                        {/* Comparativo com o Sistema */}
                        <td className="py-2.5 px-3 text-center">
                          {item.divergenciaFormatada ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                                item.divergenciaFormatada === '0/00' || item.divergenciaFormatada === '+0/00'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.divergenciaFormatada.startsWith('+')
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                              title={
                                item.saldoSistemaCxFormatado
                                  ? `Sistema: ${item.saldoSistemaCxFormatado} cx | Dif: ${item.divergenciaFormatada}`
                                  : undefined
                              }
                            >
                              {item.divergenciaFormatada === '0/00' || item.divergenciaFormatada === '+0/00'
                                ? '✓ Bateu'
                                : `${item.divergenciaFormatada} cx`}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>

                        {/* Ações */}
                        <td className="py-2.5 px-2 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEdit(item)}
                              className="p-1 text-slate-500 hover:text-amber-600 rounded hover:bg-slate-100"
                              title="Editar esta contagem"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteContagem(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100"
                              title="Excluir item da contagem"
                            >
                              <Trash2 size={13} />
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
      </div>

      {/* ============================================================== */}
      {/* MODAL: AJUSTAR PADRÃO DO PALLET / LASTRO DO PRODUTO            */}
      {/* ============================================================== */}
      {isSpecModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-800 text-base">
                  Padrão de Paletização
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSpecModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Ajuste as quantidades padrão de caixas por lastro e por pallet para o produto:
              <br />
              <strong className="text-slate-900">#{selectedProduct.cod} - {selectedProduct.desc}</strong>
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Unidades por Caixa (Fator Cx)
                </label>
                <input
                  type="number"
                  min="1"
                  value={customFatorCx}
                  onChange={(e) => setCustomFatorCx(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Caixas por Lastro (Camada)
                </label>
                <input
                  type="number"
                  min="1"
                  value={customCaixasPorLastro}
                  onChange={(e) => setCustomCaixasPorLastro(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Caixas por Pallet Fechado
                </label>
                <input
                  type="number"
                  min="1"
                  value={customCaixasPorPallet}
                  onChange={(e) => setCustomCaixasPorPallet(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-sm border border-slate-300 rounded px-3 py-2 font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSpecModalOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCustomSpec}
                className="px-4 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded shadow-xs"
              >
                Salvar Configuração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR LIMPEZA TOTAL */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 size={20} />
              <h3 className="font-bold text-slate-900 text-base">Limpar Todas as Contagens?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Esta ação excluirá todos os {contagens.length} itens registrados nesta rodada de contagem de estoque. Deseja continuar?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearAllContagens();
                  setConfirmClearOpen(false);
                  showToast('✓ Contagens limpas com sucesso!');
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-xs"
              >
                Sim, Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR APLICAÇÃO AO ESTOQUE FÍSICO */}
      {confirmApplyOpen && onAplicarContagensAoEstoque && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-700">
              <Boxes size={22} />
              <h3 className="font-bold text-slate-900 text-base">Aplicar Contagem ao Inventário?</h3>
            </div>
            <p className="text-xs text-slate-600">
              Deseja atualizar a contagem física (Coluna "b" de Inventário Físico do Dashboard e Resumo) com os 
              <strong> {contagens.length} produtos</strong> contados nesta tela?
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-900">
              ℹ️ O sistema atualizará os saldos físicos para conferência de divergências em tempo real.
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmApplyOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onAplicarContagensAoEstoque(contagens);
                  setConfirmApplyOpen(false);
                  showToast('✓ Contagem aplicada ao inventário físico do sistema!');
                }}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded shadow-xs"
              >
                Confirmar e Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
