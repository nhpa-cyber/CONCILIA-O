import React, { useState, useMemo, useRef } from 'react';
import { RawData, CalculatedProduct, DashboardSnapshot } from '../data/types';
import { N, RenderMoney, formatBRL } from '../utils/formatters';
import { sum, calculateProducts } from '../utils/calc';
import {
  TrendingDown,
  TrendingUp,
  Search,
  Filter,
  Printer,
  X,
  Calendar,
  AlertTriangle,
  Info,
  CheckCircle2,
  Package,
  Layers,
  ArrowUp,
  ArrowDown,
  ExternalLink
} from 'lucide-react';
import { toPng } from 'html-to-image';

interface VariacaoViewProps {
  data: RawData;
  calculatedProducts: CalculatedProduct[];
  calculatedMap: Record<number, CalculatedProduct>;
  snapshots?: DashboardSnapshot[];
  onRecontar?: (code: number) => void;
  onNavigateToTab?: (tab: string) => void;
}

export interface VariacaoItem {
  rank: number;
  cod: number;
  desc: string;
  precoUnit: number;
  ontem: number;
  hoje: number;
  delta: number; // quantidade com sinal
  valor: number; // valor monetário absoluto
  valorImpacto: number; // impacto financeiro (+ ganho, - perda)
  isAumento: boolean;
  classificacao: string;
  peso: number;
  isFalta: boolean;
}

const mix = (a: number[], b: number[], t: number): number[] =>
  a.map((x, i) => Math.round(x + (b[i] - x) * Math.max(0, Math.min(1, t))));

function createColorScale(values: number[]) {
  const s = [...values].sort((x, y) => x - y);
  const n = s.length;
  if (n === 0) return () => '#fff';
  const md = (s[Math.floor((n - 1) / 2)] + s[Math.ceil((n - 1) / 2)]) / 2;
  const mn = s[0];
  const mx = s[n - 1];

  return (v: number) => {
    const rgb =
      v <= md
        ? mix([220, 252, 231], [254, 240, 138], md > mn ? (v - mn) / (md - mn) : 1)
        : mix([254, 240, 138], [254, 202, 202], mx > md ? (v - md) / (mx - md) : 1);
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  };
}

