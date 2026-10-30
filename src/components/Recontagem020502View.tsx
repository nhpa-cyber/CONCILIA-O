import React, { useState, useMemo } from 'react';
import { RawData } from '../data/types';

interface Recontagem020502ViewProps {
  data: RawData;
  onUpdateData: (newData: RawData, desc: string) => void;
}

export const Recontagem020502View: React.FC<Recontagem020502ViewProps> = ({
  data,
  onUpdateData,
}) => {
  const recState = data.recontagem020502 || { base: [], over: {}, hist: [] };
  const [base, setBase] = useState<any[]>(recState.base || []);
  const [over, setOver] = useState<Record<string, { cx: number; src: string; av: number }>>(recState.over || {});
  const [hist, setHist] = useState<{ name: string; n: number; snap: Record<string, any> }[]>(recState.hist || []);

  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState<'rec' | 'all' | 'alr'>('rec');
  const [sortKey, setSortKey] = useState<string>('rs');
  const [sortDir, setSortDir] = useState<number>(1);
  const [statusBase, setStatusBase] = useState<string>(recState.base?.length ? `${recState.base.length} produtos carregados` : '');
  const [statusRec, setStatusRec] = useState<string>('');
  const [errorBase, setErrorBase] = useState<boolean>(false);
  const [errorRec, setErrorRec] = useState<boolean>(false);
  const [notFoundList, setNotFoundList] = useState<string[]>([]);

  const persistState = (newBase: any[], newOver: Record<string, any>, newHist: any[]) => {
    setBase(newBase);
    setOver(newOver);
    setHist(newHist);
    const nextData: RawData = {
      ...data,
      recontagem020502: {
        base: newBase,
        over: newOver,
        hist: newHist,
      },
    };
    onUpdateData(nextData, 'Atualização na Recontagem 02.05.02');
  };

  const pad = (p: any) => String(p || '').replace(/\D/g, '').padStart(8, '0');
  const decodeBuffer = (buf: ArrayBuffer) => {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder('windows-1252').decode(buf);
    }
  };

  const parseCsv = (t: string) => {
    const L = t.split(/\r?\n/).filter((x) => x.trim());
    return {
      h: L[0].split(';').map((x) => x.trim()),
      r: L.slice(1).map((x) => x.split(';').map((y) => y.trim())),
    };
  };

  const qty = (s: string, F: number) => {
    s = (s || '').trim();
    if (!s.includes('/')) return 0;
    const n = s.endsWith('-');
    const parts = s.replace('-', '').replace(/\./g, '').split('/').map(Number);
    const a = parts[0] || 0;
    const b = parts[1] || 0;
    const u = a * F + b;
    return n ? -u : u;
  };

  const num = (s: string) => parseFloat((s || '').replace(/\./g, '').replace(',', '.')) || 0;

  const formatUnits = (u: number, F: number) => {
    const n = u < 0;
    const a = Math.abs(Math.round(u));
    const factor = F > 0 ? F : 1;
    return (
      Math.floor(a / factor).toLocaleString('pt-BR') +
      '/' +
      String(a % factor).padStart(2, '0') +
      (n ? '-' : '')
    );
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleBaseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { h, r } = parseCsv(decodeBuffer(await f.arrayBuffer()));
      const ix = (n: string) => h.findIndex((x) => x.toLowerCase().startsWith(n));
      const I = {
        p: ix('produto'),
        d: ix('descricao'),
        u: ix('unidade'),
        t: ix('transito'),
        dp: ix('disponivel'),
        iv: ix('inventario'),
        f: ix('fator'),
        c: ix('custo m'),
        s: ix('saldo atual'),
      };
      if (I.p < 0 || I.dp < 0 || I.iv < 0 || I.f < 0) {
        throw new Error('Não encontrei as colunas Produto, Disponivel, Inventario e Fator.');
      }
      const parsedBase = r
        .filter((x) => x[I.p])
        .map((x) => {
          const F = parseInt(x[I.f]) || 1;
          return {
            p: pad(x[I.p]),
            d: x[I.d],
            u: x[I.u],
            F,
            disp: qty(x[I.dp], F),
            inv0: qty(x[I.iv], F),
            sal: qty(x[I.s], F),
            custo: num(x[I.c]),
          };
        });
      setStatusBase(`${parsedBase.length} produtos carregados`);
      setErrorBase(false);
      persistState(parsedBase, over, hist);
    } catch (er: any) {
      setStatusBase(er.message);
      setErrorBase(true);
    }
  };

  const handleRecFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = [...(e.target.files || [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt', { numeric: true })
    );
    if (fs.length === 0) return;
    try {
      let n = 0;
      const nf: string[] = [];
      const msg: string[] = [];
      const snap: Record<string, any> = {};
      const newOver = { ...over };

      for (const f of fs) {
        const { h, r } = parseCsv(decodeBuffer(await f.arrayBuffer()));
        const ip = h.indexOf('Produto');
        const iq = h.indexOf('Qtdade');
        if (ip < 0 || iq < 0) {
          throw new Error(f.name + ': faltam as colunas Produto e Qtdade.');
        }
        const av = h.map((x, i) => (/^Avulsa/.test(x) ? i : -1)).filter((i) => i >= 0);
        r.forEach((x) => {
          if (!x[ip]) return;
          const p = pad(x[ip]);
          const cx = parseInt((x[iq] || '').replace(/\./g, ''));
          if (isNaN(cx)) return;
          const a = av.reduce((s, i) => s + (parseInt(x[i]) || 0), 0);
          if (!base.some((b) => b.p === p)) {
            nf.push(p + ' (' + x[ip + 1] + ')');
            return;
          }
          if (!(p in snap)) snap[p] = newOver[p];
          newOver[p] = { cx, src: f.name.replace(/\.csv$/i, ''), av: a };
          n++;
        });
        msg.push(f.name);
      }
      const newHist = [...hist, { name: msg.join(', '), n, snap }];
      setNotFoundList(nf);
      e.target.value = '';
      setStatusRec(`${n} itens recontados de ${fs.length} arquivo(s)`);
      setErrorRec(false);
      persistState(base, newOver, newHist);
    } catch (er: any) {
      setStatusRec(er.message);
      setErrorRec(true);
    }
  };

  const handleUndo = () => {
    if (hist.length === 0) return;
    const newHist = [...hist];
    const h = newHist.pop()!;
    const newOver = { ...over };
    for (const p in h.snap) {
      if (h.snap[p] === undefined) delete newOver[p];
      else newOver[p] = h.snap[p];
    }
    setNotFoundList([]);
    setStatusRec(newHist.length ? newHist.length + ' importação(ões) feita(s)' : '');
    persistState(base, newOver, newHist);
  };

  const processedRows = useMemo(() => {
    return base.map((x) => {
      const o = over[x.p];
      const rc = o ? o.cx : null;
      const src = o ? o.src : '';
      const inv = o ? o.cx * x.F : x.inv0;
      const dif0 = x.inv0 - x.disp;
      const dif = inv - x.disp;
      const rsVal = dif * x.custo;
      const rs0 = dif0 * x.custo;

      const a: string[] = [];
      if (o) {
        if (x.F > 1 && x.inv0 !== 0 && o.cx === x.inv0) {
          a.push('J parece estar em unidades, não em caixas');
        }
        if (dif0 !== 0 && dif !== 0 && Math.sign(dif) !== Math.sign(dif0)) {
          a.push('diferença mudou de sinal');
        }
        if (x.inv0 > 0 && Math.abs(inv - x.inv0) / x.inv0 >= 0.05) {
          a.push('mudou 5% ou mais do inventário anterior');
        }
        if (x.disp <= 0 && inv > 0) {
          a.push('contado, mas sem disponível no sistema');
        }
        if (o.av > 0) {
          a.push(o.av + ' un avulsas fora da J');
        }
        if (!x.custo && dif !== 0) {
          a.push('sem custo cadastrado');
        }
      }
      return {
        ...x,
        o,
        rc,
        src,
        inv,
        dif0,
        dif,
        rs: rsVal,
        rs0,
        al: a,
      };
    });
  }, [base, over]);

  // Lógica exata de soma do HTML original
  const S = (k: string, f?: (v: number) => number) =>
    processedRows.reduce((acc, x) => acc + (f ? f(x[k as keyof typeof x] as number) : (x[k as keyof typeof x] as number)), 0);

  const neg = (v: number) => Math.min(v, 0);
  const pos = (v: number) => Math.max(v, 0);

  const sumRs = S('rs');
  const sumRs0 = S('rs0');
  const sumFaltas = S('rs', neg);
  const sumFaltas0 = S('rs0', neg);
  const sumSobras = S('rs', pos);
  const sumSobras0 = S('rs0', pos);

  const recCount = processedRows.filter((x) => x.o).length;
  const alertCount = processedRows.filter((x) => x.al.length > 0).length;
  const noCustCount = processedRows.filter((x) => !x.custo).length;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = processedRows.filter((x) => {
      if (filterType === 'rec' && !x.o) return false;
      if (filterType === 'alr' && x.al.length === 0) return false;
      if (q && !(x.p + ' ' + x.d).toLowerCase().includes(q)) return false;
      return true;
    });

    rows.sort((a, b) => {
      const A = a[sortKey as keyof typeof a];
      const B = b[sortKey as keyof typeof b];
      if (typeof A === 'string' || typeof B === 'string') {
        return sortDir * String(A ?? '').localeCompare(String(B ?? ''), 'pt', { numeric: true });
      }
      return sortDir * ((Number(A ?? -Infinity)) - Number(B ?? -Infinity));
    });

    return rows;
  }, [processedRows, query, filterType, sortKey, sortDir]);

  const handleManualChange = (p: string, val: string) => {
    const v = val.replace(/\./g, '').trim();
    const newOver = { ...over };
    if (v === '') {
      delete newOver[p];
    } else if (/^\d+$/.test(v)) {
      newOver[p] = { cx: parseInt(v), src: 'manual', av: 0 };
    } else {
      return;
    }
    persistState(base, newOver, hist);
  };

  const handleSort = (k: string) => {
    if (k === 'al') return;
    setSortDir(sortKey === k ? -sortDir : 1);
    setSortKey(k);
  };

  const handleClear = () => {
    persistState(base, {}, []);
    setNotFoundList([]);
    setStatusRec('');
  };

  const handleExport = () => {
    const n = (v: number) => String(v.toFixed(2)).replace('.', ',');
    const header = [
      'Produto',
      'Descricao',
      'Un',
      'Disponivel',
      'Inventario',
      'Diferenca',
      'Recontado',
      'Origem',
      'Valor_Dif_RS',
    ];
    const lines = base.map((x) => {
      const o = over[x.p];
      const inv = o ? o.cx * x.F : x.inv0;
      const dif = inv - x.disp;
      const rsVal = dif * x.custo;
      return [
        x.p,
        x.d,
        x.u,
        formatUnits(x.disp, x.F),
        formatUnits(inv, x.F),
        formatUnits(dif, x.F),
        o ? 'S' : 'N',
        o ? o.src : '',
        n(rsVal),
      ].join(';');
    });
    const blob = new Blob(['\ufeff' + [header.join(';'), ...lines].join('\r\n')], {
      type: 'text/csv',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '02_05_02_recontada.csv';
    a.click();
  };

  const COLS = [
    ['p', 'Produto'],
    ['d', 'Descrição'],
    ['u', 'Un.'],
    ['disp', 'Disponível'],
    ['inv0', 'Inv. anterior'],
    ['rc', 'Recontagem (J)'],
    ['src', 'Origem'],
    ['inv', 'Inv. novo'],
    ['dif0', 'Dif. anterior'],
    ['dif', 'Dif. nova'],
    ['rs', 'Valor dif. (R$)'],
    ['al', 'Alertas'],
  ];

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', margin: '0 0 4px', fontWeight: 'bold' }}>Recontagem na 02.05.02</h1>
      <p style={{ color: '#5d6b66', margin: '0 0 18px', fontSize: '13.5px' }}>
        Carregue a 02.05.02 principal e uma ou mais 02.11.01. Só os produtos que estão na 02.11.01 mudam: o Inventário passa a ser a coluna J (Qtdade) e a Diferença é refeita (Inventário − Disponível).
      </p>

      {/* Upload Boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        <div style={{ background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', padding: '14px' }}>
          <b style={{ display: 'block', marginBottom: '2px', fontSize: '13.5px' }}>1. 02.05.02 principal (com inventário)</b>
          <small style={{ color: '#5d6b66', display: 'block', marginBottom: '10px', fontSize: '12px' }}>CSV exportado do sistema</small>
          <input type="file" accept=".csv,.txt" onChange={handleBaseFile} style={{ width: '100%', fontSize: '13px' }} />
          <div style={{ marginTop: '8px', fontSize: '13px', color: errorBase ? '#b3261e' : '#1b6e3a' }}>{statusBase}</div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', padding: '14px' }}>
          <b style={{ display: 'block', marginBottom: '2px', fontSize: '13.5px' }}>2. 02.11.01 (recontagens)</b>
          <small style={{ color: '#5d6b66', display: 'block', marginBottom: '10px', fontSize: '12px' }}>Importe uma recontagem por vez ou várias juntas. A mais recente sobrescreve a anterior</small>
          <input type="file" accept=".csv,.txt" multiple onChange={handleRecFiles} style={{ width: '100%', fontSize: '13px' }} />
          <div style={{ marginTop: '8px', fontSize: '13px', color: errorRec ? '#b3261e' : '#1b6e3a' }}>{statusRec}</div>
          {hist.map((h, i) => (
            <div key={i} style={{ fontSize: '12.5px', color: '#5d6b66', marginTop: '4px' }}>
              {i + 1}. {h.name} · {h.n} produtos
            </div>
          ))}
          {hist.length > 0 && (
            <button
              onClick={handleUndo}
              style={{ marginTop: '8px', padding: '5px 10px', fontSize: '12.5px', background: '#f3f5f4', border: '1px solid #d5dcd9', borderRadius: '6px', cursor: 'pointer' }}
            >
              Desfazer última importação
            </button>
          )}
        </div>
      </div>

      {notFoundList.length > 0 && (
        <div style={{ margin: '10px 0', padding: '10px 12px', background: '#fff1cf', color: '#8a5a00', borderRadius: '6px', fontSize: '13px' }}>
          Fora da 02.05.02 (ignorados): {notFoundList.join(', ')}
        </div>
      )}

      {/* Summary Cards */}
      {base.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          <div style={{ background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', padding: '12px' }}>
            <span style={{ display: 'block', color: '#5d6b66', fontSize: '12px' }}>Produtos recontados</span>
            <strong style={{ fontSize: '19px', fontVariantNumeric: 'tabular-nums' }}>{recCount}</strong>{' '}
            <em style={{ fontStyle: 'normal', color: '#5d6b66', fontSize: '12px' }}>de {base.length}</em>
          </div>
          <div style={{ background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', padding: '12px' }}>
            <span style={{ display: 'block', color: '#5d6b66', fontSize: '12px' }}>Resultado líquido</span>
            <strong style={{ fontSize: '19px', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(sumRs)}</strong>{' '}
            <em style={{ fontStyle: 'normal', color: '#5d6b66', fontSize: '12px' }}>antes: {formatCurrency(sumRs0)}</em>
          </div>
          <div style={{ background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', padding: '12px' }}>
            <span style={{ display: 'block', color: '#5d6b66', fontSize: '12px' }}>Faltas</span>
            <strong style={{ fontSize: '19px', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(sumFaltas)}</strong>{' '}
            <em style={{ fontStyle: 'normal', color: '#5d6b66', fontSize: '12px' }}>antes: {formatCurrency(sumFaltas0)}</em>
          </div>
          <div style={{ background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', padding: '12px' }}>
            <span style={{ display: 'block', color: '#5d6b66', fontSize: '12px' }}>Sobras</span>
            <strong style={{ fontSize: '19px', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(sumSobras)}</strong>{' '}
            <em style={{ fontStyle: 'normal', color: '#5d6b66', fontSize: '12px' }}>antes: {formatCurrency(sumSobras0)}</em>
          </div>
          <div style={{ background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', padding: '12px' }}>
            <span style={{ display: 'block', color: '#5d6b66', fontSize: '12px' }}>Com alerta</span>
            <strong style={{ fontSize: '19px', fontVariantNumeric: 'tabular-nums' }}>{alertCount}</strong>{' '}
            <em style={{ fontStyle: 'normal', color: '#5d6b66', fontSize: '12px' }}>{noCustCount} sem custo ficam fora do valor</em>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código ou descrição"
          style={{ flex: '1 1 220px', padding: '8px 10px', border: '1px solid #d5dcd9', borderRadius: '6px', background: '#fff', font: 'inherit' }}
        />
        <select
          value={filterType}
          onChange={(e: any) => setFilterType(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #d5dcd9', borderRadius: '6px', background: '#fff', font: 'inherit', cursor: 'pointer' }}
        >
          <option value="rec">Só recontados</option>
          <option value="all">Todos os produtos</option>
          <option value="alr">Só com alerta</option>
        </select>
        <button onClick={handleClear} style={{ padding: '8px 12px', border: '1px solid #d5dcd9', borderRadius: '6px', background: '#fff', cursor: 'pointer', font: 'inherit' }}>
          Limpar recontagens
        </button>
        <button
          onClick={handleExport}
          disabled={base.length === 0}
          style={{ padding: '8px 12px', border: '1px solid #0d6b5c', borderRadius: '6px', background: '#0d6b5c', color: '#fff', cursor: base.length === 0 ? 'default' : 'pointer', opacity: base.length === 0 ? 0.5 : 1, font: 'inherit', fontWeight: 600 }}
        >
          Exportar CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', maxHeight: '70vh' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1060px', fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c[0]}
                  onClick={() => handleSort(c[0])}
                  style={{
                    position: 'sticky',
                    top: 0,
                    background: '#fff',
                    zIndex: 1,
                    fontWeight: 600,
                    fontSize: '12.5px',
                    color: '#5d6b66',
                    cursor: c[0] === 'al' ? 'default' : 'pointer',
                    padding: '7px 10px',
                    borderBottom: '1px solid #d5dcd9',
                    textAlign: c[0] === 'p' || c[0] === 'd' || c[0] === 'u' ? 'left' : 'right',
                    userSelect: 'none',
                  }}
                >
                  {c[1]} {sortKey === c[0] ? (sortDir === 1 ? '▲' : '▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: '30px', textAlign: 'center', color: '#5d6b66' }}>
                  {base.length > 0 ? 'Nenhum produto neste filtro. Carregue a 02.11.01 ou mude o filtro.' : 'Carregue a 02.05.02 principal para começar.'}
                </td>
              </tr>
            ) : (
              filteredRows.map((x) => (
                <tr key={x.p} className={x.o ? 'ch' : ''} style={{ background: x.o ? '#eef7f4' : 'transparent' }}>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'left', whiteSpace: 'nowrap' }}>{x.p}</td>
                  <td title={x.d} style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'left', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.d}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'left', whiteSpace: 'nowrap' }}>{x.u}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatUnits(x.disp, x.F)}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatUnits(x.inv0, x.F)}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <input
                      value={x.rc ?? ''}
                      placeholder="–"
                      inputMode="numeric"
                      onChange={(e) => handleManualChange(x.p, e.target.value)}
                      style={{ width: '84px', padding: '4px 6px', textAlign: 'right', border: '1px solid ' + (x.o ? '#0d6b5c' : '#d5dcd9'), borderRadius: '5px', background: '#fff', font: 'inherit' }}
                    />
                  </td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'right', whiteSpace: 'nowrap' }}>{x.src}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatUnits(x.inv, x.F)}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'right', whiteSpace: 'nowrap', color: x.dif0 < 0 ? '#b3261e' : x.dif0 > 0 ? '#1b6e3a' : 'inherit' }}>{formatUnits(x.dif0, x.F)}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'right', whiteSpace: 'nowrap', color: x.dif < 0 ? '#b3261e' : x.dif0 > 0 ? '#1b6e3a' : 'inherit' }}>{formatUnits(x.dif, x.F)}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'right', whiteSpace: 'nowrap', color: x.rs < 0 ? '#b3261e' : x.rs > 0 ? '#1b6e3a' : 'inherit' }}>{x.custo ? formatCurrency(x.rs) : '–'}</td>
                  <td style={{ padding: '7px 10px', borderBottom: '1px solid #d5dcd9', textAlign: 'left', whiteSpace: 'normal', minWidth: '220px' }}>
                    {x.al.map((t: string, idx: number) => (
                      <span key={idx} style={{ display: 'inline-block', background: '#fff1cf', color: '#8a5a00', borderRadius: '4px', padding: '1px 6px', margin: '1px 3px 1px 0', fontSize: '12px' }}>
                        {t}
                      </span>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
