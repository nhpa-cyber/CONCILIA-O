import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { RawData } from '../data/types';

interface Recontagem020502ViewProps {
  data: RawData;
  onUpdateData: (newData: RawData, desc: string) => void;
}

export const Recontagem020502View: React.FC<Recontagem020502ViewProps> = ({
  data,
  onUpdateData,
}) => {
  const recState = data.recontagem020502 || { over: {}, hist: [] };
  const base = useMemo(() => {
    if (!data.ec || !data.ec.r || data.ec.r.length === 0) return [];
    
    const { h, r } = data.ec;
    const ix = (n: string) => h.findIndex((x) => x.toLowerCase().startsWith(n));
    const I = {
      p: ix('produto'), d: ix('descricao'), u: ix('unidade'), t: ix('transito'),
      dp: ix('disponivel'), iv: ix('inventario'), f: ix('fator'), c: ix('custo m'), s: ix('saldo atual'),
    };
    
    if (I.p < 0 || I.dp < 0 || I.iv < 0 || I.f < 0) {
      I.p = 3; I.d = 4; I.u = 5; I.dp = 27; I.iv = 28; I.f = 23; I.c = 21; I.s = 11;
    }
    
    const padCode = (p: any) => String(p || '').replace(/\D/g, '').padStart(8, '0');
    const qty = (s: string, F: number) => {
      s = (s || '').trim();
      if (!s.includes('/')) return 0;
      const n = s.endsWith('-');
      const parts = s.replace('-', '').replace(/\./g, '').split('/').map(Number);
      return n ? -(parts[0] * F + parts[1]) : (parts[0] * F + parts[1]);
    };
    const num = (s: string) => parseFloat((s || '').replace(/\./g, '').replace(',', '.')) || 0;

    return r.filter((x) => x[I.p]).map((x) => ({
      p: padCode(x[I.p]), d: String(x[I.d]), u: String(x[I.u]),
      F: parseInt(String(x[I.f])) || 1,
      disp: qty(String(x[I.dp]), parseInt(String(x[I.f])) || 1),
      inv0: qty(String(x[I.iv]), parseInt(String(x[I.f])) || 1),
      sal: qty(String(x[I.s]), parseInt(String(x[I.f])) || 1),
      custo: num(String(x[I.c])),
    }));
  }, [data.ec]);

  const [over, setOver] = useState<Record<string, { 
    recontagens: { cx: number; src: string }[];
    p: string;
    d: string;
    cx?: number;
    src?: string;
    av?: number;
  }>>(recState.over || {});
  const [hist, setHist] = useState<{ name: string; n: number; snap: Record<string, any> }[]>(recState.hist || []);

  const [query, setQuery] = useState('');
  const [statusRec, setStatusRec] = useState<string>('');
  const [errorRec, setErrorRec] = useState<boolean>(false);
  const [notFoundList, setNotFoundList] = useState<string[]>([]);

  const persistState = (
    arg1: any,
    arg2?: Record<string, any>,
    arg3?: any[]
  ) => {
    let newOver: Record<string, any>;
    let newHist: any[];
    if (arg3 !== undefined) {
      newOver = arg2 || {};
      newHist = arg3 || [];
    } else {
      newOver = arg1 || {};
      newHist = (arg2 as any[]) || [];
    }
    setOver(newOver);
    setHist(newHist);
    const nextData: RawData = {
      ...data,
      recontagem020502: { base: [], over: newOver, hist: newHist },
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
    const L = t.split(/\r?\n/).filter((x) => x.trim().length > 0);
    if (L.length === 0) return { h: [], r: [] };
    const firstLine = L[0];
    const delim = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
    return {
      h: L[0].split(delim).map((x) => x.trim().replace(/^"|"$/g, '')),
      r: L.slice(1).map((x) => x.split(delim).map((y) => y.trim().replace(/^"|"$/g, ''))),
    };
  };

  const formatUnits = (u: number, F: number) => {
    const totalCaixas = Math.round(u / (F > 0 ? F : 1));
    return totalCaixas.toLocaleString('pt-BR');
  };

  // Importar arquivo 02.11.01 lendo exclusivamente as Colunas C (Código), D (Descrição) e J (Quantidade)
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
      const newOver = Object.keys(over).length > 0 ? { ...over } : {};

      for (const f of fs) {
        let h: string[] = [];
        let r: string[][] = [];

        const isExcel = f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls');
        if (isExcel) {
          const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const sheetData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
          if (sheetData.length > 0) {
            h = sheetData[0].map((s) => String(s ?? '').trim());
            r = sheetData.slice(1).map((row) => (row as any[]).map((c) => String(c ?? '').trim()));
          }
        } else {
          const { h: ch, r: cr } = parseCsv(decodeBuffer(await f.arrayBuffer()));
          h = ch;
          r = cr;
        }

        if (h.length === 0 && r.length === 0) continue;

        // Localiza as Colunas C, D e J:
        // Coluna C: Produto / Código (índice 2)
        let ip = h.findIndex((x) => {
          const norm = String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return norm === 'produto' || norm === 'codigo' || norm === 'cod' || norm.startsWith('prod');
        });
        if (ip < 0 && h.length > 2) ip = 2;

        // Coluna D: Descrição (índice 3)
        let id = h.findIndex((x) => {
          const norm = String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return norm.includes('descricao') || norm.includes('descr') || norm === 'nome';
        });
        if (id < 0 && h.length > 3) id = 3;

        // Coluna J: Qtdade / Quantidade (índice 9)
        let iq = h.findIndex((x) => {
          const norm = String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return norm.startsWith('qtdad') || norm.startsWith('quant') || norm === 'qtd';
        });
        if (iq < 0 && h.length > 9) iq = 9;

        if (ip < 0 || iq < 0) {
          throw new Error(`${f.name}: Não foi possível localizar as Colunas C (Produto) e J (Qtdade).`);
        }

        r.forEach((x) => {
          if (!x[ip]) return;
          const p = pad(x[ip]);
          const desc = id >= 0 ? String(x[id] || '').trim() : '';
          const rawQ = String(x[iq] || '').replace(/\./g, '').replace(',', '.').trim();
          const cx = parseInt(rawQ);
          if (isNaN(cx)) return;

          const baseItem = base.find((b) => b.p === p);
          if (!baseItem && base.length > 0) {
            nf.push(`${p} (${desc || 'Sem desc.'})`);
          }

          if (!(p in snap)) snap[p] = newOver[p];

          // Estrutura atualizada: armazena um array de recontagens
          if (!newOver[p]) {
            newOver[p] = { 
              recontagens: [], 
              p, 
              d: desc || baseItem?.d || `PRODUTO ${p}` 
            };
          }
          
          if (!newOver[p].recontagens) {
            newOver[p].recontagens = [];
          }
          
          newOver[p].recontagens.push({
            cx,
            src: f.name.replace(/\.[^/.]+$/, ''),
          });
          
          n++;
        });
        msg.push(f.name);
      }

      const newHist = [...hist, { name: msg.join(', '), n, snap }];
      setNotFoundList(nf);
      e.target.value = '';
      setStatusRec(`${n} itens recontados com sucesso de ${fs.length} arquivo(s)`);
      setErrorRec(false);
      persistState(base, newOver, newHist);
    } catch (er: any) {
      setStatusRec(er.message || 'Erro ao processar arquivo.');
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
    setStatusRec(newHist.length ? newHist.length + ' importação(ões) ativa(s)' : '');
    persistState(base, newOver, newHist);
  };

  // Lista dos itens recontados com foco nas múltiplas recontagens
  const recontadosList = useMemo(() => {
    return Object.entries(over).map(([p, item]) => {
      const baseItem = base.find((b) => b.p === p);
      const d = item.d || baseItem?.d || `PRODUTO ${p}`;
      const disp = baseItem ? formatUnits(baseItem.disp, baseItem.F) : '—';
      
      // Mapeia todas as recontagens para um objeto dinâmico
      const recontagensMap: Record<string, number> = {};
      (item.recontagens || []).forEach((r, idx) => {
        recontagensMap[`cx${idx + 1}`] = r.cx;
      });

      return {
        p,
        d,
        recontagens: item.recontagens || [], // Array completo
        recontagensMap, // Objeto para acesso rápido: { cx1: 10, cx2: 20 }
        disp,
        rawDisp: baseItem?.disp || 0,
        src: (item.recontagens || []).map(r => r.src).join(', '),
      };
    }).sort((a, b) => a.p.localeCompare(b.p));
  }, [over, base]);

  // Lista filtrada pelo campo de busca
  const filteredRecontados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return recontadosList;
    return recontadosList.filter(
      (item) => item.p.toLowerCase().includes(q) || item.d.toLowerCase().includes(q)
    );
  }, [recontadosList, query]);

  const handleClear = () => {
    setOver({});
    setHist([]);
    // Update data in Firestore without removing 'base'
    const nextData: RawData = {
      ...data,
      recontagem020502: { ...recState, base: base, over: {}, hist: [] },
    };
    onUpdateData(nextData, 'Recontagens limpas');
    setNotFoundList([]);
    setStatusRec('Recontagens limpas com sucesso.');
  };

  const handleExport = () => {
    const maxRecs = Math.max(...recontadosList.map(x => x.recontagens.length), 1);
    const header = [
      'Produto',
      'Descricao',
      'Disponivel_020502',
      ...Array.from({ length: maxRecs }).map((_, i) => `Recontagem_${i + 1}`),
      'Origens',
    ];
    const lines = recontadosList.map((x) => {
      return [
        x.p,
        `"${x.d.replace(/"/g, '""')}"`,
        x.disp,
        ...Array.from({ length: maxRecs }).map((_, i) => x.recontagens[i]?.cx || ''),
        `"${x.src.replace(/"/g, '""')}"`,
      ].join(';');
    });
    const blob = new Blob(['\ufeff' + [header.join(';'), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `itens_recontados_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const handlePromoteRecontagem = (colIndex: number) => {
    if (!data.ec || !data.ec.r) return;
    
    const newEcR = [...data.ec.r];
    const { h } = data.ec;
    
    const ix = (n: string) => h.findIndex((x) => x.toLowerCase().startsWith(n));
    let I = {
      p: ix('produto'), d: ix('descricao'), u: ix('unidade'), t: ix('transito'),
      dp: ix('disponivel'), iv: ix('inventario'), f: ix('fator'), c: ix('custo m'), s: ix('saldo atual'),
    };
    if (I.p < 0 || I.dp < 0 || I.iv < 0 || I.f < 0) {
      I.p = 3; I.d = 4; I.u = 5; I.dp = 27; I.iv = 28; I.f = 23; I.c = 21; I.s = 11;
    }
    
    let updatedCount = 0;
    
    recontadosList.forEach(item => {
        // Apenas processa se o produto tiver uma recontagem nessa coluna específica
        if (colIndex >= item.recontagens.length) return;
        
        const recontagem = item.recontagens[colIndex];
        
        // 1. Atualiza na tabela ec (Estoque Central)
        const rowIndexEc = newEcR.findIndex(row => pad(row[I.p]) === item.p);
        if (rowIndexEc !== -1) {
            newEcR[rowIndexEc] = [...newEcR[rowIndexEc]];
            newEcR[rowIndexEc][I.dp] = `${recontagem.cx}/0`;
            updatedCount++;
        }
    });
    
    // 2. Atualiza no Resumo (data.res)
    const newRes = (data.res || []).map(row => {
        const prodCode = String(row[0]).padStart(8, '0');
        const item = recontadosList.find(x => x.p === prodCode);
        if (item && colIndex < item.recontagens.length) {
            const newRow = [...row] as any[];
            newRow[7] = item.recontagens[colIndex].cx * (item.recontagens[colIndex].cx > 0 ? 1 : 1); // Simplificado: cx to units
            // Nota: Se precisar converter para unidades totais, deveria ser:
            // newRow[7] = item.recontagens[colIndex].cx * (baseItem?.F || 1);
            // Vou usar o fator do item se existir na base
            const baseItem = base.find(b => b.p === prodCode);
            newRow[7] = item.recontagens[colIndex].cx * (baseItem?.F || 1);
            return newRow;
        }
        return row;
    });
    
    const nextData = {
        ...data,
        ec: { ...data.ec, r: newEcR },
        res: newRes
    };
    onUpdateData(nextData, `Promovida Recontagem ${colIndex + 1} (${updatedCount} produtos atualizados na 02.05.02 e Resumo)`);
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', margin: '0 0 4px', fontWeight: 'bold' }}>Recontagem na 02.05.02</h1>
      <p style={{ color: '#5d6b66', margin: '0 0 18px', fontSize: '13.5px' }}>
        A base principal <b>02.05.02 é sincronizada automaticamente da aba Estoque Central</b>. Carregue abaixo os arquivos de <b>02.11.01 (recontagens)</b>: o sistema extrai exclusivamente as <b>Colunas C (Código)</b>, <b>D (Descrição)</b> e <b>J (Quantidade)</b>.
      </p>

      {/* Upload Boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <b style={{ fontSize: '13.5px', color: '#0f172a' }}>1. Base 02.05.02 (Estoque Central)</b>
            <span style={{ fontSize: '11px', background: base.length > 0 ? '#dcfce7' : '#fee2e2', color: base.length > 0 ? '#15803d' : '#b91c1c', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold' }}>
              {base.length > 0 ? '✓ Sincronizado' : 'Aguardando'}
            </span>
          </div>
          <small style={{ color: '#64748b', display: 'block', marginBottom: '8px', fontSize: '12px' }}>
            {base.length > 0 
              ? `${base.length} produtos carregados automaticamente da aba Estoque Central.` 
              : 'Nenhum relatório 02.05.02 importado no momento.'}
          </small>
          <div style={{ fontSize: '12px', color: base.length > 0 ? '#15803d' : '#b91c1c', fontWeight: 600 }}>
            {base.length > 0 ? `● Base ativa com ${base.length} produtos prontos para recontagem` : '● Importe a 02.05.02 na aba Estoque Central'}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #d5dcd9', borderRadius: '8px', padding: '14px' }}>
          <b style={{ display: 'block', marginBottom: '2px', fontSize: '13.5px' }}>2. 02.11.01 (recontagens)</b>
          <small style={{ color: '#5d6b66', display: 'block', marginBottom: '8px', fontSize: '12px' }}>
            Importe o arquivo 02.11.01 (.xlsx, .xls ou .csv). O sistema sobe exclusivamente as <b>Colunas C, D e J</b>.
          </small>
          <input 
            type="file" 
            accept=".csv,.txt,.xlsx,.xls" 
            multiple 
            onChange={handleRecFiles} 
            style={{ width: '100%', fontSize: '13px' }} 
          />
          <div style={{ marginTop: '8px', fontSize: '13px', color: errorRec ? '#b3261e' : '#1b6e3a', fontWeight: '500' }}>
            {statusRec}
          </div>
          {Array.isArray(hist) && hist.map((h, i) => (
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
          Itens fora da 02.05.02: {notFoundList.join(', ')}
        </div>
      )}

      {/* TABELA DE ITENS RECONTADOS (COLUNAS C, D, J) */}
      {recontadosList.length > 0 ? (
        <div style={{ background: '#fff', border: '2px solid #D97706', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 4px 12px rgba(217, 119, 6, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>📋</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#92400E' }}>
                  ITENS RECONTADOS NA 02.11.01 ({filteredRecontados.length} {filteredRecontados.length === 1 ? 'item' : 'itens'})
                </h3>
                <small style={{ color: '#6B7280', fontSize: '12px' }}>
                  Colunas importadas do arquivo: <b>Código (Col. C)</b>, <b>Descrição (Col. D)</b> e <b>Quantidade (Col. J)</b>.
                </small>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar código ou descrição..."
                style={{ padding: '6px 10px', border: '1px solid #d5dcd9', borderRadius: '6px', fontSize: '12.5px', background: '#fff', width: '220px' }}
              />
              <button
                type="button"
                onClick={handleExport}
                style={{ padding: '6px 12px', fontSize: '12px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                📥 Exportar CSV
              </button>
              <button
                type="button"
                onClick={handleClear}
                style={{ padding: '6px 12px', fontSize: '12px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Limpar recontagens
              </button>
            </div>
          </div>

          <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              {/* Cálculo do número máximo de colunas de recontagem */}
              {(() => {
                const maxRecs = Math.max(...recontadosList.map(r => r.recontagens.length), 1);
                return (
                  <>
                    <thead>
                      <tr style={{ background: '#FEF3C7', color: '#92400E', borderBottom: '2px solid #FDE68A', position: 'sticky', top: 0, zIndex: 2 }}>
                        <th style={{ padding: '9px 12px', textAlign: 'left', width: '130px' }}>Código</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left' }}>Descrição</th>
                        <th style={{ padding: '9px 12px', textAlign: 'right', width: '130px' }}>Disp. 02.05.02</th>
                        {Array.from({ length: maxRecs }).map((_, i) => (
                          <th key={i} style={{ padding: '9px 12px', textAlign: 'right', width: '130px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                <span>Recontagem {i + 1}</span>
                                <button
                                    onClick={() => handlePromoteRecontagem(i)}
                                    style={{ padding: '2px 6px', fontSize: '10px', background: '#0D9488', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    Promover
                                </button>
                            </div>
                          </th>
                        ))}
                        <th style={{ padding: '9px 12px', textAlign: 'left', width: '140px' }}>Arquivos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecontados.length === 0 ? (
                        <tr>
                          <td colSpan={maxRecs + 4} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                            Nenhum item encontrado para a busca "{query}".
                          </td>
                        </tr>
                      ) : (
                        filteredRecontados.map((item) => (
                          <tr key={item.p} style={{ borderBottom: '1px solid #F3F4F6', background: '#FFFDF5' }}>
                            <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 'bold', color: '#1F2937' }}>{item.p}</td>
                            <td style={{ padding: '7px 12px', fontWeight: '500', color: '#374151' }}>{item.d}</td>
                            <td style={{ padding: '7px 12px', textAlign: 'right', color: '#4B5563' }}>{item.disp} cx</td>
                            {Array.from({ length: maxRecs }).map((_, i) => (
                              <td key={i} style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 'bold', color: '#1E40AF' }}>
                                {item.recontagens[i] ? (
                                  <span style={{ 
                                    background: (i === 0 ? (item.recontagens[i].cx === item.rawDisp) : (item.recontagens[i].cx === item.recontagens[i-1]?.cx)) ? '#DCFCE7' : '#DBEAFE', 
                                    padding: '3px 8px', borderRadius: '4px' 
                                  }}>
                                    {item.recontagens[i].cx.toLocaleString('pt-BR')} cx
                                  </span>
                                ) : '—'}
                              </td>
                            ))}
                            <td style={{ padding: '7px 12px', fontSize: '11.5px', color: '#6B7280' }}>{item.src}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </>
                );
              })()}
            </table>
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '36px 20px', textAlign: 'center', color: '#64748b', marginTop: '10px' }}>
          <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>📋</span>
          <b style={{ fontSize: '14.5px', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
            Nenhuma recontagem 02.11.01 carregada
          </b>
          <p style={{ fontSize: '12.5px', margin: 0, color: '#64748b' }}>
            Importe o arquivo da <b>02.11.01</b> acima para exibir imediatamente a tabela com <b>Código (Col. C)</b>, <b>Descrição (Col. D)</b> e <b>Quantidade (Col. J)</b>.
          </p>
        </div>
      )}
    </div>
  );
};