export const VariacaoView: React.FC<VariacaoViewProps> = ({
  data,
  calculatedProducts,
  calculatedMap,
  snapshots = [],
  onRecontar,
  onNavigateToTab,
}) => {
  // Seletor de Base de Comparação: 'congelada' (padrão) ou snapshot ID
  const [selectedBase, setSelectedBase] = useState<string>('congelada');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDirection, setFilterDirection] = useState<'todos' | 'aumentos' | 'reducoes'>('todos');
  const [selectedItemDetail, setSelectedItemDetail] = useState<VariacaoItem | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  // Mapeamento da Dif. Congelada em data.dia (campo eq)
  const congeladaMap = useMemo(() => {
    const map = new Map<number, number>();
    if (data.dia && Array.isArray(data.dia)) {
      data.dia.forEach(([cod, eq]) => {
        map.set(cod, eq);
      });
    }
    return map;
  }, [data.dia]);

  // Se o usuário selecionou um Snapshot salvo como base
  const snapshotBaseMap = useMemo(() => {
    if (selectedBase === 'congelada') return null;
    const snap = snapshots.find((s) => s.id === selectedBase);
    if (!snap) return null;

    const snapData: RawData = {
      ...data,
      ec: snap.ec,
      res: snap.res || data.res,
    };
    const snapCalc = calculateProducts(snapData);
    const map = new Map<number, number>();
    snapCalc.C.forEach((p) => {
      map.set(p.c, p.R);
    });
    return {
      name: snap.name,
      createdAt: snap.createdAt || new Date(snap.timestamp).toLocaleString('pt-BR'),
      map,
    };
  }, [selectedBase, snapshots, data]);

  // Informações de texto da base atual
  const baseLabel = useMemo(() => {
    if (selectedBase === 'congelada') {
      const hasCongelada = Array.from(congeladaMap.values()).some((v) => v !== 0);
      return {
        title: 'Diferença Congelada Oficial (data.dia)',
        sub: hasCongelada ? 'Registrada pelo botão CONGELAR' : 'Base congelada zerada ou não registrada',
        hasData: hasCongelada,
      };
    }
    if (snapshotBaseMap) {
      return {
        title: snapshotBaseMap.name,
        sub: `Salvo em ${snapshotBaseMap.createdAt}`,
        hasData: true,
      };
    }
    return {
      title: 'Base de Comparação',
      sub: '',
      hasData: true,
    };
  }, [selectedBase, congeladaMap, snapshotBaseMap]);

  // CÁLCULO DAS VARIAÇÕES (HOJE vs ONTEM / BASE)
  const {
    itensFaltas,
    itensSobras,
    totalValorFaltas,
    totalValorSobras,
    colorScaleF,
    colorScaleS,
    faltasAumentaram,
    faltasDiminuiram,
    sobrasAumentaram,
    sobrasDiminuiram,
    liquidoFaltas,
    liquidoSobras,
    impactoTotal,
    totalItensAlterados,
  } = useMemo(() => {
    const desativadosSet = new Set(data.desativados || []);
    const xsSet = new Set(data.xs || []);

    // Conjunto de todos os produtos conhecidos (em calculatedProducts, data.res ou data.dia)
    const allCodes = new Set<number>();
    calculatedProducts.forEach((p) => allCodes.add(p.c));
    data.dia.forEach(([cod]) => allCodes.add(cod));
    data.res.forEach((r) => allCodes.add(r[0]));

    const faltasRaw: Omit<VariacaoItem, 'rank' | 'peso'>[] = [];
    const sobrasRaw: Omit<VariacaoItem, 'rank' | 'peso'>[] = [];

    allCodes.forEach((cod) => {
      if (desativadosSet.has(cod)) return;

      const calcProd = calculatedMap[cod];
      const resRow = data.res.find((r) => r[0] === cod);
      const desc = calcProd?.d || resRow?.[1] || `Produto ${cod}`;
      const precoUnit = calcProd?.U ?? (resRow?.[5] || 0);

      // Saldo de Hoje (em caixas): R é a diferença (positivo = sobra, negativo = falta)
      const saldoHoje = calcProd?.R ?? 0;

      // Saldo de Ontem / Base (em caixas)
      let saldoOntem = 0;
      if (selectedBase === 'congelada') {
        saldoOntem = congeladaMap.get(cod) ?? 0;
      } else if (snapshotBaseMap) {
        saldoOntem = snapshotBaseMap.map.get(cod) ?? 0;
      }

      // Regra Oficial de Cálculo:
      // falta_ontem = max(0, -saldo_ontem) | falta_hoje = max(0, -saldo_hoje)
      // sobra_ontem = max(0, saldo_ontem)  | sobra_hoje = max(0, saldo_hoje)
      const faltaOntem = Math.max(0, -saldoOntem);
      const faltaHoje = Math.max(0, -saldoHoje);

      const sobraOntem = Math.max(0, saldoOntem);
      const sobraHoje = Math.max(0, saldoHoje);

      const deltaFalta = faltaHoje - faltaOntem;
      const deltaSobra = sobraHoje - sobraOntem;

      // 1. Lado FALTAS: apenas se deltaFalta != 0
      if (deltaFalta !== 0) {
        const isAumento = deltaFalta > 0;
        const valor = Math.abs(deltaFalta) * precoUnit;
        // Impacto: falta que aumentou é perda (-), falta que diminuiu é ganho (+)
        const valorImpacto = isAumento ? -valor : valor;
        faltasRaw.push({
          cod,
          desc,
          precoUnit,
          ontem: faltaOntem,
          hoje: faltaHoje,
          delta: deltaFalta,
          valor,
          valorImpacto,
          isAumento,
          classificacao: isAumento ? 'FALTA AUMENTOU' : 'FALTA DIMINUIU',
          isFalta: true,
        });
      }

      // 2. Lado SOBRAS: apenas se deltaSobra != 0
      if (deltaSobra !== 0) {
        const isAumento = deltaSobra > 0;
        // Se for XS (produto excluído de valorização de sobras), valor monetário é 0
        const valor = xsSet.has(cod) ? 0 : Math.abs(deltaSobra) * precoUnit;
        // Impacto: sobra que aumentou é ganho (+), sobra que diminuiu é perda (-)
        const valorImpacto = isAumento ? valor : -valor;
        sobrasRaw.push({
          cod,
          desc,
          precoUnit,
          ontem: sobraOntem,
          hoje: sobraHoje,
          delta: deltaSobra,
          valor,
          valorImpacto,
          isAumento,
          classificacao: isAumento ? 'SOBRA AUMENTOU' : 'SOBRA DIMINUIU',
          isFalta: false,
        });
      }
    });

    // Ordenar por valor absoluto decrescente
    faltasRaw.sort((a, b) => b.valor - a.valor || Math.abs(b.delta) - Math.abs(a.delta));
    sobrasRaw.sort((a, b) => b.valor - a.valor || Math.abs(b.delta) - Math.abs(a.delta));

    const totalF = sum(faltasRaw, (i) => i.valor);
    const totalS = sum(sobrasRaw, (i) => i.valor);

    const fFinal: VariacaoItem[] = faltasRaw.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      peso: totalF > 0 ? item.valor / totalF : 0,
    }));

    const sFinal: VariacaoItem[] = sobrasRaw.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      peso: totalS > 0 ? item.valor / totalS : 0,
    }));

    // Métricas do painel lateral
    const fAumentaram = {
      qtd: fFinal.filter((i) => i.isAumento).length,
      valor: sum(fFinal.filter((i) => i.isAumento), (i) => i.valor),
    };
    const fDiminuiram = {
      qtd: fFinal.filter((i) => !i.isAumento).length,
      valor: sum(fFinal.filter((i) => !i.isAumento), (i) => i.valor),
    };

    const sAumentaram = {
      qtd: sFinal.filter((i) => i.isAumento).length,
      valor: sum(sFinal.filter((i) => i.isAumento), (i) => i.valor),
    };
    const sDiminuiram = {
      qtd: sFinal.filter((i) => !i.isAumento).length,
      valor: sum(sFinal.filter((i) => !i.isAumento), (i) => i.valor),
    };

    // Impacto líquido:
    // Faltas: diminuições (+ ganho) - aumentos (- perda)
    const liqFaltas = fDiminuiram.valor - fAumentaram.valor;
    // Sobras: aumentos (+ ganho) - diminuições (- perda)
    const liqSobras = sAumentaram.valor - sDiminuiram.valor;
    // Impacto total no estoque
    const impTotal = liqFaltas + liqSobras;

    const codsAlterados = new Set<number>();
    fFinal.forEach((i) => codsAlterados.add(i.cod));
    sFinal.forEach((i) => codsAlterados.add(i.cod));

    return {
      itensFaltas: fFinal,
      itensSobras: sFinal,
      totalValorFaltas: totalF,
      totalValorSobras: totalS,
      colorScaleF: createColorScale(fFinal.map((i) => i.peso)),
      colorScaleS: createColorScale(sFinal.map((i) => i.peso)),
      faltasAumentaram: fAumentaram,
      faltasDiminuiram: fDiminuiram,
      sobrasAumentaram: sAumentaram,
      sobrasDiminuiram: sDiminuiram,
      liquidoFaltas: liqFaltas,
      liquidoSobras: liqSobras,
      impactoTotal: impTotal,
      totalItensAlterados: codsAlterados.size,
    };
  }, [calculatedProducts, calculatedMap, data.dia, data.res, data.desativados, data.xs, selectedBase, congeladaMap, snapshotBaseMap]);

  // Filtros aplicados na visualização das tabelas
  const filteredFaltas = useMemo(() => {
    return itensFaltas.filter((item) => {
      if (filterDirection === 'aumentos' && !item.isAumento) return false;
      if (filterDirection === 'reducoes' && item.isAumento) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return item.cod.toString().includes(q) || item.desc.toLowerCase().includes(q);
      }
      return true;
    });
  }, [itensFaltas, filterDirection, searchQuery]);

  const filteredSobras = useMemo(() => {
    return itensSobras.filter((item) => {
      if (filterDirection === 'aumentos' && !item.isAumento) return false;
      if (filterDirection === 'reducoes' && item.isAumento) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return item.cod.toString().includes(q) || item.desc.toLowerCase().includes(q);
      }
      return true;
    });
  }, [itensSobras, filterDirection, searchQuery]);

  const maxRows = Math.max(filteredFaltas.length, filteredSobras.length);

  // Ação de Impressão / Print
  const handlePrint = async () => {
    if (!printContainerRef.current) return;
    try {
      setIsCapturing(true);
      const dataUrl = await toPng(printContainerRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        skipFonts: true,
        fontEmbedCSS: '',
        cacheBust: false,
      });
      const link = document.createElement('a');
      link.download = `Variacao_Estoque_Hoje_vs_Ontem_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.warn('Erro ao gerar print da tela:', err);
      window.print();
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <section className="dash" style={{ padding: '8px 12px 24px', width: '100%', maxWidth: '100vw', boxSizing: 'border-box' }}>
      {/* BARRA SUPERIOR: RESUMO EXECUTIVO & FILTROS */}
      <div
        style={{
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          border: '1px solid #E2E8F0',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          {/* Título & Badge da Base */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '18px' }}>📊</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A', letterSpacing: '0.3px' }}>
                VARIAÇÃO DO ESTOQUE (HOJE vs. ONTEM)
              </h2>
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                Comparativo item a item entre a base congelada e a conciliação atual
              </span>
            </div>

            <div
              style={{
                marginLeft: '8px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: baseLabel.hasData ? '#ECFDF5' : '#FEF2F2',
                border: `1px solid ${baseLabel.hasData ? '#A7F3D0' : '#FECACA'}`,
                color: baseLabel.hasData ? '#065F46' : '#991B1B',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Calendar size={13} />
              <span>Base: {baseLabel.title}</span>
            </div>
          </div>

          {/* Botões de Ação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isCapturing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#0F172A',
                color: '#FFFFFF',
                border: '1px solid #000',
                borderRadius: '5px',
                padding: '5px 11px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
              title="Baixar imagem em PNG ou imprimir o relatório da variação"
            >
              <Printer size={13} />
              <span>{isCapturing ? 'Gerando...' : 'PRINT DA TELA'}</span>
            </button>
          </div>
        </div>

        {/* Linha de Resumo Rápido & Controles */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
          {/* Métricas Rápidas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '11.5px' }}>
            <span style={{ color: '#475569' }}>
              Alterações Totais: <b style={{ color: '#0F172A' }}>{totalItensAlterados} itens</b>
            </span>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <span style={{ color: '#DC2626', fontWeight: 600 }}>
              Falta Aumentou: <b>{faltasAumentaram.qtd} itens</b> (R$ {formatBRL(faltasAumentaram.valor)})
            </span>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <span style={{ color: '#DC2626', fontWeight: 600 }}>
              Sobra Diminuiu: <b>{sobrasDiminuiram.qtd} itens</b> (R$ {formatBRL(sobrasDiminuiram.valor)})
            </span>
            <span style={{ color: '#CBD5E1' }}>•</span>
            <span style={{ color: '#16A34A', fontWeight: 600 }}>
              Falta Diminuiu: <b>{faltasDiminuiram.qtd} itens</b> (R$ {formatBRL(faltasDiminuiram.valor)})
            </span>
          </div>

          {/* Filtros e Busca */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {/* Filtro de Sentido */}
            <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '2px', borderRadius: '5px', border: '1px solid #CBD5E1' }}>
              <button
                type="button"
                onClick={() => setFilterDirection('todos')}
                style={{
                  padding: '2px 8px',
                  fontSize: '10.5px',
                  fontWeight: filterDirection === 'todos' ? 700 : 500,
                  background: filterDirection === 'todos' ? '#FFFFFF' : 'transparent',
                  color: filterDirection === 'todos' ? '#0F172A' : '#64748B',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  boxShadow: filterDirection === 'todos' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Todos ({totalItensAlterados})
              </button>
              <button
                type="button"
                onClick={() => setFilterDirection('aumentos')}
                style={{
                  padding: '2px 8px',
                  fontSize: '10.5px',
                  fontWeight: filterDirection === 'aumentos' ? 700 : 500,
                  background: filterDirection === 'aumentos' ? '#FFFFFF' : 'transparent',
                  color: filterDirection === 'aumentos' ? '#B91C1C' : '#64748B',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  boxShadow: filterDirection === 'aumentos' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Só Aumentos ↑
              </button>
              <button
                type="button"
                onClick={() => setFilterDirection('reducoes')}
                style={{
                  padding: '2px 8px',
                  fontSize: '10.5px',
                  fontWeight: filterDirection === 'reducoes' ? 700 : 500,
                  background: filterDirection === 'reducoes' ? '#FFFFFF' : 'transparent',
                  color: filterDirection === 'reducoes' ? '#15803D' : '#64748B',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  boxShadow: filterDirection === 'reducoes' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Só Reduções ↓
              </button>
            </div>

            {/* Busca por Código ou Descrição */}
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: '7px', top: '7px', color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Buscar código ou nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '3px 8px 3px 24px',
                  fontSize: '11px',
                  borderRadius: '5px',
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  width: '180px',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '5px',
                    top: '5px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94A3B8',
                    padding: 0,
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AVISO SE A BASE CONGELADA ESTIVER VAZIA */}
      {selectedBase === 'congelada' && !baseLabel.hasData && (
        <div
          style={{
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            padding: '10px 14px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#991B1B',
            fontSize: '12px',
          }}
        >
          <AlertTriangle size={16} />
          <div>
            <b>Atenção: A base congelada (data.dia) ainda não foi congelada ou está zerada.</b>
            <span style={{ marginLeft: '6px', color: '#7F1D1D' }}>
              Para registrar a posição oficial de ontem, clique no botão <b>CONGELAR</b> na aba <b>Dashboard</b>.
            </span>
          </div>
        </div>
      )}

      {/* ÁREA PRINCIPAL: TABELAS LADO A LADO + PAINEL LATERAL DIREITO */}
      <div ref={printContainerRef} className="wrap" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
        {/* CONTAINER DAS DUAS TABELAS (FALTAS E SOBRAS) */}
        <div className="sc" style={{ flex: '1 1 0%', minWidth: 0, overflowX: 'auto', border: '1px solid #CBD5E1', background: '#FFFFFF' }}>
          <table className="rank-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', tableLayout: 'auto' }}>
            {/* CABEÇALHO SUPERIOR DIVIDIDO */}
            <thead>
              <tr className="h1">
                <th
                  colSpan={8}
                  style={{
                    background: 'linear-gradient(180deg, #991B1B 0%, #7F1D1D 100%)',
                    color: '#FFFFFF',
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: '12px',
                    padding: '6px 8px',
                    borderRight: '3px solid #000',
                  }}
                >
                  VARIAÇÃO DE FALTAS (ITENS CUJA FALTA ALTEROU)
                </th>
                <th
                  colSpan={8}
                  style={{
                    background: 'linear-gradient(180deg, #065F46 0%, #047857 100%)',
                    color: '#FFFFFF',
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: '12px',
                    padding: '6px 8px',
                  }}
                >
                  VARIAÇÃO DE SOBRAS (ITENS CUJA SOBRA ALTEROU)
                </th>
              </tr>

              {/* CABEÇALHO DAS COLUNAS */}
              <tr className="h2" style={{ background: '#090D16', color: '#F8FAFC', fontSize: '10px', textTransform: 'uppercase' }}>
                {/* Lado Faltas */}
                <th style={{ width: '28px', padding: '5px 2px', textAlign: 'center' }}>#</th>
                <th style={{ width: '54px', padding: '5px 4px', textAlign: 'center' }}>COD</th>
                <th style={{ padding: '5px 6px', textAlign: 'left' }}>DESCRIÇÃO</th>
                <th style={{ width: '48px', padding: '5px 4px', textAlign: 'right' }} title="Quantidade de falta na base anterior">ONTEM</th>
                <th style={{ width: '48px', padding: '5px 4px', textAlign: 'right' }} title="Quantidade de falta na conciliação atual">HOJE</th>
                <th style={{ width: '70px', padding: '5px 4px', textAlign: 'center' }} title="Diferença física em caixas (+ aumento de falta, - redução)">VARIAÇÃO</th>
                <th style={{ width: '84px', padding: '5px 4px', textAlign: 'right' }} title="Impacto em R$ da variação apurada">VALOR R$</th>
                <th style={{ width: '46px', padding: '5px 2px', textAlign: 'center', borderRight: '3px solid #000' }} title="Peso relativo no total das variações de faltas">PESO</th>

                {/* Lado Sobras */}
                <th style={{ width: '28px', padding: '5px 2px', textAlign: 'center' }}>#</th>
                <th style={{ width: '54px', padding: '5px 4px', textAlign: 'center' }}>COD</th>
                <th style={{ padding: '5px 6px', textAlign: 'left' }}>DESCRIÇÃO</th>
                <th style={{ width: '48px', padding: '5px 4px', textAlign: 'right' }} title="Quantidade de sobra na base anterior">ONTEM</th>
                <th style={{ width: '48px', padding: '5px 4px', textAlign: 'right' }} title="Quantidade de sobra na conciliação atual">HOJE</th>
                <th style={{ width: '70px', padding: '5px 4px', textAlign: 'center' }} title="Diferença física em caixas (+ aumento de sobra, - redução)">VARIAÇÃO</th>
                <th style={{ width: '84px', padding: '5px 4px', textAlign: 'right' }} title="Impacto em R$ da variação apurada">VALOR R$</th>
                <th style={{ width: '46px', padding: '5px 2px', textAlign: 'center' }} title="Peso relativo no total das variações de sobras">PESO</th>
              </tr>
            </thead>

            <tbody>
              {maxRows === 0 ? (
                <tr>
                  <td colSpan={16} style={{ textAlign: 'center', padding: '36px 16px', color: '#64748B' }}>
                    <Info size={28} style={{ margin: '0 auto 8px', color: '#94A3B8' }} />
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#334155' }}>
                      Nenhuma variação apurada entre a base e o dia atual com os filtros selecionados.
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>
                      Todos os itens mantiveram exatamente o mesmo saldo, ou não há filtros correspondentes.
                    </div>
                  </td>
                </tr>
              ) : (
                Array.from({ length: maxRows }, (_, idx) => {
                  const rf = filteredFaltas[idx];
                  const rs = filteredSobras[idx];
                  const isEven = idx % 2 === 0;
                  const rowBg = isEven ? '#FFFFFF' : '#F8FAFC';

                  return (
                    <tr key={idx} style={{ background: rowBg, height: '26px' }}>
                      {/* ===== CÉLULAS DE FALTAS ===== */}
                      {rf ? (
                        <>
                          <td style={{ textAlign: 'center', color: '#94A3B8', fontSize: '10px', padding: '2px 3px' }}>
                            {rf.rank}
                          </td>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              textAlign: 'center',
                              color: '#1E293B',
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                            title="Clique para ver o detalhamento do item"
                            onClick={() => setSelectedItemDetail(rf)}
                            onDoubleClick={() => onRecontar?.(rf.cod)}
                          >
                            {rf.cod}
                          </td>
                          <td
                            style={{
                              maxWidth: '190px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              padding: '2px 6px',
                              cursor: 'pointer',
                            }}
                            title={`${rf.desc} (Clique para detalhes)`}
                            onClick={() => setSelectedItemDetail(rf)}
                          >
                            {rf.desc}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#64748B', padding: '2px 4px' }}>
                            {rf.ontem}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0F172A', padding: '2px 4px' }}>
                            {rf.hoje}
                          </td>
                          <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                background: rf.isAumento ? '#FEE2E2' : '#DCFCE7',
                                color: rf.isAumento ? '#991B1B' : '#166534',
                                border: `1px solid ${rf.isAumento ? '#FCA5A5' : '#86EFAC'}`,
                              }}
                              title={rf.isAumento ? 'Falta Aumentou (Piora no estoque)' : 'Falta Diminuiu (Recuperação no estoque)'}
                            >
                              {rf.isAumento ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                              <span>{rf.delta > 0 ? `+${rf.delta}` : rf.delta}</span>
                            </span>
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              padding: '2px 4px',
                              color: rf.isAumento ? '#B91C1C' : '#15803D',
                            }}
                          >
                            <RenderMoney value={rf.isAumento ? -rf.valor : rf.valor} />
                          </td>
                          <td
                            className="p"
                            style={{
                              textAlign: 'center',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 3px',
                              borderRight: '3px solid #000',
                              background: colorScaleF(rf.peso),
                              color: '#0F172A',
                            }}
                            title={`Peso: ${(rf.peso * 100).toFixed(1)}% das variações de faltas`}
                          >
                            {Math.round(rf.peso * 100)}%
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={7} style={{ borderRight: '3px solid #000', background: isEven ? '#FAFAFA' : '#F1F5F9' }}></td>
                          <td style={{ borderRight: '3px solid #000', background: isEven ? '#FAFAFA' : '#F1F5F9' }}></td>
                        </>
                      )}

                      {/* ===== CÉLULAS DE SOBRAS ===== */}
                      {rs ? (
                        <>
                          <td style={{ textAlign: 'center', color: '#94A3B8', fontSize: '10px', padding: '2px 3px' }}>
                            {rs.rank}
                          </td>
                          <td
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              textAlign: 'center',
                              color: '#1E293B',
                              cursor: 'pointer',
                              padding: '2px 4px',
                            }}
                            title="Clique para ver o detalhamento do item"
                            onClick={() => setSelectedItemDetail(rs)}
                            onDoubleClick={() => onRecontar?.(rs.cod)}
                          >
                            {rs.cod}
                          </td>
                          <td
                            style={{
                              maxWidth: '190px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              padding: '2px 6px',
                              cursor: 'pointer',
                            }}
                            title={`${rs.desc} (Clique para detalhes)`}
                            onClick={() => setSelectedItemDetail(rs)}
                          >
                            {rs.desc}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#64748B', padding: '2px 4px' }}>
                            {rs.ontem}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#0F172A', padding: '2px 4px' }}>
                            {rs.hoje}
                          </td>
                          <td style={{ textAlign: 'center', padding: '2px 4px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                background: rs.isAumento ? '#DCFCE7' : '#FEE2E2',
                                color: rs.isAumento ? '#166534' : '#991B1B',
                                border: `1px solid ${rs.isAumento ? '#86EFAC' : '#FCA5A5'}`,
                              }}
                              title={rs.isAumento ? 'Sobra Aumentou (Ganho de sobra)' : 'Sobra Diminuiu (Perda de sobra)'}
                            >
                              {rs.isAumento ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                              <span>{rs.delta > 0 ? `+${rs.delta}` : rs.delta}</span>
                            </span>
                          </td>
                          <td
                            style={{
                              textAlign: 'right',
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              padding: '2px 4px',
                              color: rs.isAumento ? '#15803D' : '#B91C1C',
                            }}
                          >
                            <RenderMoney value={rs.isAumento ? rs.valor : -rs.valor} />
                          </td>
                          <td
                            className="p"
                            style={{
                              textAlign: 'center',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 3px',
                              background: colorScaleS(rs.peso),
                              color: '#0F172A',
                            }}
                            title={`Peso: ${(rs.peso * 100).toFixed(1)}% das variações de sobras`}
                          >
                            {Math.round(rs.peso * 100)}%
                          </td>
                        </>
                      ) : (
                        <>
                          <td colSpan={8} style={{ background: isEven ? '#FAFAFA' : '#F1F5F9' }}></td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAINEL LATERAL DIREITO (CARDS DE TOTALIZADORES E IMPACTO) */}
        <aside
          className="dash-side"
          style={{
            width: '280px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Seletor da Base de Comparação */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '7px',
              padding: '10px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <label
              style={{
                display: 'block',
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#475569',
                textTransform: 'uppercase',
                marginBottom: '5px',
              }}
            >
              Comparar Hoje Com:
            </label>
            <select
              value={selectedBase}
              onChange={(e) => setSelectedBase(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '11.5px',
                fontWeight: 600,
                color: '#0F172A',
                background: '#F8FAFC',
                border: '1px solid #CBD5E1',
                borderRadius: '5px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="congelada">🔒 Dif. Congelada Oficial (data.dia)</option>
              {snapshots.map((snap) => (
                <option key={snap.id} value={snap.id}>
                  📁 {snap.name} ({snap.createdAt?.slice(0, 10) || new Date(snap.timestamp).toLocaleDateString('pt-BR')})
                </option>
              ))}
            </select>
            <div style={{ fontSize: '10px', color: '#64748B', marginTop: '4px', fontStyle: 'italic' }}>
              {baseLabel.sub}
            </div>
          </div>

          {/* CARD: FALTAS AUMENTARAM (PERDA) */}
          <div
            style={{
              background: '#FFF5F5',
              border: '1px solid #FECACA',
              borderLeft: '5px solid #DC2626',
              borderRadius: '6px',
              padding: '8px 10px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>
                FALTAS AUMENTARAM
              </span>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: '999px' }}>
                {faltasAumentaram.qtd} itens
              </span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626', marginTop: '2px', fontFamily: 'monospace' }}>
              - R$ {formatBRL(faltasAumentaram.valor)}
            </div>
            <div style={{ fontSize: '9.5px', color: '#991B1B', marginTop: '1px' }}>
              Impacto negativo (perdas novas em faltas)
            </div>
          </div>

          {/* CARD: FALTAS DIMINUÍRAM (RECUPERAÇÃO) */}
          <div
            style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderLeft: '5px solid #16A34A',
              borderRadius: '6px',
              padding: '8px 10px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                FALTAS DIMINUÍRAM
              </span>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#16A34A', background: '#DCFCE7', padding: '1px 6px', borderRadius: '999px' }}>
                {faltasDiminuiram.qtd} itens
              </span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#16A34A', marginTop: '2px', fontFamily: 'monospace' }}>
              + R$ {formatBRL(faltasDiminuiram.valor)}
            </div>
            <div style={{ fontSize: '9.5px', color: '#166534', marginTop: '1px' }}>
              Impacto positivo (recuperação de faltas)
            </div>
          </div>

          {/* CARD: IMPACTO LÍQUIDO DAS FALTAS */}
          <div
            style={{
              background: liquidoFaltas >= 0 ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${liquidoFaltas >= 0 ? '#86EFAC' : '#FCA5A5'}`,
              borderRadius: '6px',
              padding: '7px 10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block' }}>
                Líquido das Faltas
              </span>
              <span style={{ fontSize: '10px', color: '#64748B' }}>
                (Diminuições - Aumentos)
              </span>
            </div>
            <strong style={{ fontSize: '13.5px', fontWeight: 800, color: liquidoFaltas >= 0 ? '#15803D' : '#B91C1C', fontFamily: 'monospace' }}>
              {liquidoFaltas >= 0 ? '+' : ''}R$ {formatBRL(liquidoFaltas)}
            </strong>
          </div>

          <div style={{ height: '1px', background: '#E2E8F0', margin: '2px 0' }} />

          {/* CARD: SOBRAS AUMENTARAM (GANHO) */}
          <div
            style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderLeft: '5px solid #16A34A',
              borderRadius: '6px',
              padding: '8px 10px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                SOBRAS AUMENTARAM
              </span>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#16A34A', background: '#DCFCE7', padding: '1px 6px', borderRadius: '999px' }}>
                {sobrasAumentaram.qtd} itens
              </span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#16A34A', marginTop: '2px', fontFamily: 'monospace' }}>
              + R$ {formatBRL(sobrasAumentaram.valor)}
            </div>
            <div style={{ fontSize: '9.5px', color: '#166534', marginTop: '1px' }}>
              Impacto positivo (novas sobras registradas)
            </div>
          </div>

          {/* CARD: SOBRAS DIMINUÍRAM (PERDA) */}
          <div
            style={{
              background: '#FFF5F5',
              border: '1px solid #FECACA',
              borderLeft: '5px solid #DC2626',
              borderRadius: '6px',
              padding: '8px 10px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>
                SOBRAS DIMINUÍRAM
              </span>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: '999px' }}>
                {sobrasDiminuiram.qtd} itens
              </span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626', marginTop: '2px', fontFamily: 'monospace' }}>
              - R$ {formatBRL(sobrasDiminuiram.valor)}
            </div>
            <div style={{ fontSize: '9.5px', color: '#991B1B', marginTop: '1px' }}>
              Impacto negativo (perda de sobra que cobria)
            </div>
          </div>

          {/* CARD: IMPACTO LÍQUIDO DAS SOBRAS */}
          <div
            style={{
              background: liquidoSobras >= 0 ? '#F0FDF4' : '#FEF2F2',
              border: `1px solid ${liquidoSobras >= 0 ? '#86EFAC' : '#FCA5A5'}`,
              borderRadius: '6px',
              padding: '7px 10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block' }}>
                Líquido das Sobras
              </span>
              <span style={{ fontSize: '10px', color: '#64748B' }}>
                (Aumentos - Diminuições)
              </span>
            </div>
            <strong style={{ fontSize: '13.5px', fontWeight: 800, color: liquidoSobras >= 0 ? '#15803D' : '#B91C1C', fontFamily: 'monospace' }}>
              {liquidoSobras >= 0 ? '+' : ''}R$ {formatBRL(liquidoSobras)}
            </strong>
          </div>

          {/* CARD GRANDE EM DESTAQUE: IMPACTO TOTAL NO ESTOQUE */}
          <div
            style={{
              marginTop: '4px',
              background: impactoTotal >= 0 ? 'linear-gradient(135deg, #15803D 0%, #166534 100%)' : 'linear-gradient(135deg, #B91C1C 0%, #991B1B 100%)',
              color: '#FFFFFF',
              borderRadius: '8px',
              padding: '12px 14px',
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', opacity: 0.9, display: 'block' }}>
              IMPACTO TOTAL NO ESTOQUE
            </span>
            <div style={{ fontSize: '22px', fontWeight: 900, marginTop: '3px', fontFamily: 'monospace', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
              {impactoTotal >= 0 ? '+' : ''}R$ {formatBRL(impactoTotal)}
            </div>
            <div
              style={{
                marginTop: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.2)',
              }}
            >
              {impactoTotal >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{impactoTotal >= 0 ? 'RESULTADO: MELHOROU' : 'RESULTADO: PIOROU'}</span>
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL DE DETALHES DO PRODUTO (AO CLICAR NA LINHA) */}
      {selectedItemDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedItemDetail(null);
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '10px',
              boxShadow: '0 15px 35px rgba(0,0,0,0.3)',
              maxWidth: '460px',
              width: '100%',
              overflow: 'hidden',
              border: '2px solid #FFC000',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            {/* Topo do Modal */}
            <div
              style={{
                background: '#090D16',
                color: '#FFFFFF',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    background: '#FFC000',
                    color: '#000',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontSize: '11.5px',
                  }}
                >
                  COD {selectedItemDetail.cod}
                </span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Detalhamento da Variação</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItemDetail(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Conteúdo */}
            <div style={{ padding: '16px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, color: '#0F172A', lineHeight: 1.3 }}>
                {selectedItemDetail.desc}
              </h3>

              {/* Tag de Classificação */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  marginBottom: '14px',
                  background: selectedItemDetail.valorImpacto < 0 ? '#FEE2E2' : '#DCFCE7',
                  color: selectedItemDetail.valorImpacto < 0 ? '#991B1B' : '#166534',
                  border: `1px solid ${selectedItemDetail.valorImpacto < 0 ? '#FCA5A5' : '#86EFAC'}`,
                }}
              >
                {selectedItemDetail.isAumento ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                <span>{selectedItemDetail.classificacao}</span>
                <span>•</span>
                <span>{selectedItemDetail.valorImpacto < 0 ? 'Perda no estoque' : 'Ganho no estoque'}</span>
              </div>

              {/* Grid Comparativo */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '10px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                    Ontem / Base
                  </span>
                  <strong style={{ fontSize: '16px', color: '#334155', fontFamily: 'monospace' }}>
                    {selectedItemDetail.ontem} <small style={{ fontSize: '10px' }}>cx</small>
                  </strong>
                </div>

                <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '10px', color: '#0F172A', fontWeight: 700, textTransform: 'uppercase' }}>
                    Hoje
                  </span>
                  <strong style={{ fontSize: '16px', color: '#0F172A', fontFamily: 'monospace' }}>
                    {selectedItemDetail.hoje} <small style={{ fontSize: '10px' }}>cx</small>
                  </strong>
                </div>

                <div
                  style={{
                    background: selectedItemDetail.valorImpacto < 0 ? '#FFF5F5' : '#F0FDF4',
                    border: `1px solid ${selectedItemDetail.valorImpacto < 0 ? '#FECACA' : '#BBF7D0'}`,
                    borderRadius: '6px',
                    padding: '8px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ display: 'block', fontSize: '10px', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                    Variação
                  </span>
                  <strong
                    style={{
                      fontSize: '16px',
                      color: selectedItemDetail.valorImpacto < 0 ? '#DC2626' : '#16A34A',
                      fontFamily: 'monospace',
                    }}
                  >
                    {selectedItemDetail.delta > 0 ? `+${selectedItemDetail.delta}` : selectedItemDetail.delta} <small style={{ fontSize: '10px' }}>cx</small>
                  </strong>
                </div>
              </div>

              {/* Informações Financeiras */}
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#64748B' }}>Preço Unitário (Cx):</span>
                  <b style={{ color: '#0F172A', fontFamily: 'monospace' }}>
                    {selectedItemDetail.precoUnit > 0 ? `R$ ${selectedItemDetail.precoUnit.toFixed(2).replace('.', ',')}` : 'R$ 0,00 (Não cadastrado)'}
                  </b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#64748B' }}>Valor Financeiro da Variação:</span>
                  <b style={{ color: selectedItemDetail.valorImpacto < 0 ? '#DC2626' : '#16A34A', fontFamily: 'monospace', fontSize: '13px' }}>
                    {selectedItemDetail.valorImpacto < 0 ? '- ' : '+ '}R$ {formatBRL(selectedItemDetail.valor)}
                  </b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Peso no Ranking de Variação:</span>
                  <b style={{ color: '#0F172A' }}>{(selectedItemDetail.peso * 100).toFixed(1)}%</b>
                </div>
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                {onRecontar && (
                  <button
                    type="button"
                    onClick={() => {
                      onRecontar(selectedItemDetail.cod);
                      setSelectedItemDetail(null);
                    }}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '5px',
                      background: '#D97706',
                      color: '#FFFFFF',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>Enviar para Recontagem</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedItemDetail(null)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '5px',
                    background: '#E2E8F0',
                    color: '#334155',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '11.5px',
                    cursor: 'pointer',
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
