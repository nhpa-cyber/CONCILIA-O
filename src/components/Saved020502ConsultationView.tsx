import React, { useState, useMemo } from 'react';
import { DashboardSnapshot, RawData } from '../data/types';
import { FolderArchive, Trash2, ArrowRight, Calendar, Search, FileText, CheckCircle2 } from 'lucide-react';
import { formatBRL } from '../utils/formatters';

interface Saved020502ConsultationViewProps {
  savedSnapshots: DashboardSnapshot[];
  onLoadToEstoqueCentral: (snapshot: DashboardSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  onClearAllSnapshots: () => void;
  onNavigateToDashboard: () => void;
}

export const Saved020502ConsultationView: React.FC<Saved020502ConsultationViewProps> = ({
  savedSnapshots,
  onLoadToEstoqueCentral,
  onDeleteSnapshot,
  onClearAllSnapshots,
  onNavigateToDashboard,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    savedSnapshots.length > 0 ? savedSnapshots[0].id : null
  );

  const filteredSnapshots = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return savedSnapshots;
    return savedSnapshots.filter(
      (s) =>
        s.date.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        (s.savedAt && s.savedAt.toLowerCase().includes(q))
    );
  }, [savedSnapshots, searchTerm]);

  const selectedSnapshot = useMemo(() => {
    if (!selectedSnapshotId && savedSnapshots.length > 0) return savedSnapshots[0];
    return savedSnapshots.find((s) => s.id === selectedSnapshotId) || savedSnapshots[0] || null;
  }, [savedSnapshots, selectedSnapshotId]);

  return (
    <div className="w-full bg-slate-50 min-h-screen pb-16 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs sticky top-0 z-10 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center text-zinc-950 font-black shadow-inner">
              <FolderArchive className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Consulta de 02.05.02 Salvas
                </h1>
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {savedSnapshots.length} {savedSnapshots.length === 1 ? 'fechamento' : 'fechamentos'} saldos
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Consulte, visualize os detalhes e carregue qualquer 02.05.02 salva diretamente para o Estoque Central
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (selectedSnapshot) {
                  onLoadToEstoqueCentral(selectedSnapshot);
                } else {
                  alert('Selecione um fechamento na lista para carregar.');
                }
              }}
              disabled={!selectedSnapshot}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg border transition shadow-xs ${
                !selectedSnapshot
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 border-amber-600 active:scale-95'
              }`}
              title="Carregar esta 02.05.02 selecionada no Estoque Central"
            >
              <ArrowRight className="w-4 h-4" />
              <span>Carregar no Estoque Central</span>
            </button>

            <button
              onClick={() => {
                if (selectedSnapshot && confirm(`Deseja excluir o fechamento do dia ${selectedSnapshot.date}?`)) {
                  onDeleteSnapshot(selectedSnapshot.id);
                  setSelectedSnapshotId(null);
                }
              }}
              disabled={!selectedSnapshot}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition shadow-xs ${
                !selectedSnapshot
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              }`}
            >
              <Trash2 className="w-4 h-4 text-red-600" />
              <span>Excluir Selecionada</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Split */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: List of saved snapshots */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[650px]">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Lista de Fechamentos ({filteredSnapshots.length})
            </span>
            <div className="relative flex-1 max-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar data..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredSnapshots.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <FolderArchive className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-bold">Nenhum fechamento salvo</p>
                <p className="text-xs mt-1">
                  Clique em "SALVAR 02.05.02 DO DIA" na aba Estoque Central para salvar relatórios.
                </p>
              </div>
            ) : (
              filteredSnapshots.map((snap) => {
                const isSelected = selectedSnapshot?.id === snap.id;
                const formattedDate = snap.date.split('-').reverse().join('/');
                const lineCount = snap.ec?.r?.length || 0;

                return (
                  <div
                    key={snap.id}
                    onClick={() => setSelectedSnapshotId(snap.id)}
                    className={`p-3.5 cursor-pointer transition flex items-center justify-between ${
                      isSelected ? 'bg-amber-50 border-l-4 border-amber-500' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-black text-slate-900">{formattedDate}</span>
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                          {lineCount} linhas
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium mt-1 truncate max-w-[220px]">
                        {snap.label}
                      </p>
                    </div>
                    <ArrowRight className={`w-4 h-4 ${isSelected ? 'text-amber-600' : 'text-slate-300'}`} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Preview / Details of Selected Snapshot */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[650px]">
          {selectedSnapshot ? (
            <>
              {/* Snapshot Header details */}
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-slate-900">
                      Fechamento: {selectedSnapshot.date.split('-').reverse().join('/')}
                    </h2>
                    <span className="text-xs text-amber-800 bg-amber-100 font-bold px-2 py-0.5 rounded border border-amber-300">
                      {selectedSnapshot.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Salvo em: {new Date(selectedSnapshot.savedAt || selectedSnapshot.timestamp).toLocaleString('pt-BR')} • {selectedSnapshot.ec?.r?.length || 0} produtos no arquivo 02.05.02
                  </p>
                </div>

                <button
                  onClick={() => onLoadToEstoqueCentral(selectedSnapshot)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold rounded-md shadow-xs transition"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Carregar no Estoque Central</span>
                </button>
              </div>

              {/* Summary metrics if available */}
              {selectedSnapshot.summary && (
                <div className="grid grid-cols-3 gap-3 p-4 bg-slate-100 border-b border-slate-200">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Faltas</span>
                    <span className="text-sm font-black text-red-600">
                      {formatBRL(selectedSnapshot.summary.tf)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {selectedSnapshot.summary.countFaltas} itens com falta
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Sobras</span>
                    <span className="text-sm font-black text-emerald-600">
                      {formatBRL(selectedSnapshot.summary.ts)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {selectedSnapshot.summary.countSobras} itens com sobra
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Saldo Líquido</span>
                    <span className={`text-sm font-black ${selectedSnapshot.summary.sd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatBRL(selectedSnapshot.summary.sd)}
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Diferença Financeira</span>
                  </div>
                </div>
              )}

              {/* Table preview of snapshot ec data */}
              <div className="flex-1 overflow-auto p-4">
                <h3 className="text-xs font-extrabold text-slate-700 uppercase mb-2">
                  Prévia do Arquivo 02.05.02 ({selectedSnapshot.ec?.r?.length || 0} linhas)
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0">
                      <tr>
                        {selectedSnapshot.ec?.h?.map((h, i) => (
                          <th key={i} className="p-2 border-b border-slate-200 font-bold whitespace-nowrap">
                            {h}
                          </th>
                        )) || <th className="p-2">Dados</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSnapshot.ec?.r?.slice(0, 100).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50 border-b border-slate-100">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-2 whitespace-nowrap text-slate-800">
                              {String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(selectedSnapshot.ec?.r?.length || 0) > 100 && (
                  <p className="text-[11px] text-slate-400 mt-2 text-center">
                    Exibindo 100 de {selectedSnapshot.ec?.r?.length} linhas. Carregue no Estoque Central para visualizar todas.
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <p className="text-sm">Selecione um fechamento à esquerda para visualizar os detalhes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
