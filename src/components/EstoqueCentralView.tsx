import React, { useState, useMemo, useRef, useEffect } from 'react';
import { EstoqueCentralData, ResRow, DashboardSnapshot, RawData, CalculatedProduct } from '../data/types';
import { readFileToText } from '../utils/importer020502';
import { SaveDaily020502Modal } from './SaveDaily020502Modal';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Save,
  RotateCcw,
  Download,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface EstoqueCentralViewProps {
  ec: EstoqueCentralData;
  res: ResRow[];
  data?: RawData;
  calculated?: CalculatedProduct[];
  snapshots?: DashboardSnapshot[];
  onSaveSnapshot?: (snapshot: DashboardSnapshot) => void;
  onDeleteSnapshot?: (id: string) => void;
  onDownloadSnapshot020502?: (snapshot: DashboardSnapshot) => void;
  onLoadSaved020502ToPlatform?: (snapshot: DashboardSnapshot) => void;
  onImport: (content: string, fileName: string) => void;
  importBannerHtml: string | null;
  onClearBanner: () => void;
  onNavigateToDashboard: () => void;
  onOpenImportModal?: () => void;
  onOpenImportPrecosModal?: () => void;
  onImportPrecos?: (content: string, fileName: string) => void;
  precosBannerHtml?: string | null;
  onClearPrecosBanner?: () => void;
  onImport020304?: (content: string, fileName: string) => void;
  ec0304BannerHtml?: string | null;
  onClearEc0304Banner?: () => void;
}

