import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { RawData, CalculatedProduct, ContagemGpsItem, ResRow } from '../data/types';
import {
  MapPin,
  Navigation,
  Crosshair,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
  Plus,
  Search,
  ExternalLink,
  Layers,
  ArrowRight,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  X,
  Info,
  Check,
  Building2,
  UserCheck
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
  const [autoTracking, setAutoTracking] = useState(true);

  // Formulário de Registro
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CalculatedProduct | null>(null);
  const [qtdCx, setQtdCx] = useState<string>('');
  const [qtdUnid, setQtdUnid] = useState<string>('');
  const [setor, setSetor] = useState<string>('');
  const [operador, setOperador] = useState<string>(() => localStorage.getItem('contagem_operador') || '');
  const [observacao, setObservacao] = useState<string>('');

  // Filtros e busca na tabela de contagens realizadas
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedMapItem, setSelectedMapItem] = useState<ContagemGpsItem | null>(null);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [showApplyConfirmModal, setShowApplyConfirmModal] = useState(false);

  // Salva nome do operador para os próximos registros
  useEffect(() => {
    if (operador) {
      localStorage.setItem('contagem_operador', operador);
    }
  }, [operador]);

  // Função para capturar GPS único com alta precisão
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGps((prev) => ({
        ...prev,
        error: 'Geolocalização não é suportada pelo seu navegador/dispositivo.',
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
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
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

  // Monitoramento contínuo em segundo plano quando ativo
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
    const totalCx = items.reduce((acc, it) => acc + it.qtdCx, 0);
    const totalUnid = items.reduce((acc, it) => acc + it.qtdUnid, 0);
    const distinctCodigos = new Set(items.map((it) => it.cod)).size;
    const itemsComGps = items.filter((it) => it.lat !== 0 && it.lng !== 0).length;
    return { totalItens, totalCx, totalUnid, distinctCodigos, itemsComGps };
  }, [items]);

  // Filtra itens na tabela
  const filteredItems = useMemo(() => {
    if (!filterQuery.trim()) return items;
    const q = filterQuery.toLowerCase().trim();
    return items.filter(
      (it) =>
        it.cod.toString().includes(q) ||
        it.desc.toLowerCase().includes(q) ||
        (it.setor && it.setor.toLowerCase().includes(q)) ||
        (it.operador && it.operador.toLowerCase().includes(q)) ||
        (it.observacao && it.observacao.toLowerCase().includes(q))
    );
  }, [items, filterQuery]);

  // Registrar contagem com GPS
  const handleRegistrarContagem = () => {
    if (!selectedProduct) {
      alert('Por favor, selecione um produto antes de registrar.');
      return;
    }

    const cxNum = parseFloat(qtdCx.replace(',', '.')) || 0;
    const unidAvulsas = parseFloat(qtdUnid.replace(',', '.')) || 0;
    const fator = selectedProduct.H > 0 ? selectedProduct.H : 1;
    const totalUnidades = Math.round(cxNum * fator + unidAvulsas);

    if (cxNum <= 0 && unidAvulsas <= 0) {
      alert('Informe a quantidade de caixas ou unidades contadas.');
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
      fatorCx: fator,
      qtdCx: cxNum,
      qtdUnid: totalUnidades,
      observacao: observacao.trim() || undefined,
      setor: setor.trim() || undefined,
      operador: operador.trim() || undefined,
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
    setQtdCx('');
    setQtdUnid('');
    setObservacao('');
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

  // Exportar para Excel (.xlsx) com todas as coordenadas, precisão e link do Google Maps
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
      'Qtd Cx': it.qtdCx,
      'Total Unidades': it.qtdUnid,
      'Setor / Localização Armazém': it.setor || '-',
      'Operador': it.operador || '-',
      'Data e Hora do Registro': it.dataHora,
      'Latitude': it.lat !== 0 ? it.lat : 'Não capturado',
      'Longitude': it.lng !== 0 ? it.lng : 'Não capturado',
      'Precisão GPS (metros)': it.accuracy ? `±${it.accuracy}m` : '-',
      'Altitude (m)': it.altitude ? `${it.altitude}m` : '-',
      'Link Google Maps': it.mapsUrl || '-',
      'Observação': it.observacao || '-',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contagem_GPS');

    const fileName = `Contagem_Estoque_GPS_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Helper para cor da precisão do GPS
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
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-zinc-900 text-white p-4 sm:p-6 shadow-md border-b border-teal-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-500 text-zinc-950 rounded-lg shadow-inner">
                <MapPin className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  Contagem em Campo com GPS
                  <span className="text-xs font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    Geolocalização Ativa
                  </span>
                </h1>
                <p className="text-xs sm:text-sm text-zinc-300">
                  Rastreamento geográfico exato de onde cada produto do estoque físico foi bipado ou contado no galpão/loja
                </p>
              </div>
            </div>
          </div>

          {/* Card do Sinal GPS em Tempo Real */}
          <div className="bg-zinc-950/70 border border-teal-500/30 rounded-xl p-3 sm:px-4 sm:py-3 flex items-center justify-between gap-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div
                className={`w-3.5 h-3.5 rounded-full transition-all ${
                  gps.loading
                    ? 'bg-amber-400 animate-ping'
                    : gps.lat !== null
                    ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]'
                    : 'bg-rose-500'
                }`}
              />
              <div>
                <div className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                  {gps.loading
                    ? 'Buscando satélites GPS...'
                    : gps.lat !== null
                    ? 'GPS Conectado'
                    : 'Aguardando GPS'}
                  {gps.lat !== null && gps.accuracy !== null && (
                    <span className="text-[10px] font-normal text-emerald-400 bg-emerald-950/60 border border-emerald-600/40 px-1.5 py-0.5 rounded">
                      ±{gps.accuracy}m
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-400 font-mono">
                  {gps.lat !== null && gps.lng !== null
                    ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`
                    : 'Clique em "Atualizar GPS"'}
                </div>
              </div>
            </div>

            <button
              onClick={requestLocation}
              disabled={gps.loading}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-sm cursor-pointer disabled:opacity-50"
              title="Forçar atualização da posição GPS atual"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${gps.loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar GPS</span>
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
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6">
        {/* Painel de Métricas Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Registros Gravados
            </span>
            <span className="text-2xl sm:text-3xl font-black text-zinc-900 mt-1">
              {stats.totalItens}
            </span>
            <span className="text-[11px] text-zinc-400 mt-0.5">
              {stats.distinctCodigos} produtos distintos
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Total em Caixas
            </span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-700 mt-1">
              {stats.totalCx.toLocaleString('pt-BR')}
            </span>
            <span className="text-[11px] text-zinc-400 mt-0.5">
              Volume em cx físicas
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Total em Unidades
            </span>
            <span className="text-2xl sm:text-3xl font-black text-blue-700 mt-1">
              {stats.totalUnid.toLocaleString('pt-BR')}
            </span>
            <span className="text-[11px] text-zinc-400 mt-0.5">
              Convertidas pelo fator
            </span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm flex flex-col">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Com Coordenadas GPS
            </span>
            <span className="text-2xl sm:text-3xl font-black text-teal-700 mt-1">
              {stats.itemsComGps} / {stats.totalItens}
            </span>
            <span className="text-[11px] text-zinc-400 mt-0.5">
              {stats.totalItens > 0
                ? `${Math.round((stats.itemsComGps / stats.totalItens) * 100)}% auditados com GPS`
                : '100% de precisão'}
            </span>
          </div>
        </div>

        {/* Bloco 1: Formulário de Registro Rápido */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Plus className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-900 leading-tight">
                  Registrar Nova Contagem Física com GPS
                </h2>
                <p className="text-xs text-zinc-500">
                  Selecione o produto, insira as caixas e clique no botão para capturar a posição do celular instantaneamente.
                </p>
              </div>
            </div>

            {/* GPS Indicator no formulário */}
            <div className="hidden md:flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <Crosshair className="w-4 h-4 text-emerald-600 animate-spin" />
              <span>
                {gps.lat !== null
                  ? `GPS Ativo: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)} (±${gps.accuracy}m)`
                  : 'Obtendo GPS...'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Campo 1: Busca de Produto */}
            <div className="md:col-span-6 relative">
              <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                Buscar Produto (Código ou Descrição) *
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedProduct && e.target.value !== selectedProduct.d) {
                      setSelectedProduct(null);
                    }
                  }}
                  placeholder="Ex: 25303 ou HEINEKEN ou SKOL..."
                  className="w-full pl-9 pr-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>

              {/* Autocomplete Dropdown */}
              {filteredProductOptions.length > 0 && !selectedProduct && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                  {filteredProductOptions.map((prod) => (
                    <button
                      key={prod.c}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(prod);
                        setSearchQuery(`${prod.c} - ${prod.d}`);
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b border-zinc-100 flex items-center justify-between text-xs cursor-pointer transition"
                    >
                      <div>
                        <span className="font-bold text-emerald-700 font-mono mr-2">
                          #{prod.c}
                        </span>
                        <span className="font-medium text-zinc-800">{prod.d}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded font-mono">
                        Fator: {prod.H} {prod.t}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Informação do produto selecionado */}
              {selectedProduct && (
                <div className="mt-2 p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-emerald-900 font-mono mr-1.5">
                      #{selectedProduct.c}
                    </span>
                    <span className="font-medium text-emerald-950">{selectedProduct.d}</span>
                  </div>
                  <span className="font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    1 Cx = {selectedProduct.H} unid
                  </span>
                </div>
              )}
            </div>

            {/* Campo 2: Quantidade de Caixas */}
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                Qtd. Caixas (Cx) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={qtdCx}
                onChange={(e) => setQtdCx(e.target.value)}
                placeholder="Ex: 50"
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-lg text-sm font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
              {/* Botões de atalho rápido */}
              <div className="flex gap-1.5 mt-1.5">
                {[1, 5, 10, 25, 50].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      const cur = parseFloat(qtdCx) || 0;
                      setQtdCx(String(cur + val));
                    }}
                    className="px-2 py-0.5 text-[10px] font-bold bg-zinc-100 hover:bg-emerald-100 text-zinc-700 hover:text-emerald-800 rounded border border-zinc-200 transition cursor-pointer"
                  >
                    +{val}
                  </button>
                ))}
              </div>
            </div>

            {/* Campo 3: Unidades Avulsas */}
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                Unidades Avulsas (Opcional)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={qtdUnid}
                onChange={(e) => setQtdUnid(e.target.value)}
                placeholder="Ex: 6"
                className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-300 rounded-lg text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
              <span className="text-[10px] text-zinc-400 block mt-1">
                Garrafas ou latas fora da caixa
              </span>
            </div>

            {/* Campo 4: Setor / Rua do Galpão */}
            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                Setor / Rua do Galpão
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                <input
                  type="text"
                  value={setor}
                  onChange={(e) => setSetor(e.target.value)}
                  placeholder="Ex: Rua A - Palete 12 ou Pátio"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Campo 5: Operador / Conferente */}
            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                Conferente / Operador
              </label>
              <div className="relative">
                <UserCheck className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
                <input
                  type="text"
                  value={operador}
                  onChange={(e) => setOperador(e.target.value)}
                  placeholder="Ex: João / Conferente 01"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
                />
              </div>
            </div>

            {/* Campo 6: Observação */}
            <div className="md:col-span-4">
              <label className="block text-xs font-bold text-zinc-700 uppercase mb-1">
                Observação
              </label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: Palete misto, avarias, etc."
                className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Botão de Registro com GPS */}
          <div className="mt-5 pt-4 border-t border-zinc-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="text-xs text-zinc-500 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Ao clicar em registrar, a localização precisa do smartphone e o horário atual serão gravados junto ao produto.
              </span>
            </div>

            <button
              onClick={handleRegistrarContagem}
              className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold rounded-xl text-sm shadow-md hover:shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <MapPin className="w-5 h-5 text-amber-300" />
              <span>REGISTRAR COM COORDENADAS GPS 📍</span>
            </button>
          </div>
        </div>

        {/* Bloco 2: Ações de Exportação, Mapa Geral e Auditoria */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              Histórico de Produtos Contados
              <span className="text-xs font-semibold bg-zinc-200 text-zinc-800 px-2.5 py-0.5 rounded-full">
                {filteredItems.length} registros
              </span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Botão Ver Mapa Geral */}
            <button
              onClick={() => setIsMapModalOpen(true)}
              disabled={items.length === 0}
              className="px-3.5 py-2 bg-teal-800 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40"
              title="Visualizar mapa de calor e pinos dos produtos contados"
            >
              <Compass className="w-4 h-4 text-teal-300" />
              <span>Ver Mapa da Contagem</span>
            </button>

            {/* Botão Exportar Excel */}
            <button
              onClick={handleExportXLSX}
              disabled={items.length === 0}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40"
              title="Baixar planilha Excel com todas as colunas de GPS e links"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Exportar Excel (XLSX)</span>
            </button>

            {/* Botão Aplicar ao Estoque Físico */}
            <button
              onClick={() => setShowApplyConfirmModal(true)}
              disabled={items.length === 0}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-40"
              title="Atualiza a coluna de inventário físico com os dados desta contagem"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-200" />
              <span>Aplicar ao Estoque Físico</span>
            </button>

            {/* Limpar Tudo */}
            {items.length > 0 && (
              <button
                onClick={handleClearAll}
                className="p-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                title="Limpar todos os registros de contagem"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Campo de Filtro rápido na lista */}
        <div className="mb-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrar por código, descrição, setor, conferente ou observação..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
          </div>
        </div>

        {/* Tabela de Produtos Contados com Geolocalização */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center text-zinc-400">
              <MapPin className="w-12 h-12 mx-auto mb-3 text-zinc-300 stroke-1" />
              <p className="text-sm font-semibold text-zinc-600">
                Nenhum produto registrado na contagem com GPS ainda.
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Utilize o formulário acima para pesquisar um item e gravar sua primeira contagem com geolocalização.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200 uppercase tracking-wider">
                    <th className="p-3 text-center w-12">#</th>
                    <th className="p-3">Código & Descrição</th>
                    <th className="p-3 text-right">Qtd. Cx</th>
                    <th className="p-3 text-right">Total Unid</th>
                    <th className="p-3">Setor / Rua</th>
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
                          {item.observacao && (
                            <p className="text-[11px] text-zinc-500 italic mt-0.5">
                              Obs: {item.observacao}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-right font-black text-sm text-emerald-700">
                          {item.qtdCx.toLocaleString('pt-BR')} cx
                        </td>
                        <td className="p-3 text-right font-bold text-zinc-700">
                          {item.qtdUnid.toLocaleString('pt-BR')} unid
                        </td>
                        <td className="p-3">
                          {item.setor ? (
                            <span className="inline-flex items-center gap-1 font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded">
                              <Building2 className="w-3 h-3 text-zinc-500" />
                              {item.setor}
                            </span>
                          ) : (
                            <span className="text-zinc-400 italic">-</span>
                          )}
                          {item.operador && (
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              Por: {item.operador}
                            </div>
                          )}
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
          )}
        </div>
      </div>

      {/* MODAL: Visualizador de Mapa Geral dos Produtos */}
      {isMapModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-zinc-200">
            {/* Cabeçalho do Modal */}
            <div className="p-4 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base">Mapa Geográfico da Contagem</h3>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40">
                  {stats.itemsComGps} pontos mapeados
                </span>
              </div>
              <button
                onClick={() => setIsMapModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Auditoria de Campo e Rastreabilidade Geográfica
                  </p>
                  <p className="mt-0.5 text-emerald-800">
                    Clique em qualquer ponto abaixo para abrir o local exato com pino no Google Maps do seu celular ou computador.
                  </p>
                </div>
              </div>

              {/* Lista de pontos e coordenadas */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto p-1">
                {items
                  .filter((it) => it.lat !== 0 && it.lng !== 0)
                  .map((it) => (
                    <div
                      key={it.id}
                      className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl hover:border-emerald-500 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold font-mono text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded text-[11px]">
                            #{it.cod}
                          </span>
                          <span className="text-[11px] font-bold text-zinc-700">
                            {it.qtdCx} cx ({it.qtdUnid} unid)
                          </span>
                        </div>
                        <h4 className="font-bold text-xs text-zinc-900 line-clamp-1">
                          {it.desc}
                        </h4>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-1">
                          <span>📍 {it.lat.toFixed(5)}, {it.lng.toFixed(5)}</span>
                          {it.accuracy && <span>(±{it.accuracy}m)</span>}
                        </div>
                        {it.setor && (
                          <div className="text-[10px] text-zinc-600 mt-1 bg-zinc-100 inline-block px-1.5 py-0.5 rounded">
                            Setor: {it.setor}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-2 border-t border-zinc-200 flex items-center justify-between">
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {it.dataHora}
                        </span>
                        <a
                          href={it.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-sm transition"
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
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmação de Aplicação no Estoque Físico */}
      {showApplyConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-zinc-200">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <span className="p-2.5 bg-amber-100 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-amber-700" />
              </span>
              <h3 className="text-lg font-bold text-zinc-900 leading-tight">
                Aplicar Contagem ao Estoque Físico
              </h3>
            </div>

            <p className="text-xs text-zinc-600 mb-4 leading-relaxed">
              Deseja atualizar a coluna de <b>Inventário Físico (coluna b)</b> de{' '}
              <b>{stats.distinctCodigos} produtos</b> no sistema principal com as quantidades apuradas nesta contagem de campo?
            </p>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-900 mb-5">
              Esta ação irá substituir as quantidades físicas atuais desses produtos pelos totais contados aqui com validação de GPS.
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowApplyConfirmModal(false)}
                className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleAplicarAoEstoque}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
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
