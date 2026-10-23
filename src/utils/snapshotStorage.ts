import { DashboardSnapshot, EstoqueCentralData, ResRow } from '../data/types';
import { initialRawData } from '../data/defaultRawData';

export const SNAPSHOT_STORAGE_KEY = 'PROMAX_DASHBOARD_SNAPSHOTS';

/**
 * Carrega a lista de snapshots salvos do LocalStorage. Se estiver vazio, popula automaticamente com 2 snapshots de demonstração.
 */
export function loadSnapshots(): DashboardSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) {
      const demo1: DashboardSnapshot = {
        id: 'snap_demo_ontem',
        date: '2025-10-15',
        timestamp: Date.now() - 86400000 * 2,
        label: 'Fechamento Matutino (Ontem)',
        ec: initialRawData.ec,
        res: initialRawData.res,
        summary: {
          tf: -15,
          ts: 10,
          sd: -5,
          countFaltas: 6,
          countSobras: 4,
        },
        fileName: '02.05.02_ontem.csv',
        savedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      };

      const demo2: DashboardSnapshot = {
        id: 'snap_demo_hoje',
        date: '2025-10-16',
        timestamp: Date.now() - 86400000,
        label: 'Fechamento Vespertino (Hoje)',
        ec: {
          h: initialRawData.ec.h,
          r: initialRawData.ec.r.map((row, idx) => {
            const r = [...row];
            if (idx % 2 === 0 && typeof r[7] === 'number') {
              r[7] = Number(r[7]) + 1; // simula melhoria/mudança em caixas
            }
            return r;
          }),
        },
        res: initialRawData.res,
        summary: {
          tf: -10,
          ts: 7,
          sd: -3,
          countFaltas: 4,
          countSobras: 3,
        },
        fileName: '02.05.02_hoje.csv',
        savedAt: new Date(Date.now() - 86400000).toISOString(),
      };

      const defaults = [demo2, demo1];
      localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.sort((a, b) => b.timestamp - a.timestamp);
    }
    // Se o array estiver vazio no storage, força os demos também
    localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
    return loadSnapshots();
  } catch (e) {
    console.error('Erro ao carregar snapshots do LocalStorage:', e);
    return [];
  }
}

/**
 * Salva ou atualiza um snapshot do dia
 */
export function persistSnapshot(snapshot: DashboardSnapshot): DashboardSnapshot[] {
  try {
    const existing = loadSnapshots();
    const filtered = existing.filter((s) => s.id !== snapshot.id);
    const updated = [snapshot, ...filtered].sort((a, b) => b.timestamp - a.timestamp);
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Erro ao salvar snapshot:', e);
    return [];
  }
}

/**
 * Remove um snapshot específico
 */
export function removeSnapshot(id: string): DashboardSnapshot[] {
  try {
    const existing = loadSnapshots();
    const updated = existing.filter((s) => s.id !== id);
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Erro ao remover snapshot:', e);
    return [];
  }
}

/**
 * Exporta e baixa o arquivo CSV da planilha 02.05.02 exatamente como estava gravada naquele dia
 */
export function downloadSnapshot020502Csv(snapshot: DashboardSnapshot): void {
  if (!snapshot.ec || !snapshot.ec.h || !snapshot.ec.r) {
    alert('Os dados da 02.05.02 deste snapshot não estão disponíveis.');
    return;
  }

  const delimiter = ';';
  const formatCell = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(delimiter) || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = snapshot.ec.h.map(formatCell).join(delimiter);
  const dataLines = snapshot.ec.r.map((row) => row.map(formatCell).join(delimiter));

  const csvContent = '\ufeff' + [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `02_05_02_fechamento_${snapshot.date.replace(/-/g, '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