export const EstoqueCentralView: React.FC<EstoqueCentralViewProps> = ({
  ec,
  res,
  data,
  calculated = [],
  snapshots = [],
  onSaveSnapshot,
  onDeleteSnapshot,
  onDownloadSnapshot020502,
  onLoadSaved020502ToPlatform,
  onImport,
  importBannerHtml,
  onClearBanner,
  onNavigateToDashboard,
  onOpenImportModal,
  onOpenImportPrecosModal,
  onImportPrecos,
  precosBannerHtml,
  onClearPrecosBanner,
  onImport020304,
  ec0304BannerHtml,
  onClearEc0304Banner,
}) => {
  const [query, setQuery] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pastedPrecoText, setPastedPrecoText] = useState('');

  // =========================================================================
  // CALENDÁRIO POPOVER (IDÊNTICO AO MODELO SOLICITADO PELO USUÁRIO)
  // =========================================================================
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const calendarPopoverRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed

  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  // Data selecionada temporariamente dentro do popover do calendário
  const [pickedDateStr, setPickedDateStr] = useState<string>(todayStr);

  // Snapshot atualmente ativo na tela (se null, exibe a 02.05.02 ao vivo)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  // Modal para salvar a 02.05.02 do dia
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveModalInitialDate, setSaveModalInitialDate] = useState<string | undefined>(undefined);

  // Fecha o popover ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        calendarPopoverRef.current &&
        !calendarPopoverRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    }
    if (isCalendarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCalendarOpen]);

  // Mapeamento de snapshots por data "YYYY-MM-DD"
  const snapshotDateMap = useMemo(() => {
    const map = new Map<string, DashboardSnapshot[]>();
    snapshots.forEach((s) => {
      const list = map.get(s.date) || [];
      list.push(s);
      map.set(s.date, list);
    });
    return map;
  }, [snapshots]);

  // Snapshot atualmente ativo para visualização
  const activeSnapshot = useMemo(() => {
    if (!selectedSnapshotId) return null;
    return snapshots.find((s) => s.id === selectedSnapshotId) || null;
  }, [snapshots, selectedSnapshotId]);

  // Fonte efetiva de dados da 02.05.02 a ser exibida na tabela
  const displayedEc: EstoqueCentralData = useMemo(() => {
    if (activeSnapshot && activeSnapshot.ec && Array.isArray(activeSnapshot.ec.r)) {
      return activeSnapshot.ec;
    }
    return ec;
  }, [activeSnapshot, ec]);

  // Nomes dos meses em português (maiúsculas)
  const monthNamesUpper = [
    'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
    'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'
  ];

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Matriz de 42 células (6 linhas x 7 colunas) igualzinha ao modelo da imagem
  const calendarGrid = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = DOM, 1 = SEG ...
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days: {
      day: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      hasSnapshot: boolean;
      snapshotCount: number;
    }[] = [];

    // Dias do mês anterior
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const snaps = snapshotDateMap.get(dateStr) || [];
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        hasSnapshot: snaps.length > 0,
        snapshotCount: snaps.length,
      });
    }

    // Dias do mês atual
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const snaps = snapshotDateMap.get(dateStr) || [];
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        hasSnapshot: snaps.length > 0,
        snapshotCount: snaps.length,
      });
    }

    // Dias do próximo mês (completa 42 células = 6 linhas)
    const totalSlots = 42;
    const remaining = totalSlots - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const snaps = snapshotDateMap.get(dateStr) || [];
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        hasSnapshot: snaps.length > 0,
        snapshotCount: snaps.length,
      });
    }

    return days;
  }, [currentYear, currentMonth, snapshotDateMap, todayStr]);

  // Ação ao clicar no botão "APLICAR" do calendário
  const handleApplyCalendarDate = () => {
    if (!pickedDateStr) return;
    const daySnaps = snapshotDateMap.get(pickedDateStr) || [];
    if (daySnaps.length > 0) {
      const snap = daySnaps[0];
      setSelectedSnapshotId(snap.id);
      setIsCalendarOpen(false);
      // Carrega a 02.05.02 salva daquela data e atualiza a plataforma inteira (Dashboard, Resumo, etc.)
      if (onLoadSaved020502ToPlatform) {
        onLoadSaved020502ToPlatform(snap);
      }
    } else {
      // Se não tem 02.05.02 salva nessa data, pergunta se deseja salvar a atual ou manter
      const dataFormatada = pickedDateStr.split('-').reverse().join('/');
      const querSalvar = confirm(
        `Nenhuma 02.05.02 foi salva para o dia ${dataFormatada}.\n\nDeseja salvar o relatório atual nesta data agora?`
      );
      if (querSalvar) {
        setSaveModalInitialDate(pickedDateStr);
        setIsSaveModalOpen(true);
      }
      setIsCalendarOpen(false);
    }
  };

  // Ação ao clicar no botão "LIMPAR" do calendário
  const handleClearCalendarDate = () => {
    setSelectedSnapshotId(null);
    setPickedDateStr(todayStr);
    setIsCalendarOpen(false);
  };

  // =========================================================================
  // TABELA E FILTROS DE PESQUISA
  // =========================================================================
  const ip = useMemo(() => {
    const idx = displayedEc.h.indexOf('Produto');
    return idx >= 0 ? idx : 3;
  }, [displayedEc.h]);

  const okSet = useMemo(() => {
    return new Set(res.map((x) => x[0]));
  }, [res]);

  const { rows, totalLines, okCount, nokCount } = useMemo(() => {
    const q = query.trim().toLowerCase();
    let nok = 0;

    const mapped = (displayedEc.r || []).map((r) => {
      const prodCode = Number(r[ip]);
      const isOk = okSet.has(prodCode);
      if (!isOk) nok++;
      const statusText = isOk ? 'OK' : 'NOK';
      return {
        r,
        isOk,
        statusText,
        fullSearchText: (statusText + ' ' + r.join(' ')).toLowerCase(),
      };
    });

    const filtered = mapped.filter((item) => {
      if (!q) return true;
      return item.fullSearchText.includes(q);
    });

    return {
      rows: filtered,
      totalLines: displayedEc.r?.length || 0,
      okCount: (displayedEc.r?.length || 0) - nok,
      nokCount: nok,
    };
  }, [displayedEc.r, displayedEc.h, ip, okSet, query]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { text, fileName } = await readFileToText(file);
      onImport(text, fileName);
    } catch (err: any) {
      alert(err.message || 'Erro ao ler arquivo.');
    }
    e.target.value = '';
  };

  const handleFilePrecoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { text, fileName } = await readFileToText(file);
      if (onImportPrecos) {
        onImportPrecos(text, fileName);
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao ler tabela de preços.');
    }
    e.target.value = '';
  };

  // Verifica se o dia selecionado tem snapshot
  const pickedDateSnaps = snapshotDateMap.get(pickedDateStr) || [];

  return (
    <section>
      {/* =====================================================================
          KPIS DO RELATÓRIO EXIBIDO
      ===================================================================== */}
      <div className="kpis">
        <div className="k">
          <small>
            {activeSnapshot ? 'LINHAS NA 02.05.02 (HISTÓRICO)' : 'LINHAS NO ARQUIVO (ATUAL)'}
          </small>
          <span style={{ color: activeSnapshot ? '#D97706' : undefined }}>
            {totalLines}
          </span>
        </div>
        <div className="k g">
          <small>OK (no RESUMO)</small>
          <span>{okCount}</span>
        </div>
        <div className="k r">
          <small>NOK (fora do RESUMO)</small>
          <span>{nokCount}</span>
        </div>
      </div>

      {/* =====================================================================
          BARRA DE FERRAMENTAS PRINCIPAL
      ===================================================================== */}
      <div className="tools" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        {/* BOTÃO SALVAR 02.05.02 DO DIA */}
        <button
          type="button"
          className="btn"
          style={{
            padding: '7px 16px',
            fontSize: '12.5px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(180deg, #1E3A8A 0%, #172554 100%)',
            color: '#fff',
            fontWeight: 'bold',
            borderRadius: '6px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            border: '1px solid #1E40AF',
          }}
          onClick={() => {
            setSaveModalInitialDate(activeSnapshot?.date || pickedDateStr || todayStr);
            setIsSaveModalOpen(true);
          }}
          title="Salvar cópia desta 02.05.02 no calendário histórico"
        >
          <Save size={15} color="#93C5FD" />
          <span>SALVAR 02.05.02 DO DIA</span>
        </button>

        {/* =====================================================================
            SELETOR DE DATA / CALENDÁRIO POPOVER (IDÊNTICO AO DA IMAGEM)
        ===================================================================== */}
        <div className="relative" ref={calendarPopoverRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="btn"
            style={{
              padding: '7px 14px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: activeSnapshot ? '#FEF3C7' : '#FFFFFF',
              color: activeSnapshot ? '#92400E' : '#1E293B',
              border: activeSnapshot ? '1.5px solid #F59E0B' : '1px solid #CBD5E1',
              borderRadius: '6px',
              fontWeight: 'bold',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            title="Abrir calendário para consultar 02.05.02 salva por data"
          >
            <CalendarIcon size={14} color={activeSnapshot ? '#D97706' : '#2563EB'} />
            <span>
              {activeSnapshot
                ? `📅 Salvo: ${activeSnapshot.date.split('-').reverse().join('/')}`
                : 'Filtrar por Calendário'}
            </span>
            <ChevronDown size={13} color={activeSnapshot ? '#92400E' : '#64748B'} />
          </button>

          {/* CARD FLUTUANTE DO CALENDÁRIO */}
          {isCalendarOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: '0',
                zIndex: 1000,
                width: '290px',
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.18), 0 10px 15px -6px rgba(0, 0, 0, 0.08)',
                padding: '16px',
                boxSizing: 'border-box',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              {/* Topo: <  OUTUBRO 2026  > */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                  padding: '0 4px',
                }}
              >
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                  }}
                  title="Mês anterior"
                >
                  <ChevronLeft size={16} />
                </button>

                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: '800',
                    color: '#1E3A8A',
                    letterSpacing: '0.6px',
                    textTransform: 'uppercase',
                  }}
                >
                  {monthNamesUpper[currentMonth]} {currentYear}
                </span>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748B',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                  }}
                  title="Próximo mês"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Linha dos Dias da Semana: DOM SEG TER QUA QUI SEX SÁB */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  textAlign: 'center',
                  marginBottom: '8px',
                }}
              >
                {['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map((ds) => (
                  <div
                    key={ds}
                    style={{
                      fontSize: '11px',
                      fontWeight: '800',
                      color: '#334155',
                      letterSpacing: '0.3px',
                      padding: '2px 0',
                    }}
                  >
                    {ds}
                  </div>
                ))}
              </div>

              {/* Grade dos Dias (6 linhas x 7 colunas = 42 células) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  rowGap: '6px',
                  columnGap: '2px',
                  textAlign: 'center',
                }}
              >
                {calendarGrid.map((item, idx) => {
                  const isSelected = pickedDateStr === item.dateStr;
                  const hasSaved020502 = item.hasSnapshot;

                  return (
                    <div
                      key={`${item.dateStr}_${idx}`}
                      onClick={() => setPickedDateStr(item.dateStr)}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '32px',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        userSelect: 'none',
                        background: isSelected ? '#0A2540' : 'transparent',
                        color: isSelected
                          ? '#FFFFFF'
                          : item.isCurrentMonth
                          ? '#0F172A'
                          : '#94A3B8',
                        fontWeight: isSelected || item.isCurrentMonth ? '700' : '500',
                        fontSize: '13px',
                        transition: 'background-color 0.12s ease',
                      }}
                      title={
                        hasSaved020502
                          ? `Dia ${item.day}: 02.05.02 Salva (${snapshotDateMap.get(item.dateStr)?.[0]?.fileName || 'Gravada'})`
                          : `Dia ${item.day}`
                      }
                    >
                      <span>{item.day}</span>

                      {/* Pontinho Azul (ou Verde para Salvo) idêntico ao modelo da imagem */}
                      {hasSaved020502 ? (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: '2px',
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            background: isSelected ? '#38BDF8' : '#16A34A',
                          }}
                        />
                      ) : item.isToday ? (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: '2px',
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            background: isSelected ? '#38BDF8' : '#2563EB',
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Linha Divisória */}
              <div
                style={{
                  height: '1px',
                  background: '#F1F5F9',
                  margin: '14px 0 10px',
                }}
              />

              {/* Rodapé: CUSTOMIZADO + Botões LIMPAR e APLICAR */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '9.5px',
                      fontWeight: '800',
                      color: '#475569',
                      letterSpacing: '0.4px',
                      textTransform: 'uppercase',
                    }}
                  >
                    CUSTOMIZADO
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: pickedDateStr ? '#0F172A' : '#94A3B8',
                      marginTop: '1px',
                    }}
                  >
                    {pickedDateStr ? pickedDateStr.split('-').reverse().join('/') : '-'}
                    {pickedDateSnaps.length > 0 && (
                      <span style={{ color: '#16A34A', fontSize: '9px', marginLeft: '3px' }}>
                        (✓)
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleClearCalendarDate}
                    style={{
                      background: '#F0F9FF',
                      color: '#0284C7',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: '800',
                      letterSpacing: '0.3px',
                      cursor: 'pointer',
                    }}
                  >
                    LIMPAR
                  </button>

                  <button
                    type="button"
                    onClick={handleApplyCalendarDate}
                    style={{
                      background: '#0A2540',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '11px',
                      fontWeight: '800',
                      letterSpacing: '0.3px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <Sparkles size={11} color="#FBBF24" />
                    <span>APLICAR</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status: Voltar ao Vivo quando estiver vendo histórico */}
        {activeSnapshot && (
          <button
            type="button"
            onClick={() => setSelectedSnapshotId(null)}
            className="btn"
            style={{
              padding: '7px 14px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#FEF3C7',
              color: '#92400E',
              border: '1.5px solid #F59E0B',
              borderRadius: '6px',
              fontWeight: 'bold',
            }}
            title="Sair do histórico e voltar ao estoque atual"
          >
            <RotateCcw size={13} />
            <span>Voltar ao Vivo (Estoque Atual)</span>
          </button>
        )}

        <label
          className="btn"
          style={{
            padding: '7px 14px',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#eee',
            color: '#333',
            borderRadius: '6px',
          }}
          title="Selecionar arquivo direto (.txt, .csv, .xlsx)"
        >
          <span>📁 Importar Nova 02.05.02</span>
          <input
            type="file"
            accept=".txt,.csv,.tsv,.inf,.xlsx,.xls,text/plain"
            hidden
            onChange={handleFileChange}
          />
        </label>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar (código, produto, OK ou NOK)…"
          size={28}
          style={{ marginLeft: 'auto' }}
        />

        <button
          type="button"
          onClick={() => {
            const header = displayedEc.h.join(';');
            const lines = (displayedEc.r || []).map((row) => row.join(';'));
            const blob = new Blob(['\ufeff' + [header, ...lines].join('\r\n')], {
              type: 'text/csv;charset=utf-8;',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = activeSnapshot
              ? `020502_salva_${activeSnapshot.date}.csv`
              : `estoque_central_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
          }}
          className="btn"
          style={{ padding: '7px 14px', fontSize: '12px', background: '#0D9488', color: '#fff' }}
        >
          📥 Exportar CSV
        </button>

        <span>{rows.length} linhas</span>
      </div>

      {/* =====================================================================
          BANNER QUANDO ESTIVER VISUALIZANDO UMA DATA SALVA (HISTÓRICO)
      ===================================================================== */}
      {activeSnapshot ? (
        <div
          style={{
            background: 'linear-gradient(90deg, #FEF3C7 0%, #FEF9C3 100%)',
            border: '1.5px solid #F59E0B',
            borderRadius: '8px',
            padding: '12px 18px',
            margin: '8px 24px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            boxShadow: '0 2px 5px rgba(245, 158, 11, 0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>📅</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 'bold', color: '#92400E', fontSize: '14px' }}>
                  EXIBINDO 02.05.02 SALVA DO DIA {activeSnapshot.date.split('-').reverse().join('/')}
                </span>
                <span
                  style={{
                    background: '#F59E0B',
                    color: '#fff',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                  }}
                >
                  HISTÓRICO
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#78350F' }}>
                {activeSnapshot.label || activeSnapshot.fileName} — <b>{displayedEc.r.length} produtos gravados</b> às{' '}
                {new Date(activeSnapshot.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setSelectedSnapshotId(null)}
              className="btn"
              style={{
                background: '#0F172A',
                color: '#fff',
                fontSize: '11.5px',
                padding: '6px 14px',
                borderRadius: '5px',
                fontWeight: 'bold',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={13} />
              <span>Voltar para 02.05.02 Atual (Ao Vivo)</span>
            </button>

            {onDownloadSnapshot020502 && (
              <button
                type="button"
                onClick={() => onDownloadSnapshot020502(activeSnapshot)}
                className="btn"
                style={{
                  background: '#0D9488',
                  color: '#fff',
                  fontSize: '11.5px',
                  padding: '6px 12px',
                  borderRadius: '5px',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                title="Exportar planilha 02.05.02 deste dia para CSV"
              >
                <Download size={13} />
                <span>Baixar CSV</span>
              </button>
            )}

            {onDeleteSnapshot && (
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      `Tem certeza que deseja excluir o fechamento salvo do dia ${activeSnapshot.date
                        .split('-')
                        .reverse()
                        .join('/')}?`
                    )
                  ) {
                    onDeleteSnapshot(activeSnapshot.id);
                    setSelectedSnapshotId(null);
                  }
                }}
                className="btn"
                style={{
                  background: '#EF4444',
                  color: '#fff',
                  fontSize: '11.5px',
                  padding: '6px 10px',
                  borderRadius: '5px',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                title="Excluir este snapshot salvo"
              >
                <Trash2 size={13} />
                <span>Excluir</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Banners Informativos de Atualização */}
      {importBannerHtml && (
        <div style={{ position: 'relative', margin: '0 24px 8px' }}>
          <div
            className="imp on"
            dangerouslySetInnerHTML={{ __html: importBannerHtml }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.tagName === 'A') {
                e.preventDefault();
                onNavigateToDashboard();
              }
            }}
          />
          <button
            type="button"
            onClick={onClearBanner}
            style={{
              position: 'absolute',
              top: '6px',
              right: '8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              color: '#666',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {precosBannerHtml && (
        <div style={{ position: 'relative', margin: '0 24px 8px' }}>
          <div
            className="imp on"
            style={{ borderLeftColor: '#16A34A', background: '#F0FDF4' }}
            dangerouslySetInnerHTML={{ __html: precosBannerHtml }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target.tagName === 'A') {
                e.preventDefault();
                onNavigateToDashboard();
              }
            }}
          />
          {onClearPrecosBanner && (
            <button
              type="button"
              onClick={onClearPrecosBanner}
              style={{
                position: 'absolute',
                top: '6px',
                right: '8px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                color: '#166534',
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Áreas Expansíveis de Colagem de Texto */}
      <div style={{ display: 'flex', gap: '16px', margin: '0 24px 8px' }}>
        <details style={{ flex: 1 }}>
          <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#475569' }}>
            ▶ Ou cole aqui o conteúdo do 02.05.02 (separado por ;)
          </summary>
          <textarea
            rows={4}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            style={{
              width: '100%',
              marginTop: '4px',
              border: '1px solid #ccc',
              padding: '6px',
              fontFamily: 'monospace',
              fontSize: '11px',
              boxSizing: 'border-box',
            }}
            placeholder="Armazem;Deposito;...;Produto;Descricao;..."
          />
          <button
            className="btn"
            style={{ padding: '4px 10px', fontSize: '11px', marginTop: '4px' }}
            onClick={() => {
              if (pastedText.trim()) {
                onImport(pastedText, '02.05.02 (Texto Colado)');
              }
            }}
          >
            Importar 02.05.02 colado
          </button>
        </details>

        <details style={{ flex: 1 }}>
          <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#166534' }}>
            ▶ Ou cole aqui a Tabela de Preços (Código e Preço)
          </summary>
          <textarea
            rows={4}
            value={pastedPrecoText}
            onChange={(e) => setPastedPrecoText(e.target.value)}
            style={{
              width: '100%',
              marginTop: '4px',
              border: '1px solid #A5D6A7',
              padding: '6px',
              fontFamily: 'monospace',
              fontSize: '11px',
              boxSizing: 'border-box',
            }}
            placeholder="Codigo;Preco&#10;9067;28.95&#10;988;52.22"
          />
          <button
            className="btn"
            style={{ padding: '4px 10px', fontSize: '11px', marginTop: '4px', background: '#22C55E', color: '#fff' }}
            onClick={() => {
              if (pastedPrecoText.trim() && onImportPrecos) {
                onImportPrecos(pastedPrecoText, 'Tabela de Preços (Texto Colado)');
              }
            }}
          >
            Importar Preços colados
          </button>
        </details>
      </div>

      {/* =====================================================================
          TABELA DE LINHAS DO ESTOQUE CENTRAL
      ===================================================================== */}
      <div className="wrap">
        <div className="sc" style={{ width: '100%' }}>
          <table id="table-e">
            <thead>
              <tr>
                <th>Status</th>
                {displayedEc.h.map((header, hIdx) => (
                  <th key={hIdx}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((rowObj, rIdx) => (
                <tr key={rIdx}>
                  <td className={rowObj.isOk ? 'ok' : 'nok'}>
                    {rowObj.statusText}
                  </td>
                  {rowObj.r.map((val, cIdx) => (
                    <td key={cIdx}>{String(val)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal para Salvar Snapshot da 02.05.02 */}
      {data && onSaveSnapshot && (
        <SaveDaily020502Modal
          isOpen={isSaveModalOpen}
          initialDate={saveModalInitialDate || pickedDateStr || todayStr}
          data={data}
          calculated={calculated}
          onClose={() => setIsSaveModalOpen(false)}
          onSaveSnapshot={(snapshot) => {
            onSaveSnapshot(snapshot);
            setIsSaveModalOpen(false);
          }}
        />
      )}
    </section>
  );
};
