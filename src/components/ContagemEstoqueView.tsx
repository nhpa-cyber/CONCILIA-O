import React, { useState, useMemo, useEffect, useRef } from 'react';
import { RawData, ContagemEstoqueItem, CalculatedProduct } from '../data/types';
import { getProductPalletSpec } from '../utils/palletSpec';
import { BASE_PALLET_PRODUCTS } from '../data/palletProducts';
import { getItemDateString } from '../utils/contagemUtils';

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

interface CountRecord {
  id?: string;
  c: number; // cod
  u: number; // total de unidades
  pallets: number;
  lastros: number;
  caixas: number;
  unidades: number;
  dataHora?: string;
  timestamp?: number;
}

interface ContagemEstoqueViewProps {
  data: RawData;
  calculatedProducts: CalculatedProduct[];
  onSaveContagem: (item: ContagemEstoqueItem) => void;
  onUpdateContagem: (item: ContagemEstoqueItem) => void;
  onDeleteContagem: (id: string) => void;
  onClearAllContagens: () => void;
  onAplicarContagensAoEstoque?: (items: ContagemEstoqueItem[]) => void;
  onNavigateToContagemDia?: () => void;
}

export const ContagemEstoqueView: React.FC<ContagemEstoqueViewProps> = ({
  data,
  calculatedProducts,
  onSaveContagem,
  onUpdateContagem,
  onDeleteContagem,
  onNavigateToContagemDia,
}) => {
  // Lista unificada de produtos (Base Oficial D + produtos cadastrados no sistema)
  const productList = useMemo(() => {
    const map = new Map<number, [number, string, number, number, number]>();

    // 1. Inicia com a base padrão ambev/distribuição
    BASE_PALLET_PRODUCTS.forEach((p) => {
      map.set(p[0], p);
    });

    // 2. Adiciona/completa produtos de calculatedProducts se não estiverem na base
    calculatedProducts.forEach((p) => {
      if (!map.has(p.c)) {
        const spec = getProductPalletSpec(p.c, p.d, p.V > 0 ? p.V : 1);
        map.set(p.c, [p.c, p.d || `PRODUTO ${p.c}`, spec.caixasPorPallet, spec.caixasPorLastro, spec.fatorCx]);
      }
    });

    // 3. Adiciona produtos do estoque central se não estiverem presentes
    if (data.ec?.r) {
      data.ec.r.forEach((row) => {
        const cod = Number(row[3]);
        if (cod && !map.has(cod)) {
          const desc = String(row[4] || `PRODUTO ${cod}`);
          const spec = getProductPalletSpec(cod, desc, 1);
          map.set(cod, [cod, desc, spec.caixasPorPallet, spec.caixasPorLastro, spec.fatorCx]);
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => a[0] - b[0]);
  }, [calculatedProducts, data.ec]);

  // Lista dos registros de contagem (mais recentes primeiro)
  const [historyItems, setHistoryItems] = useState<CountRecord[]>(() => {
    if (data.contagensEstoque && data.contagensEstoque.length > 0) {
      return [...data.contagensEstoque]
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .map((it) => ({
          id: it.id,
          c: it.cod,
          u: it.totalUnidades,
          pallets: it.pallets || 0,
          lastros: it.lastros || 0,
          caixas: it.caixas || 0,
          unidades: it.unidades || 0,
          dataHora: it.dataHora,
          timestamp: it.timestamp,
        }));
    }
    try {
      const raw = localStorage.getItem('cnt');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Sincroniza com as alterações em data.contagensEstoque
  useEffect(() => {
    if (data.contagensEstoque) {
      setHistoryItems(
        [...data.contagensEstoque]
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
          .map((it) => ({
            id: it.id,
            c: it.cod,
            u: it.totalUnidades,
            pallets: it.pallets || 0,
            lastros: it.lastros || 0,
            caixas: it.caixas || 0,
            unidades: it.unidades || 0,
            dataHora: it.dataHora,
            timestamp: it.timestamp,
          }))
      );
    }
  }, [data.contagensEstoque]);

  // Salvar no localStorage
  const persistItems = (newItems: CountRecord[]) => {
    setHistoryItems(newItems);
    try {
      localStorage.setItem('cnt', JSON.stringify(newItems));
    } catch {
      // Ignora erro de storage
    }
  };

  // Estados de Busca e Seleção
  const [query, setQuery] = useState('');
  const [isNumericMode, setIsNumericMode] = useState(true);
  const [suggestions, setSuggestions] = useState<[number, string, number, number, number][]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Produto Selecionado Atualmente
  const [curProduct, setCurProduct] = useState<[number, string, number, number, number] | null>(null);

  // Quantidades digitadas
  const [n0, setN0] = useState(''); // Pallet
  const [n1, setN1] = useState(''); // Lastro
  const [n2, setN2] = useState(''); // Caixa
  const [n3, setN3] = useState(''); // Unidade

  // Estado de Edição de um item existente
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  // Mensagem de feedback
  const [msg, setMsg] = useState('');

  // Refs para focar inputs
  const queryInputRef = useRef<HTMLInputElement>(null);
  const n0InputRef = useRef<HTMLInputElement>(null);
  const n1InputRef = useRef<HTMLInputElement>(null);
  const n2InputRef = useRef<HTMLInputElement>(null);
  const n3InputRef = useRef<HTMLInputElement>(null);

  // Buscar sugestões ao digitar
  const handleQueryChange = (val: string) => {
    setQuery(val);
    const t = norm(val.trim());
    if (!t) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const words = t.split(/\s+/);
    let hits = productList.filter((p) => {
      const s = p[0] + ' ' + norm(p[1]);
      return words.every((w) => s.includes(w));
    });

    hits.sort((a, b) => (String(b[0]) === t ? 1 : 0) - (String(a[0]) === t ? 1 : 0));
    hits = hits.slice(0, 10);
    setSuggestions(hits);
    setSelectedIndex(0);
    setShowSuggestions(true);
  };

  // Selecionar um produto
  const pick = (p: [number, string, number, number, number]) => {
    setCurProduct(p);
    setShowSuggestions(false);
    setQuery(`${p[0]} – ${p[1]}`);
    setN0('');
    setN1('');
    setN2('');
    setN3('');
    setEditingRecordId(null);
    setMsg('');
    setTimeout(() => {
      n0InputRef.current?.focus();
    }, 50);
  };

  // Limpar formulário de contagem
  const clearForm = () => {
    setN0('');
    setN1('');
    setN2('');
    setN3('');
    setEditingRecordId(null);
  };

  // Cálculo de unidades
  const numVal = (v: string) => Math.max(0, Math.floor(Number(v) || 0));

  const totalCalculatedUnits = useMemo(() => {
    if (!curProduct) return 0;
    const [, , cxPallet, cxLastro, fatorCx] = curProduct;
    const p = numVal(n0);
    const l = numVal(n1);
    const c = numVal(n2);
    const u = numVal(n3);
    return (p * cxPallet + l * cxLastro + c) * fatorCx + u;
  }, [curProduct, n0, n1, n2, n3]);

  // Formatações auxiliares
  const formatBoxes = (p: [number, string, number, number, number], u: number) => {
    const fator = p[4] || 1;
    const cx = Math.floor(u / fator);
    const un = u % fator;
    return `${cx} cx${un ? ` + ${un} un` : ''}`;
  };

  const formatBreakdown = (p: [number, string, number, number, number], u: number) => {
    const [, , cxPallet, cxLastro, fator] = p;
    let cx = Math.floor(u / (fator || 1));
    const un = u % (fator || 1);
    const pa = cxPallet > 0 ? Math.floor(cx / cxPallet) : 0;
    if (cxPallet > 0) cx -= pa * cxPallet;
    const la = cxLastro > 0 ? Math.floor(cx / cxLastro) : 0;
    if (cxLastro > 0) cx -= la * cxLastro;
    return `${pa} pallet · ${la} lastro · ${cx} cx · ${un} un`;
  };

  // Alternar teclado numérico / alfabético
  const toggleKeyboard = () => {
    setIsNumericMode(!isNumericMode);
    queryInputRef.current?.blur();
    setTimeout(() => {
      queryInputRef.current?.focus();
    }, 50);
  };

  // Teclas no campo de busca
  const handleQueryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length || !showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[selectedIndex]) {
        pick(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Navegação por Enter entre os inputs
  const handleInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    fieldIndex: number
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    if (fieldIndex === 0) {
      if (curProduct && curProduct[3] > 0) {
        n1InputRef.current?.focus();
      } else {
        n2InputRef.current?.focus();
      }
    } else if (fieldIndex === 1) {
      n2InputRef.current?.focus();
    } else if (fieldIndex === 2) {
      n3InputRef.current?.focus();
    } else if (fieldIndex === 3) {
      handleAdd();
    }
  };

  // Adicionar ou Atualizar Contagem
  const handleAdd = () => {
    if (!curProduct) return;
    const u = totalCalculatedUnits;
    if (!u) {
      setMsg('Informe uma quantidade.');
      return;
    }

    const cod = curProduct[0];
    const desc = curProduct[1];
    const cxPallet = curProduct[2];
    const cxLastro = curProduct[3];
    const fatorCx = curProduct[4];

    const pQty = numVal(n0);
    const lQty = numVal(n1);
    const cQty = numVal(n2);
    const uQty = numVal(n3);

    const now = Date.now();
    const dataHora = new Date().toLocaleString('pt-BR');

    let updatedList: CountRecord[];

    if (editingRecordId) {
      // Editando item existente
      updatedList = historyItems.map((it) =>
        it.id === editingRecordId || it.c === cod
          ? {
              ...it,
              u,
              pallets: pQty,
              lastros: lQty,
              caixas: cQty,
              unidades: uQty,
              dataHora,
              timestamp: now,
            }
          : it
      );

      const contagemItem: ContagemEstoqueItem = {
        id: editingRecordId,
        cod,
        desc,
        tipo: 'cx',
        fatorCx,
        caixasPorLastro: cxLastro,
        caixasPorPallet: cxPallet,
        pallets: pQty,
        lastros: lQty,
        caixas: cQty,
        unidades: uQty,
        totalCaixasFormatado: formatBoxes(curProduct, u),
        totalCaixasDecimal: u / (fatorCx || 1),
        totalUnidades: u,
        dataHora,
        timestamp: now,
      };

      onUpdateContagem(contagemItem);
      setMsg(`✏️ [${cod}] alterado com sucesso!`);
    } else {
      // Novo lançamento: verifica se o item já foi contado hoje para SOMAR as quantidades!
      const todayStr = new Date().toLocaleDateString('pt-BR');
      const existingInStore = (data.contagensEstoque || []).find((it) => {
        if (it.cod !== cod) return false;
        return getItemDateString(it) === todayStr;
      });
      const existingInHistory = historyItems.find((h) => h.c === cod);

      if (existingInStore || existingInHistory) {
        // Item já existe: soma as quantidades
        const prevPallets = existingInStore?.pallets ?? existingInHistory?.pallets ?? 0;
        const prevLastros = existingInStore?.lastros ?? existingInHistory?.lastros ?? 0;
        const prevCaixas = existingInStore?.caixas ?? existingInHistory?.caixas ?? 0;
        const prevUnidades = existingInStore?.unidades ?? existingInHistory?.unidades ?? 0;
        const prevTotalUnits = existingInStore?.totalUnidades ?? existingInHistory?.u ?? 0;

        const sumPallets = prevPallets + pQty;
        const sumLastros = prevLastros + lQty;
        const sumCaixas = prevCaixas + cQty;
        const sumUnidades = prevUnidades + uQty;
        const sumTotalUnits = prevTotalUnits + u;
        const sumDecimal = sumTotalUnits / (fatorCx || 1);
        const sumFormatted = formatBoxes(curProduct, sumTotalUnits);

        const targetId = existingInStore?.id || existingInHistory?.id || `cont_${cod}_${now}`;

        const contagemItem: ContagemEstoqueItem = {
          id: targetId,
          cod,
          desc,
          tipo: 'cx',
          fatorCx,
          caixasPorLastro: cxLastro,
          caixasPorPallet: cxPallet,
          pallets: sumPallets,
          lastros: sumLastros,
          caixas: sumCaixas,
          unidades: sumUnidades,
          totalCaixasFormatado: sumFormatted,
          totalCaixasDecimal: sumDecimal,
          totalUnidades: sumTotalUnits,
          dataHora,
          timestamp: now,
        };

        const record: CountRecord = {
          id: targetId,
          c: cod,
          u: sumTotalUnits,
          pallets: sumPallets,
          lastros: sumLastros,
          caixas: sumCaixas,
          unidades: sumUnidades,
          dataHora,
          timestamp: now,
        };

        updatedList = [record, ...historyItems.filter((h) => h.c !== cod)];
        onSaveContagem(contagemItem);
        setMsg(`➕ [${cod}] somado à contagem existente! Novo total: ${sumFormatted} (${sumTotalUnits.toLocaleString('pt-BR')} un)`);
      } else {
        // Novo item inédito
        const newItemId = `cont_${cod}_${now}`;
        const record: CountRecord = {
          id: newItemId,
          c: cod,
          u,
          pallets: pQty,
          lastros: lQty,
          caixas: cQty,
          unidades: uQty,
          dataHora,
          timestamp: now,
        };

        updatedList = [record, ...historyItems.filter((h) => h.c !== cod)];

        const contagemItem: ContagemEstoqueItem = {
          id: newItemId,
          cod,
          desc,
          tipo: 'cx',
          fatorCx,
          caixasPorLastro: cxLastro,
          caixasPorPallet: cxPallet,
          pallets: pQty,
          lastros: lQty,
          caixas: cQty,
          unidades: uQty,
          totalCaixasFormatado: formatBoxes(curProduct, u),
          totalCaixasDecimal: u / (fatorCx || 1),
          totalUnidades: u,
          dataHora,
          timestamp: now,
        };

        onSaveContagem(contagemItem);
        setMsg(`✅ [${cod}] adicionado com sucesso! (${formatBoxes(curProduct, u)})`);
      }
    }

    persistItems(updatedList);
    clearForm();
    setQuery('');
    setCurProduct(null);
    queryInputRef.current?.focus();
  };

  // Carregar item para edição
  const handleEditItem = (rec: CountRecord) => {
    const prod = productList.find((p) => p[0] === rec.c);
    if (!prod) return;

    setCurProduct(prod);
    setQuery(`${prod[0]} – ${prod[1]}`);
    setN0(rec.pallets > 0 ? String(rec.pallets) : '');
    setN1(rec.lastros > 0 ? String(rec.lastros) : '');
    setN2(rec.caixas > 0 ? String(rec.caixas) : '');
    setN3(rec.unidades > 0 ? String(rec.unidades) : '');
    setEditingRecordId(rec.id || `cont_${rec.c}`);
    setMsg(`Editando código [${rec.c}]. Altere os valores e clique em "Salvar Alteração".`);

    setTimeout(() => {
      n0InputRef.current?.focus();
    }, 50);
  };

  // Excluir item
  const handleDeleteItem = (rec: CountRecord) => {
    if (window.confirm(`Deseja excluir a contagem do código [${rec.c}]?`)) {
      const next = historyItems.filter((h) => h.c !== rec.c);
      persistItems(next);

      if (rec.id) {
        onDeleteContagem(rec.id);
      } else {
        const found = data.contagensEstoque?.find((c) => c.cod === rec.c);
        if (found) onDeleteContagem(found.id);
      }
      setMsg(`Código [${rec.c}] removido.`);
      if (editingRecordId && curProduct && curProduct[0] === rec.c) {
        clearForm();
        setCurProduct(null);
        setQuery('');
      }
    }
  };

  // Os dois últimos produtos lançados
  const lastTwoItems = useMemo(() => {
    return historyItems.slice(0, 2);
  }, [historyItems]);

  const lastAddedItem = historyItems[0] || null;

  return (
    <div className="contagem-page-wrapper">
      <style>{`
        .contagem-page-wrapper {
          --bg: #f4f5f7;
          --card: #ffffff;
          --tx: #1b1f24;
          --mu: #5d6773;
          --bd: #d9dde3;
          --ac: #0b5fd6;
          --ok: #127a3a;
          --rd: #b42318;
          background: var(--bg);
          color: var(--tx);
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          font-size: 16px;
          line-height: 1.4;
          min-height: calc(100vh - 60px);
          padding-bottom: 40px;
        }

        .cnt-main {
          max-width: 720px;
          margin: 0 auto;
          padding: 14px;
        }

        .cnt-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 4px 0 12px;
        }

        .cnt-header h1 {
          font-size: 20px;
          font-weight: 700;
          color: var(--tx);
          margin: 0;
        }

        .cnt-nav-link {
          font-size: 13px;
          font-weight: 700;
          color: var(--ac);
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .cnt-nav-link:hover {
          background: #dbeafe;
        }

        .cnt-card {
          background: var(--card);
          border: 1px solid var(--bd);
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }

        .cnt-label {
          display: block;
          font-size: 13px;
          color: var(--mu);
          margin-bottom: 4px;
          font-weight: 500;
        }

        .cnt-input {
          width: 100%;
          font: inherit;
          padding: 11px;
          border: 1px solid var(--bd);
          border-radius: 8px;
          background: var(--bg);
          color: var(--tx);
          transition: border-color 0.15s, outline 0.15s;
        }

        .cnt-input:focus {
          outline: 2px solid var(--ac);
          border-color: var(--ac);
        }

        .cnt-input:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          background: #e9ecef;
        }

        .cnt-sw {
          position: relative;
        }

        .cnt-row {
          display: flex;
          gap: 8px;
        }

        .cnt-row button {
          flex: none;
          min-width: 64px;
        }

        .cnt-sug {
          position: absolute;
          left: 0;
          right: 0;
          top: 100%;
          z-index: 50;
          background: var(--card);
          border: 1px solid var(--bd);
          border-radius: 8px;
          margin-top: 4px;
          max-height: 260px;
          overflow-y: auto;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
        }

        .cnt-sug div {
          padding: 10px;
          border-bottom: 1px solid var(--bd);
          cursor: pointer;
          font-size: 14px;
          text-align: left;
        }

        .cnt-sug div:last-child {
          border: 0;
        }

        .cnt-sug div:hover,
        .cnt-sug .on {
          background: var(--bg);
        }

        .cnt-sug b {
          color: var(--ac);
        }

        .cnt-prod {
          margin-top: 12px;
        }

        .cnt-prod h2 {
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 4px;
          color: var(--tx);
        }

        .cnt-info {
          font-size: 13px;
          color: var(--mu);
          margin-bottom: 12px;
        }

        .cnt-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .cnt-grid input {
          text-align: center;
          font-size: 20px;
          font-weight: 700;
          padding: 12px 4px;
        }

        .cnt-grid label {
          text-align: center;
        }

        .cnt-res {
          margin-top: 12px;
          padding: 12px;
          border-radius: 8px;
          background: var(--bg);
          border: 1px dashed var(--bd);
        }

        .cnt-big {
          font-size: 22px;
          font-weight: 700;
          color: var(--ok);
        }

        .cnt-sm {
          font-size: 13px;
          color: var(--mu);
          margin-top: 2px;
        }

        .cnt-btns {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .cnt-btn {
          font: inherit;
          font-weight: 600;
          padding: 11px 16px;
          border-radius: 8px;
          border: 1px solid var(--bd);
          background: var(--card);
          color: var(--tx);
          cursor: pointer;
          transition: background 0.15s, transform 0.05s;
        }

        .cnt-btn:hover {
          background: #ebeef2;
        }

        .cnt-btn:active {
          transform: translateY(1px);
        }

        .cnt-btn.p {
          background: var(--ac);
          border-color: var(--ac);
          color: #fff;
        }

        .cnt-btn.p:hover {
          background: #094eb3;
        }

        .cnt-btn.x {
          padding: 6px 10px;
          color: var(--rd);
          background: transparent;
          border: none;
          font-size: 16px;
          cursor: pointer;
        }

        .cnt-btn.x:hover {
          background: rgba(180, 35, 24, 0.08);
          border-radius: 6px;
        }

        .cnt-feedback {
          font-size: 13px;
          color: var(--ac);
          margin-top: 8px;
          font-weight: 600;
        }

        /* Seção do Último Código Adicionado */
        .last-added-card {
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-left: 5px solid #0b5fd6;
          border-radius: 10px;
          padding: 12px 14px;
          margin-top: 6px;
        }

        .last-added-title {
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: #64748b;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .recent-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid var(--bd);
        }

        .recent-item-row:last-child {
          border-bottom: 0;
        }

        .recent-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-edit-recent {
          font-size: 12px;
          font-weight: 700;
          padding: 5px 10px;
          border-radius: 6px;
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          cursor: pointer;
          transition: background 0.15s;
        }

        .btn-edit-recent:hover {
          background: #dbeafe;
        }
      `}</style>

      <main className="cnt-main">
        {/* Cabeçalho */}
        <div className="cnt-header">
          <h1>Contagem de estoque</h1>
          {onNavigateToContagemDia && (
            <button
              type="button"
              className="cnt-nav-link"
              onClick={onNavigateToContagemDia}
              title="Visualizar a contagem completa do dia"
            >
              <span>Ver Contagem do Dia ➔</span>
            </button>
          )}
        </div>

        {/* Card 1: Seleção e Lançamento de Quantidades */}
        <div className="cnt-card">
          <div className="cnt-sw">
            <label className="cnt-label" htmlFor="q">
              Código ou descrição do produto
            </label>
            <div className="cnt-row">
              <input
                id="q"
                ref={queryInputRef}
                className="cnt-input"
                type="text"
                autoComplete="off"
                placeholder={isNumericMode ? 'Digite o código' : 'Digite parte da descrição'}
                inputMode={isNumericMode ? 'numeric' : 'text'}
                enterKeyHint="search"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleQueryKeyDown}
                onBlur={() => {
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
              />
              <button
                id="kb"
                className="cnt-btn"
                type="button"
                title="Trocar teclado"
                onClick={toggleKeyboard}
              >
                {isNumericMode ? 'ABC' : '123'}
              </button>
            </div>

            {/* Lista Dropdown de Sugestões */}
            {showSuggestions && (
              <div id="sug" className="cnt-sug">
                {suggestions.length === 0 ? (
                  <div>Nenhum produto encontrado</div>
                ) : (
                  suggestions.map((p, idx) => (
                    <div
                      key={p[0]}
                      className={idx === selectedIndex ? 'on' : ''}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(p);
                      }}
                    >
                      <b>{p[0]}</b> – <span>{p[1]}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Área do Produto Selecionado */}
          {curProduct && (
            <div className="cnt-prod" id="prod">
              <h2 id="pn">
                {editingRecordId && <span style={{ color: '#0b5fd6', marginRight: 6 }}>[EDITANDO]</span>}
                {curProduct[0]} – {curProduct[1]}
              </h2>
              <div className="cnt-info" id="pi">
                1 pallet = {curProduct[2]} cx ·{' '}
                {curProduct[3] ? `1 lastro = ${curProduct[3]} cx` : 'sem lastro'} · fator:{' '}
                {curProduct[4]} un/cx
              </div>

              {/* Grid vertical dos 4 campos */}
              <div className="cnt-grid">
                <div>
                  <label className="cnt-label" htmlFor="n0">
                    Pallet
                  </label>
                  <input
                    id="n0"
                    ref={n0InputRef}
                    className="cnt-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    value={n0}
                    onChange={(e) => setN0(e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown(e, 0)}
                  />
                </div>

                <div>
                  <label className="cnt-label" htmlFor="n1">
                    Lastro
                  </label>
                  <input
                    id="n1"
                    ref={n1InputRef}
                    className="cnt-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    disabled={!curProduct[3]}
                    value={n1}
                    onChange={(e) => setN1(e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown(e, 1)}
                  />
                </div>

                <div>
                  <label className="cnt-label" htmlFor="n2">
                    Caixa
                  </label>
                  <input
                    id="n2"
                    ref={n2InputRef}
                    className="cnt-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    value={n2}
                    onChange={(e) => setN2(e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown(e, 2)}
                  />
                </div>

                <div>
                  <label className="cnt-label" htmlFor="n3">
                    Unidade
                  </label>
                  <input
                    id="n3"
                    ref={n3InputRef}
                    className="cnt-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    placeholder="0"
                    value={n3}
                    onChange={(e) => setN3(e.target.value)}
                    onKeyDown={(e) => handleInputKeyDown(e, 3)}
                  />
                </div>
              </div>

              {/* Resumo do cálculo atual */}
              <div className="cnt-res">
                <div className="cnt-big" id="r1">
                  {formatBoxes(curProduct, totalCalculatedUnits)}
                </div>
                <div className="cnt-sm" id="r2">
                  Total: {totalCalculatedUnits} unidades
                </div>
                <div className="cnt-sm" id="r3">
                  {formatBreakdown(curProduct, totalCalculatedUnits)}
                </div>
              </div>

              {/* Botões de Ação do Formulário */}
              <div className="cnt-btns">
                <button className="cnt-btn p" id="add" type="button" onClick={handleAdd}>
                  {editingRecordId ? 'Salvar Alteração' : 'Adicionar à contagem'}
                </button>
                <button className="cnt-btn" id="clr" type="button" onClick={clearForm}>
                  Cancelar / Limpar
                </button>
              </div>
            </div>
          )}

          {msg && (
            <div className="cnt-feedback" id="msg">
              {msg}
            </div>
          )}
        </div>

        {/* Card: Último Código Adicionado */}
        {lastAddedItem && (
          <div className="cnt-card" style={{ padding: '12px 14px' }}>
            <div className="last-added-title">
              <span>Último Código Adicionado</span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                {lastAddedItem.dataHora || 'Agora'}
              </span>
            </div>
            {(() => {
              const p = productList.find((x) => x[0] === lastAddedItem.c);
              const desc = p ? p[1] : `PRODUTO ${lastAddedItem.c}`;
              const formatted = p ? formatBoxes(p, lastAddedItem.u) : `${lastAddedItem.u} un`;
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                      <span style={{ color: '#0b5fd6' }}>[{lastAddedItem.c}]</span> {desc}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                      <b style={{ color: '#16a34a' }}>{formatted}</b> ({lastAddedItem.u} un) ·{' '}
                      {lastAddedItem.pallets} pal · {lastAddedItem.lastros} last · {lastAddedItem.caixas} cx · {lastAddedItem.unidades} un
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-edit-recent"
                    onClick={() => handleEditItem(lastAddedItem)}
                    title="Editar este item"
                  >
                    Editar
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* Card: Edição dos Dois Últimos Códigos Importados/Lançados */}
        {lastTwoItems.length > 0 && (
          <div className="cnt-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="cnt-label" style={{ margin: 0, fontWeight: 700 }}>
                Últimos 2 Códigos Lançados (Edição Rápida)
              </label>
              {onNavigateToContagemDia && (
                <span
                  onClick={onNavigateToContagemDia}
                  style={{ fontSize: '11px', color: '#0b5fd6', fontWeight: 700, cursor: 'pointer' }}
                >
                  Ver todos na aba Contagem do Dia ➔
                </span>
              )}
            </div>

            <div>
              {lastTwoItems.map((rec, idx) => {
                const p = productList.find((x) => x[0] === rec.c);
                const desc = p ? p[1] : `PRODUTO ${rec.c}`;
                const formatted = p ? formatBoxes(p, rec.u) : `${rec.u} un`;

                return (
                  <div key={`${rec.c}_${idx}`} className="recent-item-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                        <b style={{ color: '#0b5fd6' }}>{rec.c}</b> – <span>{desc}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: 1 }}>
                        <b style={{ color: '#16a34a' }}>{formatted}</b> ({rec.u} un) ·{' '}
                        {rec.pallets} pal / {rec.lastros} last / {rec.caixas} cx / {rec.unidades} un
                      </div>
                    </div>

                    <div className="recent-actions">
                      <button
                        type="button"
                        className="btn-edit-recent"
                        onClick={() => handleEditItem(rec)}
                        title="Editar quantidades deste código"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="cnt-btn x"
                        onClick={() => handleDeleteItem(rec)}
                        title="Excluir este lançamento"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
