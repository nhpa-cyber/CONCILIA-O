import React, { useState, useMemo } from 'react';
import { CalculatedProduct } from '../data/types';
import { N, Z, Rt } from '../utils/formatters';
import { sum } from '../utils/calc';

interface ResumoViewProps {
  calculated: CalculatedProduct[];
  onUpdateRes: (index: number, key: 'G' | 'J', value: number) => void;
  onImportT7: (content: string, fileName: string) => void;
  t7BannerHtml: string | null;
  ecBannerHtml?: string | null;
  onRecontar?: (code: number) => void;
}

export const ResumoView: React.FC<ResumoViewProps> = ({
  calculated,
  onUpdateRes,
  onImportT7,
  t7BannerHtml,
  ecBannerHtml,
  onRecontar,
}) => {
  const [query, setQuery] = useState('');
  const [activeEditCell, setActiveEditCell] = useState<{ index: number; key: 'G' | 'J' } | null>(null);

  const handleFileT7Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let text = '';
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(
          reader.result as ArrayBuffer
        );
      } catch {
        text = new TextDecoder('windows-1252').decode(
          reader.result as ArrayBuffer
        );
      }
      onImportT7(text, file.name);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const kpis = useMemo(() => {
    const active = calculated.filter((r) => !r.desativado);

    const dif = sum(active, (r) => r.S);
    const hf = sum(active, (r) => r.Y);
    const hp = sum(active, (r) => r.Z);
    const so = active.filter((r) => r.R > 0).length;
    const fa = active.filter((r) => r.R < 0).length;
    const ok = active.filter((r) => r.R === 0).length;
    const totalCount = so + fa + ok || 1;
    const toolkit = N((ok / totalCount) * 100, 0);

    return {
      date: new Date().toLocaleDateString('pt-BR'),
      dif,
      hf,
      hp,
      difHecto: hf - hp,
      estFiscal: sum(active, (r) => r.I),
      estFisico: sum(active, (r) => r.L),
      so,
      fa,
      ok,
      toolkit,
    };
  }, [calculated]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return calculated
      .map((r, index) => ({ ...r, originalIndex: index }))
      .filter((r) => {
        if (!q) return true;
        return (r.c + ' ' + r.d).toLowerCase().includes(q);
      });
  }, [calculated, query]);

  const sg = (v: number) => (v < 0 && !Z(v) ? '-' : '') + N(v, 0);

  return (
    <section>
      <div className="kpis">
        <div className="k">
          <small>DATA</small>
          <span>{kpis.date}</span>
        </div>
        <div className={`k ${kpis.dif < 0 ? 'r' : 'g'}`}>
          <small>DIF EM REAIS</small>
          <span>{Rt(kpis.dif)}</span>
        </div>
        <div className="k">
          <small>DIF EM HECTO</small>
          <span>{N(kpis.difHecto)}</span>
        </div>
        <div className="k">
          <small>ESTOQUE FISCAL</small>
          <span>{Rt(kpis.estFiscal)}</span>
        </div>
        <div className="k">
          <small>ESTOQUE FÍSICO</small>
          <span>{Rt(kpis.estFisico)}</span>
        </div>
        <div className="k">
          <small>HECTO FISCAL / FÍSICO</small>
          <span>{N(kpis.hf)} / {N(kpis.hp)}</span>
        </div>
        <div className="k g">
          <small>SOBRAS</small>
          <span>{kpis.so}</span>
        </div>
        <div className="k r">
          <small>FALTAS</small>
          <span>{kpis.fa}</span>
        </div>
        <div className="k">
          <small>OK</small>
          <span>{kpis.ok}</span>
        </div>
        <div className="k">
          <small>TOOLKIT</small>
          <span>{kpis.toolkit}%</span>
        </div>
      </div>

      <div className="tools">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar código ou produto…"
          size={32}
        />
        <span>{filtered.length} linhas</span>
        <label
          className="btn"
          style={{ padding: '6px 14px', fontSize: '13px', cursor: 'pointer' }}
        >
          IMPORTAR TABELA 7
          <input
            type="file"
            accept=".txt,.csv,.tsv,text/plain"
            hidden
            onChange={handleFileT7Change}
          />
        </label>
        <small style={{ color: '#555' }}>
          Sem blocos manuais: exibição limpa e contínua. Clique em qualquer valor de Disponível ou Inventário para ajustar.
        </small>
      </div>

      {ecBannerHtml && (
        <div
          className="imp on"
          dangerouslySetInnerHTML={{ __html: ecBannerHtml }}
          style={{ marginBottom: '8px' }}
        />
      )}

      {t7BannerHtml && (
        <div
          className="imp on"
          dangerouslySetInnerHTML={{ __html: t7BannerHtml }}
        />
      )}

      <div className="wrap">
        <div className="sc" style={{ width: '100%' }}>
          <table id="table-r">
            <colgroup>
              {[56, 330, 40, 70, 50, 92, 70, 50, 92, 56, 44, 56, 56, 62, 52, 92, 66, 76, 46, 70, 60, 72, 72].map(
                (w, idx) => (
                  <col key={idx} width={w} />
                )
              )}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>COD</th>
                <th rowSpan={2}>DESCRIÇÃO PRODUTO</th>
                <th rowSpan={2}>TIPO</th>
                <th colSpan={3}>DISPONIVEL PROMAX</th>
                <th colSpan={3}>INVENTARIO</th>
                <th colSpan={4}>AJUSTES</th>
                <th colSpan={2}>DIFERENÇAS</th>
                <th rowSpan={2}>DIF R$</th>
                <th rowSpan={2}>JUSTIF.</th>
                <th rowSpan={2}>PREÇO CX</th>
                <th rowSpan={2}>FATOR</th>
                <th rowSpan={2}>PREÇO UND</th>
                <th rowSpan={2}>FATOR HECTO</th>
                <th rowSpan={2}>HECTO FISCAL</th>
                <th rowSpan={2}>HECTO FÍSICO</th>
              </tr>
              <tr className="h2">
                <th>UNID</th>
                <th>CX</th>
                <th>VALOR R$</th>
                <th>UNID</th>
                <th>CX</th>
                <th>VALOR R$</th>
                <th>SOBRAS</th>
                <th>PNC</th>
                <th>FALTAS</th>
                <th>REPACK</th>
                <th>DIF UNID</th>
                <th>DIF CX</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.c}>
                  <td 
                    className="c font-mono"
                    style={{ cursor: 'pointer', fontWeight: 'bold' }}
                    onDoubleClick={() => onRecontar && onRecontar(r.c)}
                    title="Dê DUPLO CLIQUE para abrir este item na Recontagem"
                  >
                    {r.c}
                  </td>
                  <td title={r.d}>{r.d}</td>
                  <td className="c">{r.t}</td>
                  <td
                    className="n ed-cell"
                    onClick={() => setActiveEditCell({ index: r.originalIndex, key: 'G' })}
                    title="Clique para editar Disponível Promax"
                    style={{ cursor: 'pointer' }}
                  >
                    {activeEditCell?.index === r.originalIndex && activeEditCell?.key === 'G' ? (
                      <input
                        autoFocus
                        defaultValue={r.G}
                        key={`g-${r.c}-${r.G}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value.replace(',', '.')) || 0;
                          if (val !== r.G) onUpdateRes(r.originalIndex, 'G', val);
                          setActiveEditCell(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = Number((e.target as HTMLInputElement).value.replace(',', '.')) || 0;
                            if (val !== r.G) onUpdateRes(r.originalIndex, 'G', val);
                            setActiveEditCell(null);
                          }
                          if (e.key === 'Escape') {
                            setActiveEditCell(null);
                          }
                        }}
                      />
                    ) : (
                      <span>{r.G}</span>
                    )}
                  </td>
                  <td className="n">{r.H}</td>
                  <td className="n">{N(r.I)}</td>
                  <td
                    className="n ed-cell"
                    onClick={() => setActiveEditCell({ index: r.originalIndex, key: 'J' })}
                    title="Clique para editar Inventário Físico"
                    style={{ cursor: 'pointer' }}
                  >
                    {activeEditCell?.index === r.originalIndex && activeEditCell?.key === 'J' ? (
                      <input
                        autoFocus
                        defaultValue={r.J}
                        key={`j-${r.c}-${r.J}`}
                        onBlur={(e) => {
                          const val = Number(e.target.value.replace(',', '.')) || 0;
                          if (val !== r.J) onUpdateRes(r.originalIndex, 'J', val);
                          setActiveEditCell(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = Number((e.target as HTMLInputElement).value.replace(',', '.')) || 0;
                            if (val !== r.J) onUpdateRes(r.originalIndex, 'J', val);
                            setActiveEditCell(null);
                          }
                          if (e.key === 'Escape') {
                            setActiveEditCell(null);
                          }
                        }}
                      />
                    ) : (
                      <span>{r.J}</span>
                    )}
                  </td>
                  <td className="n">{r.K}</td>
                  <td className="n">{N(r.L)}</td>
                  <td className="n">{r.M}</td>
                  <td className="n">{r.N}</td>
                  <td className="n">{r.O}</td>
                  <td className="n">{r.P}</td>
                  <td className="n">{sg(r.Q)}</td>
                  <td className="n">{sg(r.R)}</td>
                  <td className={`n ${r.S < 0 ? 'neg' : ''}`}>
                    {(r.S < 0 ? '-' : '') + N(r.S)}
                  </td>
                  <td className="n">{r.T}</td>
                  <td className="n">{N(r.U)}</td>
                  <td className="n">{r.V}</td>
                  <td className="n">{N(r.W)}</td>
                  <td className="n">{r.X}</td>
                  <td className="n">{N(r.Y)}</td>
                  <td className="n">{N(r.Z)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
