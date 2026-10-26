import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { RawData, CalculatedProduct, ContagemGpsItem, ResRow } from '../data/types';
import {
  MapPin,
  Crosshair,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  Search,
  ExternalLink,
  Layers,
  RefreshCw,
  FileSpreadsheet,
  X,
  Info,
  Check,
  Package,
  Boxes,
  Box,
  Settings2
} from 'lucide-react';

interface ContagemGpsViewProps {
  data: RawData;
  calculatedProducts: CalculatedProduct[];
  onUpdateData: (newData: RawData, desc: string) => void;
  onSetToastMessage?: (msg: string) => void;
}

interface CurrentLocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  altitude: number | null;
  timestamp: number | null;
  error: string | null;
  loading: boolean;
}

interface PalletConfig {
  cxPorLastro: number;
  lastrosPorPallet: number;
}

/**
 * Retorna a configuração padrão de paletização (lastro x camadas) com base no nome do produto
 */
function getDefaultPalletConfig(desc: string): PalletConfig {
  const d = (desc || '').toUpperCase();
  if (d.includes('600ML')) {
    return { cxPorLastro: 12, lastrosPorPallet: 5 }; // 60 cx/palete
  }
  if (d.includes(' 1L') || d.includes('1 LITRO') || d.includes('GFA VD 1L')) {
    return { cxPorLastro: 12, lastrosPorPallet: 4 }; // 48 cx/palete
  }
  if (d.includes('LT') || d.includes('LATA') || d.includes('269ML') || d.includes('350ML')) {
    return { cxPorLastro: 15, lastrosPorPallet: 6 }; // 90 cx/palete
  }
  if (d.includes('LONG NECK') || d.includes('LN') || d.includes('355ML')) {
    return { cxPorLastro: 14, lastrosPorPallet: 6 }; // 84 cx/palete
  }
  if (d.includes('PET 2L') || d.includes('2,0L') || d.includes('2L')) {
    return { cxPorLastro: 16, lastrosPorPallet: 4 }; // 64 cx/palete
  }
  if (d.includes('PET 1L')) {
    return { cxPorLastro: 12, lastrosPorPallet: 5 }; // 60 cx/palete
  }
  if (d.includes('KEG') || d.includes('BARRIL') || d.includes('50L') || d.includes('30L')) {
    return { cxPorLastro: 4, lastrosPorPallet: 2 }; // 8 barris/palete
  }
  return { cxPorLastro: 12, lastrosPorPallet: 5 }; // Padrão genérico
}

export const ContagemGpsView: React.FC<ContagemGpsViewProps> = ({
  data,
  calculatedProducts,
  onUpdateData,
  onSetToastMessage,
}) => {
  const items: ContagemGpsItem[] = data.contagemGps || [];

  // Estado do GPS em tempo real
  const [gps, setGps] = useState<CurrentLocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    altitude: null,
    timestamp: null,
    error: null,
    loading: false,
  });

  const [watchId, setWatchId] = useState<number | null>(null);
  const [autoTracking] = useState(true);

  // Formulário de Registro - Exclusivamente: Código do Produto, Pallet, Lastro, Caixa, Unidade
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CalculatedProduct | null>(null);
  const [pallet, setPallet] = useState<string>('');
  const [lastro, setLastro] = useState<string>('');
  const [caixa, setCaixa] = useState<string>('');
  const [unidade, setUnidade] = useState<string>('');

  // Configuração de Paletização (Lastro x Camadas por Pallet)
  const [cxPorLastro, setCxPorLastro] = useState<number>(12);
  const [lastrosPorPallet, setLastrosPorPallet] = useState<number>(5);
  const [showPalletConfig, setShowPalletConfig] = useState(false);

  // Filtros e busca na tabela de contagens realizadas
  const [filterQuery, setFilterQuery] = useState('');
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [showApplyConfirmModal, setShowApplyConfirmModal] = useState(false);

  // Atualiza configuração de palete ao selecionar produto
  useEffect(() => {
    if (selectedProduct) {
      const savedCfg = localStorage.getItem(`pallet_cfg_${selectedProduct.c}`);
      if (savedCfg) {
        try {
          const parsed = JSON.parse(savedCfg);
          setCxPorLastro(parsed.cxPorLastro || 12);
          setLastrosPorPallet(parsed.lastrosPorPallet || 5);
          return;
        } catch {
          // ignora
        }
      }
      const def = getDefaultPalletConfig(selectedProduct.d);
      setCxPorLastro(def.cxPorLastro);
      setLastrosPorPallet(def.lastrosPorPallet);
    }
  }, [selectedProduct]);

  // Função para salvar nova configuração personalizada de palete para o produto
  const handleSavePalletConfig = (newCxLastro: number, newLastrosPallet: number) => {
    setCxPorLastro(newCxLastro);
    setLastrosPorPallet(newLastrosPallet);
    if (selectedProduct) {
      localStorage.setItem(
        `pallet_cfg_${selectedProduct.c}`,
        JSON.stringify({ cxPorLastro: newCxLastro, lastrosPorPallet: newLastrosPallet })
      );
    }
  };

  // Cálculos matemáticos em tempo real das quantidades apuradas
  const pNum = parseFloat(pallet.replace(',', '.')) || 0;
  const lNum = parseFloat(lastro.replace(',', '.')) || 0;
  const cNum = parseFloat(caixa.replace(',', '.')) || 0;
  const uNum = parseFloat(unidade.replace(',', '.')) || 0;

  const cxPorPalletTotal = cxPorLastro * lastrosPorPallet;
  const cxDePallets = pNum * cxPorPalletTotal;
  const cxDeLastros = lNum * cxPorLastro;
  const totalCxCalculado = Math.round(cxDePallets + cxDeLastros + cNum);

  const fatorEmbalagem = selectedProduct ? (selectedProduct.H > 0 ? selectedProduct.H : 1) : 1;
  const totalUnidCalculado = Math.round(totalCxCalculado * fatorEmbalagem + uNum);

  // Capturar GPS único com alta precisão
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGps((prev) => ({
        ...prev,
        error: 'Geolocalização não é suportada pelo seu dispositivo.',
        loading: false,
      }));
      return;
    }

    setGps((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGps({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy * 10) / 10,
          altitude: position.coords.altitude ? Math.round(position.coords.altitude * 10) / 10 : null,
          timestamp: position.timestamp,
          error: null,
          loading: false,
        });
      },
      (err) => {
        let msg = 'Erro ao obter localização.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Permissão de GPS negada. Por favor, autorize a localização no navegador do celular.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Sinal de GPS indisponível no momento. Certifique-se de que a localização está ativada no celular.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'Tempo limite esgotado ao buscar satélites GPS. Tente novamente.';
        }
        setGps((prev) => ({
          ...prev,
          error: msg,
          loading: false,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // Monitoramento contínuo em segundo plano
  useEffect(() => {
    if (!autoTracking || !navigator.geolocation) return;

    requestLocation();

    const id = navigator.geolocation.watchPosition(
      (position) => {
        setGps({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy * 10) / 10,
          altitude: position.coords.altitude ? Math.round(position.coords.altitude * 10) / 10 : null,
          timestamp: position.timestamp,
          error: null,
          loading: false,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGps((prev) => ({
            ...prev,
            error: 'Permissão de GPS negada pelo usuário.',
            loading: false,
          }));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000,
      }
    );

    setWatchId(id);

    return () => {
      if (id !== null) {
        navigator.geolocation.clearWatch(id);
      }
    };
  }, [autoTracking]);

  // Lista de produtos para pesquisa no formulário
  const filteredProductOptions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return calculatedProducts
      .filter((p) => !p.desativado)
      .filter((p) => p.c.toString().includes(q) || p.d.toLowerCase().includes(q))
      .slice(0, 10);
  }, [calculatedProducts, searchQuery]);

  // Totais apurados
  const stats = useMemo(() => {
    const totalItens = items.length;
    const totalPallets = items.reduce((acc, it) => acc + (it.pallet || 0), 0);
    const totalLastros = items.reduce((acc, it) => acc + (it.lastro || 0), 0);
    const totalCx = items.reduce((acc, it) => acc + it.qtdCx, 0);
    const totalUnid = items.reduce((acc, it) => acc + it.qtdUnid, 0);
    const distinctCodigos = new Set(items.map((it) => it.cod)).size;
    const itemsComGps = items.filter((it) => it.lat !== 0 && it.lng !== 0).length;
    return { totalItens, totalPallets, totalLastros, totalCx, totalUnid, distinctCodigos, itemsComGps };
  }, [items]);

  // Filtra itens na tabela (apenas código ou descrição)
  const filteredItems = useMemo(() => {
    if (!filterQuery.trim()) return items;
    const q = filterQuery.toLowerCase().trim();
    return items.filter(
      (it) =>
        it.cod.toString().includes(q) ||
        it.desc.toLowerCase().includes(q)
    );
  }, [items, filterQuery]);

  // Registrar contagem com GPS
  const handleRegistrarContagem = () => {
    if (!selectedProduct) {
      alert('Por favor, selecione um produto antes de registrar.');
      return;
    }

    if (totalCxCalculado <= 0 && uNum <= 0) {
      alert('Informe a quantidade contada (Pallet, Lastro, Caixa ou Unidade).');
      return;
    }

    // Se o GPS ainda não tiver coordenadas válidas, tenta obter agora
    if (gps.lat === null || gps.lng === null) {
      if (navigator.geolocation) {
        requestLocation();
      }
    }

    const lat = gps.lat || 0;
    const lng = gps.lng || 0;
    const accuracy = gps.accuracy || 0;
    const altitude = gps.altitude || null;
    const now = new Date();
    const dataHoraStr = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');

    const mapsUrl =
      lat !== 0 && lng !== 0
        ? `https://www.google.com/maps?q=${lat},${lng}`
        : '';

    const newItem: ContagemGpsItem = {
      id: `cg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      cod: selectedProduct.c,
      desc: selectedProduct.d,
      tipo: selectedProduct.t || 'cx',
      fatorCx: fatorEmbalagem,
      pallet: pNum > 0 ? pNum : undefined,
      lastro: lNum > 0 ? lNum : undefined,
      caixa: cNum > 0 ? cNum : undefined,
      unidade: uNum > 0 ? uNum : undefined,
      qtdCx: totalCxCalculado,
      qtdUnid: totalUnidCalculado,
      lat,
      lng,
      accuracy,
      altitude,
      timestamp: Date.now(),
      dataHora: dataHoraStr,
      mapsUrl,
    };

    const nextItems = [newItem, ...items];
    const nextData: RawData = {
      ...data,
      contagemGps: nextItems,
    };

    onUpdateData(
      nextData,
      `Registrou contagem com GPS do item #${newItem.cod} (${newItem.qtdCx} cx / ${newItem.qtdUnid} unid)`
    );

    if (onSetToastMessage) {
      onSetToastMessage(
        `📍 Contagem do item #${newItem.cod} gravada com GPS (${accuracy > 0 ? `±${accuracy}m` : 'Sem GPS'})!`
      );
    }

    // Limpa campos do formulário para o próximo item
    setSelectedProduct(null);
    setSearchQuery('');
    setPallet('');
    setLastro('');
    setCaixa('');
    setUnidade('');
  };

  // Excluir um registro de contagem
  const handleDeleteItem = (id: string) => {
    const nextItems = items.filter((it) => it.id !== id);
    const nextData: RawData = {
      ...data,
      contagemGps: nextItems,
    };
    onUpdateData(nextData, 'Removeu registro de contagem GPS');
    if (onSetToastMessage) {
      onSetToastMessage('Item removido da contagem.');
    }
  };

  // Limpar todas as contagens
  const handleClearAll = () => {
    if (items.length === 0) return;
    if (confirm('Tem certeza de que deseja limpar todas as contagens com GPS registradas?')) {
      const nextData: RawData = {
        ...data,
        contagemGps: [],
      };
      onUpdateData(nextData, 'Limpou todas as contagens com GPS');
      if (onSetToastMessage) {
        onSetToastMessage('Todas as contagens foram limpas.');
      }
    }
  };

  // Aplicar as contagens ao estoque físico (data.res)
  const handleAplicarAoEstoque = () => {
    if (items.length === 0) return;

    // Agrupa totais contados por código do produto
    const totalsByCode = new Map<number, number>();
    items.forEach((it) => {
      const current = totalsByCode.get(it.cod) || 0;
      totalsByCode.set(it.cod, current + it.qtdUnid);
    });

    let updatedCount = 0;
    const newRes = data.res.map((r) => {
      const row = [...r] as ResRow;
      const code = row[0];
      if (totalsByCode.has(code)) {
        row[7] = totalsByCode.get(code)!; // Coluna 7: b (Inventário Físico em unidades)
        updatedCount++;
      }
      return row;
    });

    const nextData: RawData = {
      ...data,
      res: newRes,
      gradeRes: data.gradeRes ? newRes : undefined,
    };

    onUpdateData(
      nextData,
      `Aplicou contagem física com GPS em ${updatedCount} produtos no Estoque Físico`
    );

    setShowApplyConfirmModal(false);
    if (onSetToastMessage) {
      onSetToastMessage(
        `✅ ${updatedCount} produtos foram atualizados na coluna de Inventário Físico com sucesso!`
      );
    }
  };

  // Exportar para Excel (.xlsx) com Pallet, Lastro, Caixa, Unidade e Coordenadas GPS
  const handleExportXLSX = () => {
    if (items.length === 0) {
      alert('Não há contagens para exportar.');
      return;
    }

    const rows = items.map((it, idx) => ({
      '#': idx + 1,
      'Código Produto': it.cod,
      'Descrição': it.desc,
      'Tipo': it.tipo,
      'Fator Cx': it.fatorCx,
      'Pallet': it.pallet || 0,
      'Lastro': it.lastro || 0,
      'Caixa': it.caixa || 0,
      'Unidade': it.unidade || 0,
      'Total Caixas': it.qtdCx,
      'Total Unidades': it.qtdUnid,
      'Data e Hora do Registro': it.dataHora,
      'Latitude': it.lat !== 0 ? it.lat : 'Não capturado',
      'Longitude': it.lng !== 0 ? it.lng : 'Não capturado',
      'Precisão GPS (metros)': it.accuracy ? `±${it.accuracy}m` : '-',
      'Altitude (m)': it.altitude ? `${it.altitude}m` : '-',
      'Link Google Maps': it.mapsUrl || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contagem_GPS');

    const fileName = `Contagem_Estoque_GPS_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Helper para badge de precisão do GPS
  const getAccuracyBadge = (acc: number | null) => {
    if (acc === null || acc === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
          Sem GPS
        </span>
      );
    }
    if (acc <= 5) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Alta Precisão: ±{acc}m
        </span>
      );
    }
    if (acc <= 15) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Boa Precisão: ±{acc}m
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Precisão Média: ±{acc}m
      </span>
    );
  };

  return (
    <div className="w-full bg-zinc-50 min-h-screen pb-24 text-zinc-900 font-sans">
      {/* Banner Superior com Identificação e Título */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-zinc-900 text-white p-3.5 sm:p-6 shadow-md border-b border-teal-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 sm:p-2.5 bg-emerald-500 text-zinc-950 rounded-xl shadow-inner shrink-0">
                <MapPin className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <div>
                <h1 className="text-lg sm:text-2xl font-black tracking-tight text-white flex items-center gap-2 flex-wrap">
                  Contagem em Campo com GPS
                  <span className="text-[10px] sm:text-xs font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    Geolocalização Ativa
                  </span>
                </h1>
                <p className="text-[11px] sm:text-sm text-zinc-300 leading-tight mt-0.5">
                  Rastreamento geográfico exato de onde cada produto do estoque físico foi bipado ou contado no galpão
                </p>
              </div>
            </div>
          </div>

          {/* Card do Sinal GPS em Tempo Real */}
          <div className="w-full md:w-auto bg-zinc-950/80 border border-teal-500/30 rounded-xl p-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 backdrop-blur-sm shadow-inner">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-3.5 h-3.5 rounded-full shrink-0 transition-all ${
                  gps.loading
                    ? 'bg-amber-400 animate-ping'
                    : gps.lat !== null
                    ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]'
                    : 'bg-rose-500'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 flex-wrap">
                  <span>
                    {gps.loading
                      ? 'Buscando GPS...'
                      : gps.lat !== null
                      ? 'GPS Conectado'
                      : 'Aguardando GPS'}
                  </span>
                  {gps.lat !== null && gps.accuracy !== null && (
                    <span className="text-[10px] font-normal text-emerald-400 bg-emerald-950/60 border border-emerald-600/40 px-1.5 py-0.2 rounded">
                      ±{gps.accuracy}m
                    </span>
                  )}
                </div>
                <div className="text-[10px] sm:text-[11px] text-zinc-400 font-mono truncate">
                  {gps.lat !== null && gps.lng !== null
                    ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
                    : 'Toque para atualizar GPS'}
                </div>
              </div>
            </div>

            <button
              onClick={requestLocation}
              disabled={gps.loading}
              className="shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50 min-h-[38px]"
              title="Forçar atualização da posição GPS atual"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gps.loading ? 'animate-spin' : ''}`} />
              <span>Atualizar GPS</span>
            </button>
          </div>
        </div>

        {/* Alerta de erro de GPS se houver */}
        {gps.error && (
          <div className="max-w-7xl mx-auto mt-3 p-3 bg-rose-950/80 border border-rose-600/50 rounded-lg text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{gps.error}</span>
          </div>
        )}
      </div>

      {/* Container Principal */}
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-4 sm:py-6">
        {/* Painel de Métricas Rápidas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-white p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Registros Gravados
            </span>
            <span className="text-xl sm:text-3xl font-black text-zinc-900 mt-1 leading-none">
              {stats.totalItens}
            </span>
            <span className="text-[10px] sm:text-[11px] text-zinc-400 mt-1">
              {stats.distinctCodigos} produtos distintos
            </span>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Total em Caixas
            </span>
            <span className="text-xl sm:text-3xl font-black text-emerald-700 mt-1 leading-none">
              {stats.totalCx.toLocaleString('pt-BR')}
            </span>
            <span className="text-[10px] sm:text-[11px] text-zinc-400 mt-1">
              Volume em cx apuradas
            </span>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Total em Unidades
            </span>
            <span className="text-xl sm:text-3xl font-black text-blue-700 mt-1 leading-none">
              {stats.totalUnid.toLocaleString('pt-BR')}
            </span>
            <span className="text-[10px] sm:text-[11px] text-zinc-400 mt-1">
              Convertidas pelo fator
            </span>
          </div>

          <div className="bg-white p-3 sm:p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Com Coordenadas GPS
            </span>
            <span className="text-xl sm:text-3xl font-black text-teal-700 mt-1 leading-none">
              {stats.itemsComGps} / {stats.totalItens}
            </span>
            <span className="text-[10px] sm:text-[11px] text-zinc-400 mt-1">
              {stats.totalItens > 0
                ? `${Math.round((stats.itemsComGps / stats.totalItens) * 100)}% auditados com GPS`
                : '100% de precisão'}
            </span>
          </div>
        </div>

        {/* Formulário de Registro com Campos: Código do Produto, Pallet, Lastro, Caixa, Unidade */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-3.5 sm:p-6 mb-5 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 sm:pb-4 border-b border-zinc-100 mb-4 gap-2">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                <Plus className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-sm sm:text-lg font-bold text-zinc-900 leading-tight">
                  Registrar Nova Contagem Física com GPS
                </h2>
                <p className="text-[11px] sm:text-xs text-zinc-500">
                  Informe Código do Produto, Pallet, Lastro, Caixa e Unidade.
                </p>
              </div>
            </div>

            {/* GPS Indicator no formulário (visível tanto no desktop quanto no celular) */}
            <div className="self-start sm:self-auto flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold">
              <Crosshair className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
              <span>
                {gps.lat !== null
                  ? `GPS Ativo: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)} (±${gps.accuracy}m)`
                  : 'Obtendo GPS...'}
              </span>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            {/* Campo 1: Código do Produto (Busca & Seleção) */}
            <div className="relative">
              <label className="block text-[11px] sm:text-xs font-bold text-zinc-700 uppercase mb-1">
                Código do Produto (Buscar por Código ou Descrição) *
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-zinc-400" />
                <input
                  type="text"
                  inputMode="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedProduct && e.target.value !== selectedProduct.d) {
                      setSelectedProduct(null);
                    }
                  }}
                  placeholder="Digite o código (ex: 25303) ou o nome do produto..."
                  className="w-full pl-9 pr-8 py-2.5 sm:py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-base sm:text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedProduct(null);
                    }}
                    className="absolute right-2.5 top-3 text-zinc-400 hover:text-zinc-600 p-1"
                    title="Limpar busca"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {filteredProductOptions.length > 0 && !selectedProduct && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-zinc-100">
                  {filteredProductOptions.map((prod) => (
                    <button
                      key={prod.c}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(prod);
                        setSearchQuery(`${prod.c} - ${prod.d}`);
                      }}
                      className="w-full text-left px-3 py-3 hover:bg-emerald-50 active:bg-emerald-100 flex items-center justify-between text-xs cursor-pointer transition min-h-[44px]"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-emerald-700 font-mono mr-2">
                          #{prod.c}
                        </span>
                        <span className="font-medium text-zinc-800 break-words">{prod.d}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded font-mono">
                        Fator: {prod.H} {prod.t}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Informação do produto selecionado com padrão de palete configurável */}
              {selectedProduct && (
                <div className="mt-2 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-emerald-900 font-mono bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                        #{selectedProduct.c}
                      </span>
                      <span className="font-bold text-emerald-950 break-words">{selectedProduct.d}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-emerald-800 flex-wrap">
                      <span>Embalagem: <b>1 Cx = {fatorEmbalagem} unid</b></span>
                      <span>•</span>
                      <span>
                        Palete: <b>{cxPorLastro} cx/lastro</b> × <b>{lastrosPorPallet} lastros</b> ={' '}
                        <b className="text-emerald-900 font-bold">{cxPorPalletTotal} cx/palete</b>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setShowPalletConfig(!showPalletConfig)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg transition flex items-center gap-1 cursor-pointer min-h-[32px]"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                      <span>{showPalletConfig ? 'Ocultar Padrão' : 'Ajustar Lastro'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProduct(null);
                        setSearchQuery('');
                      }}
                      className="px-2 py-1 text-[11px] font-semibold text-zinc-600 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-lg transition cursor-pointer min-h-[32px]"
                      title="Trocar de produto"
                    >
                      Trocar
                    </button>
                  </div>
                </div>
              )}

              {/* Painel expansível de personalização de lastro e camadas por palete */}
              {selectedProduct && showPalletConfig && (
                <div className="mt-2 p-3 bg-zinc-100 border border-zinc-300 rounded-xl text-xs space-y-2">
                  <div className="font-bold text-zinc-700 flex items-center gap-1">
                    <Boxes className="w-4 h-4 text-emerald-600" />
                    <span>Configuração de Empilhamento do Palete para este Produto:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Caixas por Lastro (Camada)
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={cxPorLastro}
                        onChange={(e) => handleSavePalletConfig(Math.max(1, parseInt(e.target.value) || 1), lastrosPorPallet)}
                        className="w-full px-2.5 py-2 bg-white border border-zinc-300 rounded-lg text-base sm:text-xs font-bold text-zinc-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Lastros por Pallet (Altura / Camadas)
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={lastrosPorPallet}
                        onChange={(e) => handleSavePalletConfig(cxPorLastro, Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full px-2.5 py-2 bg-white border border-zinc-300 rounded-lg text-base sm:text-xs font-bold text-zinc-900"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-500 italic">
                    * Total calculado: {cxPorLastro} cx/lastro × {lastrosPorPallet} lastros = {cxPorLastro * lastrosPorPallet} caixas em 1 palete completo.
                  </p>
                </div>
              )}
            </div>

            {/* Grid dos 4 campos: Pallet, Lastro, Caixa e Unidade (Otimizado para toque no celular) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              {/* Campo 2: Pallet */}
              <div className="bg-zinc-50 p-2.5 sm:p-3 rounded-xl border border-zinc-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] sm:text-xs font-bold text-zinc-800 uppercase flex items-center gap-1">
                      <Boxes className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Pallet</span>
                    </label>
                    <span className="text-[9px] sm:text-[10px] text-zinc-500 font-medium">
                      {cxPorPalletTotal} cx/plt
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={pallet}
                    onChange={(e) => setPallet(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 sm:px-3 py-2 bg-white border border-zinc-300 rounded-lg text-lg sm:text-base font-black text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition h-11 sm:h-10 text-center"
                  />
                </div>
                {/* Atalhos Rápidos com botões de toque */}
                <div className="mt-1.5">
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 5, 10].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          const cur = parseFloat(pallet) || 0;
                          setPallet(String(cur + val));
                        }}
                        className="py-1 text-[11px] font-bold bg-white active:bg-emerald-200 text-zinc-700 active:text-emerald-900 rounded border border-zinc-200 transition cursor-pointer min-h-[30px]"
                      >
                        +{val}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-400">
                    <span>Paletes cheios</span>
                    {pallet && (
                      <button
                        type="button"
                        onClick={() => setPallet('')}
                        className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                      >
                        Zerar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Campo 3: Lastro */}
              <div className="bg-zinc-50 p-2.5 sm:p-3 rounded-xl border border-zinc-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] sm:text-xs font-bold text-zinc-800 uppercase flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>Lastro</span>
                    </label>
                    <span className="text-[9px] sm:text-[10px] text-zinc-500 font-medium">
                      {cxPorLastro} cx/lst
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={lastro}
                    onChange={(e) => setLastro(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 sm:px-3 py-2 bg-white border border-zinc-300 rounded-lg text-lg sm:text-base font-black text-teal-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition h-11 sm:h-10 text-center"
                  />
                </div>
                {/* Atalhos Rápidos */}
                <div className="mt-1.5">
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          const cur = parseFloat(lastro) || 0;
                          setLastro(String(cur + val));
                        }}
                        className="py-1 text-[11px] font-bold bg-white active:bg-teal-200 text-zinc-700 active:text-teal-900 rounded border border-zinc-200 transition cursor-pointer min-h-[30px]"
                      >
                        +{val}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-400">
                    <span>Camadas soltas</span>
                    {lastro && (
                      <button
                        type="button"
                        onClick={() => setLastro('')}
                        className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                      >
                        Zerar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Campo 4: Caixa */}
              <div className="bg-zinc-50 p-2.5 sm:p-3 rounded-xl border border-zinc-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] sm:text-xs font-bold text-zinc-800 uppercase flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>Caixa</span>
                    </label>
                    <span className="text-[9px] sm:text-[10px] text-zinc-500 font-medium">
                      {fatorEmbalagem} un/cx
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={caixa}
                    onChange={(e) => setCaixa(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 sm:px-3 py-2 bg-white border border-zinc-300 rounded-lg text-lg sm:text-base font-black text-blue-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition h-11 sm:h-10 text-center"
                  />
                </div>
                {/* Atalhos Rápidos */}
                <div className="mt-1.5">
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 5, 10, 20].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          const cur = parseFloat(caixa) || 0;
                          setCaixa(String(cur + val));
                        }}
                        className="py-1 text-[11px] font-bold bg-white active:bg-blue-200 text-zinc-700 active:text-blue-900 rounded border border-zinc-200 transition cursor-pointer min-h-[30px]"
                      >
                        +{val}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-400">
                    <span>Caixas avulsas</span>
                    {caixa && (
                      <button
                        type="button"
                        onClick={() => setCaixa('')}
                        className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                      >
                        Zerar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Campo 5: Unidade */}
              <div className="bg-zinc-50 p-2.5 sm:p-3 rounded-xl border border-zinc-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] sm:text-xs font-bold text-zinc-800 uppercase flex items-center gap-1">
                      <Box className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Unidade</span>
                    </label>
                    <span className="text-[9px] sm:text-[10px] text-zinc-500 font-medium">
                      Avulsas
                    </span>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    placeholder="0"
                    className="w-full px-2.5 sm:px-3 py-2 bg-white border border-zinc-300 rounded-lg text-lg sm:text-base font-black text-amber-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition h-11 sm:h-10 text-center"
                  />
                </div>
                {/* Atalhos Rápidos */}
                <div className="mt-1.5">
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 6, 12].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          const cur = parseFloat(unidade) || 0;
                          setUnidade(String(cur + val));
                        }}
                        className="py-1 text-[11px] font-bold bg-white active:bg-amber-200 text-zinc-700 active:text-amber-900 rounded border border-zinc-200 transition cursor-pointer min-h-[30px]"
                      >
                        +{val}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-400">
                    <span>Garrafas/latas</span>
                    {unidade && (
                      <button
                        type="button"
                        onClick={() => setUnidade('')}
                        className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                      >
                        Zerar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Resumo da Apuração em Tempo Real */}
            {(pNum > 0 || lNum > 0 || cNum > 0 || uNum > 0) && (
              <div className="p-3 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                <div className="space-y-0.5">
                  <span className="font-bold text-emerald-900 uppercase text-[10px] tracking-wide block">
                    Cálculo da Apuração em Tempo Real
                  </span>
                  <div className="text-zinc-700 flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
                    {pNum > 0 && (
                      <span className="bg-white px-1.5 py-0.5 rounded border border-zinc-200">
                        <b>{pNum}</b> plt ({cxDePallets} cx)
                      </span>
                    )}
                    {lNum > 0 && (
                      <span className="bg-white px-1.5 py-0.5 rounded border border-zinc-200">
                        + <b>{lNum}</b> lst ({cxDeLastros} cx)
                      </span>
                    )}
                    {cNum > 0 && (
                      <span className="bg-white px-1.5 py-0.5 rounded border border-zinc-200">
                        + <b>{cNum}</b> cx avulsa
                      </span>
                    )}
                    {uNum > 0 && (
                      <span className="bg-white px-1.5 py-0.5 rounded border border-zinc-200">
                        + <b>{uNum}</b> unid avulsa
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:gap-4 bg-white px-3 py-2 rounded-xl border border-emerald-300 shadow-xs">
                  <div>
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase block">Total Caixas</span>
                    <span className="text-base sm:text-lg font-black text-emerald-700 leading-tight">
                      {totalCxCalculado.toLocaleString('pt-BR')} cx
                    </span>
                  </div>
                  <div className="w-px h-8 bg-zinc-200" />
                  <div>
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase block">Total Unidades</span>
                    <span className="text-base sm:text-lg font-black text-blue-700 leading-tight">
                      {totalUnidCalculado.toLocaleString('pt-BR')} unid
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botão de Registro com GPS */}
          <div className="mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-[11px] sm:text-xs text-zinc-500 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                As coordenadas GPS e data/hora serão gravadas junto ao item.
              </span>
            </div>

            <button
              onClick={handleRegistrarContagem}
              className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 active:from-emerald-700 active:to-teal-800 text-white font-black rounded-xl text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
            >
              <MapPin className="w-5 h-5 text-amber-300 shrink-0" />
              <span>REGISTRAR COM COORDENADAS GPS 📍</span>
            </button>
          </div>
        </div>

        {/* Bloco 2: Ações de Exportação, Mapa Geral e Auditoria */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-bold text-zinc-900 flex items-center gap-2">
              Histórico de Produtos Contados
              <span className="text-xs font-semibold bg-zinc-200 text-zinc-800 px-2.5 py-0.5 rounded-full">
                {filteredItems.length} registros
              </span>
            </h3>
          </div>

          {/* Botões de Ação Responsivos (Grid 2 colunas no celular, inline no desktop) */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {/* Botão Ver Mapa Geral */}
            <button
              onClick={() => setIsMapModalOpen(true)}
              disabled={items.length === 0}
              className="px-3 py-2.5 bg-teal-800 hover:bg-teal-700 active:bg-teal-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40 min-h-[42px]"
              title="Visualizar mapa com pinos dos produtos contados"
            >
              <Compass className="w-4 h-4 text-teal-300 shrink-0" />
              <span>Ver Mapa ({stats.itemsComGps})</span>
            </button>

            {/* Botão Exportar Excel */}
            <button
              onClick={handleExportXLSX}
              disabled={items.length === 0}
              className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40 min-h-[42px]"
              title="Baixar planilha Excel com Pallet, Lastro, Caixa, Unidade e coordenadas GPS"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Exportar Excel</span>
            </button>

            {/* Botão Aplicar ao Estoque Físico */}
            <button
              onClick={() => setShowApplyConfirmModal(true)}
              disabled={items.length === 0}
              className="px-3 py-2.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40 min-h-[42px]"
              title="Atualiza a coluna de inventário físico com os dados desta contagem"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-200 shrink-0" />
              <span>Aplicar Estoque</span>
            </button>

            {/* Limpar Tudo */}
            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer min-h-[42px]"
                title="Limpar todos os registros de contagem"
              >
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Limpar Todos</span>
              </button>
            )}
          </div>
        </div>

        {/* Campo de Filtro rápido na lista */}
        <div className="mb-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrar por código ou descrição do produto..."
              className="w-full pl-9 pr-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
          </div>
        </div>

        {/* Exibição dos Produtos Contados: Desktop (Tabela) e Mobile (Cards Responsivos) */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-zinc-400">
              <MapPin className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 text-zinc-300 stroke-1" />
              <p className="text-sm font-semibold text-zinc-600">
                Nenhum produto registrado na contagem com GPS ainda.
              </p>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                Utilize o formulário acima para pesquisar um item e gravar sua primeira contagem com geolocalização.
              </p>
            </div>
          ) : (
            <>
              {/* VERSÃO MOBILE: Cards Otimizados para Celular (visível apenas em telas menores que MD) */}
              <div className="block md:hidden divide-y divide-zinc-200">
                {filteredItems.map((item, index) => {
                  const hasCoords = item.lat !== 0 && item.lng !== 0;

                  return (
                    <div key={item.id} className="p-3.5 space-y-2.5 hover:bg-zinc-50 transition">
                      {/* Topo do Card: Código, Ordem e Botão Excluir */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-zinc-400 font-semibold">
                            #{index + 1}
                          </span>
                          <span className="font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300 text-xs">
                            COD {item.cod}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {item.dataHora}
                          </span>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 active:bg-rose-100 rounded-lg transition cursor-pointer"
                            title="Excluir este registro"
                          >
                            <Trash2 className="w-4 h-4 text-rose-500" />
                          </button>
                        </div>
                      </div>

                      {/* Nome do Produto */}
                      <h4 className="text-sm font-bold text-zinc-900 leading-tight">
                        {item.desc}
                      </h4>

                      {/* Grid de 4 Valores: Pallet, Lastro, Caixa e Unidade */}
                      <div className="grid grid-cols-4 gap-1.5 text-center">
                        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-1.5">
                          <span className="text-[9px] font-bold text-emerald-700 uppercase block">Pallet</span>
                          <span className="text-xs font-black text-emerald-950 font-mono">
                            {item.pallet && item.pallet > 0 ? `${item.pallet} plt` : '-'}
                          </span>
                        </div>

                        <div className="bg-teal-50/70 border border-teal-200/80 rounded-lg p-1.5">
                          <span className="text-[9px] font-bold text-teal-700 uppercase block">Lastro</span>
                          <span className="text-xs font-black text-teal-950 font-mono">
                            {item.lastro && item.lastro > 0 ? `${item.lastro} lst` : '-'}
                          </span>
                        </div>

                        <div className="bg-blue-50/70 border border-blue-200/80 rounded-lg p-1.5">
                          <span className="text-[9px] font-bold text-blue-700 uppercase block">Caixa</span>
                          <span className="text-xs font-black text-blue-950 font-mono">
                            {item.caixa && item.caixa > 0 ? `${item.caixa} cx` : '-'}
                          </span>
                        </div>

                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-lg p-1.5">
                          <span className="text-[9px] font-bold text-amber-700 uppercase block">Unidade</span>
                          <span className="text-xs font-black text-amber-950 font-mono">
                            {item.unidade && item.unidade > 0 ? `${item.unidade} un` : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Destaque do Total Apurado */}
                      <div className="flex items-center justify-between bg-zinc-100/80 px-3 py-2 rounded-xl text-xs">
                        <span className="font-bold text-zinc-600 uppercase text-[10px]">Total Calculado</span>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-emerald-700 font-mono text-sm">
                            {item.qtdCx.toLocaleString('pt-BR')} cx
                          </span>
                          <span className="text-zinc-300">•</span>
                          <span className="font-bold text-blue-700 font-mono text-xs">
                            {item.qtdUnid.toLocaleString('pt-BR')} unid
                          </span>
                        </div>
                      </div>

                      {/* Geolocalização GPS e Botão Google Maps */}
                      <div className="flex items-center justify-between pt-1 gap-2">
                        {hasCoords ? (
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className="font-mono text-[11px] text-zinc-700 font-semibold flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                            </span>
                            {getAccuracyBadge(item.accuracy)}
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-xs italic">Sem GPS</span>
                        )}

                        {hasCoords && (
                          <a
                            href={item.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-xs min-h-[34px]"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir no Maps</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* VERSÃO DESKTOP: Tabela Completa (visível a partir de md) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200 uppercase tracking-wider">
                      <th className="p-3 text-center w-12">#</th>
                      <th className="p-3">Código & Descrição</th>
                      <th className="p-3 text-center">Pallet</th>
                      <th className="p-3 text-center">Lastro</th>
                      <th className="p-3 text-center">Caixa</th>
                      <th className="p-3 text-center">Unidade</th>
                      <th className="p-3 text-right">Total Cx</th>
                      <th className="p-3 text-right">Total Unid</th>
                      <th className="p-3">Data / Hora</th>
                      <th className="p-3">Geolocalização (GPS)</th>
                      <th className="p-3 text-center">Google Maps</th>
                      <th className="p-3 text-center w-12">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {filteredItems.map((item, index) => {
                      const hasCoords = item.lat !== 0 && item.lng !== 0;

                      return (
                        <tr key={item.id} className="hover:bg-zinc-50 transition">
                          <td className="p-3 text-center text-zinc-400 font-mono">
                            {index + 1}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                #{item.cod}
                              </span>
                              <span className="font-bold text-zinc-900">{item.desc}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-800">
                            {item.pallet !== undefined && item.pallet > 0 ? (
                              <span className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                {item.pallet} plt
                              </span>
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-teal-800">
                            {item.lastro !== undefined && item.lastro > 0 ? (
                              <span className="bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                {item.lastro} lst
                              </span>
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-blue-800">
                            {item.caixa !== undefined && item.caixa > 0 ? (
                              <span className="bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                {item.caixa} cx
                              </span>
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-amber-800">
                            {item.unidade !== undefined && item.unidade > 0 ? (
                              <span className="bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {item.unidade} un
                              </span>
                            ) : (
                              <span className="text-zinc-300">-</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-black text-sm text-emerald-700">
                            {item.qtdCx.toLocaleString('pt-BR')} cx
                          </td>
                          <td className="p-3 text-right font-bold text-zinc-700">
                            {item.qtdUnid.toLocaleString('pt-BR')} unid
                          </td>
                          <td className="p-3 text-zinc-600 whitespace-nowrap font-mono text-[11px]">
                            {item.dataHora}
                          </td>
                          <td className="p-3">
                            {hasCoords ? (
                              <div className="flex flex-col gap-1">
                                <div className="font-mono text-[11px] text-zinc-800 font-semibold flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  {item.lat.toFixed(6)}, {item.lng.toFixed(6)}
                                </div>
                                <div>{getAccuracyBadge(item.accuracy)}</div>
                              </div>
                            ) : (
                              <span className="text-zinc-400 italic">Sem GPS</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {hasCoords ? (
                              <a
                                href={item.mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition"
                                title="Abrir no Google Maps"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Ver no Maps</span>
                              </a>
                            ) : (
                              <span className="text-zinc-400 text-xs">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                              title="Excluir este registro"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL: Visualizador de Mapa Geral dos Produtos */}
      {isMapModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-6 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-zinc-200">
            {/* Cabeçalho do Modal */}
            <div className="p-3.5 sm:p-4 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-emerald-400 shrink-0" />
                <h3 className="font-bold text-sm sm:text-base">Mapa Geográfico da Contagem</h3>
                <span className="text-[10px] sm:text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40">
                  {stats.itemsComGps} pontos
                </span>
              </div>
              <button
                onClick={() => setIsMapModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1.5 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-3 sm:p-4 overflow-y-auto flex-1 flex flex-col gap-3 sm:gap-4">
              <div className="bg-emerald-50 border border-emerald-200 p-2.5 sm:p-3 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-xs sm:text-sm">
                    Auditoria de Campo e Rastreabilidade Geográfica
                  </p>
                  <p className="mt-0.5 text-emerald-800 text-[11px] sm:text-xs">
                    Toque em qualquer ponto abaixo para abrir o local exato com pino no aplicativo Google Maps do celular.
                  </p>
                </div>
              </div>

              {/* Lista de pontos e coordenadas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 max-h-[60vh] overflow-y-auto p-0.5">
                {items
                  .filter((it) => it.lat !== 0 && it.lng !== 0)
                  .map((it) => (
                    <div
                      key={it.id}
                      className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl hover:border-emerald-500 transition flex flex-col justify-between shadow-xs"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">
                            #{it.cod}
                          </span>
                          <span className="text-xs font-bold text-zinc-800">
                            {it.qtdCx} cx ({it.qtdUnid} unid)
                          </span>
                        </div>
                        <h4 className="font-bold text-xs sm:text-sm text-zinc-900 line-clamp-1">
                          {it.desc}
                        </h4>
                        <div className="text-[11px] text-zinc-600 flex items-center gap-1.5 mt-1.5 font-mono flex-wrap">
                          {it.pallet ? <span className="bg-white px-1.5 py-0.5 rounded border border-zinc-200">{it.pallet} plt</span> : null}
                          {it.lastro ? <span className="bg-white px-1.5 py-0.5 rounded border border-zinc-200">{it.lastro} lst</span> : null}
                          {it.caixa ? <span className="bg-white px-1.5 py-0.5 rounded border border-zinc-200">{it.caixa} cx</span> : null}
                          {it.unidade ? <span className="bg-white px-1.5 py-0.5 rounded border border-zinc-200">{it.unidade} un</span> : null}
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-1.5">
                          <span>📍 {it.lat.toFixed(5)}, {it.lng.toFixed(5)}</span>
                          {it.accuracy && <span>(±{it.accuracy}m)</span>}
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-zinc-200 flex items-center justify-between">
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {it.dataHora}
                        </span>
                        <a
                          href={it.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition min-h-[32px]"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Abrir no Google Maps</span>
                        </a>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="p-3 bg-zinc-100 border-t border-zinc-200 flex justify-end">
              <button
                onClick={() => setIsMapModalOpen(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-white text-xs font-bold rounded-xl transition cursor-pointer min-h-[40px]"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmação de Aplicação no Estoque Físico */}
      {showApplyConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-4 sm:p-6 border border-zinc-200">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <span className="p-2 sm:p-2.5 bg-amber-100 rounded-xl shrink-0">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-700" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-zinc-900 leading-tight">
                Aplicar Contagem ao Estoque Físico
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-zinc-600 mb-3 leading-relaxed">
              Deseja atualizar a coluna de <b>Inventário Físico (coluna b)</b> de{' '}
              <b>{stats.distinctCodigos} produtos</b> no sistema principal com as quantidades apuradas nesta contagem de campo?
            </p>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 mb-4">
              Esta ação irá substituir as quantidades físicas atuais desses produtos pelos totais contados aqui com validação de GPS.
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                onClick={() => setShowApplyConfirmModal(false)}
                className="w-full sm:w-auto px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold rounded-xl transition cursor-pointer min-h-[42px]"
              >
                Cancelar
              </button>
              <button
                onClick={handleAplicarAoEstoque}
                className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5 min-h-[42px]"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar e Atualizar Estoque</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
