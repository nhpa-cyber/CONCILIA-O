export interface AjustesData {
  av: (string | number)[][];
  so: (string | number)[][];
  rp: (string | number)[][];
  fm: (string | number)[][];
}

export type ResRow = [
  number, // 0: cod
  string, // 1: desc
  string, // 2: tipo (e.g. 'cx')
  number, // 3: G (disp promax unid)
  number, // 4: V0 (fator cx)
  number, // 5: U (preco cx)
  number, // 6: X (fator hecto)
  number, // 7: b (inventario base)
  number, // 8: P (repack)
  number, // 9: rm (ajuste M manual)
  number, // 10: rn (ajuste N manual)
  number  // 11: ro (ajuste O manual)
];

export type DiaRow = [
  number, // cod
  number, // eq (dif congelada qtde)
  number  // gq (dia atual qtde)
];

export type MenRow = [
  number, // 0: cod
  string, // 1: desc
  number, // 2: fator hl
  number | null, // 3: fechamento
  (number | null)[], // 4: dias 1..31
  number  // 5: soma
];

export interface EstoqueCentralData {
  h: string[];
  r: (string | number)[][];
}

export interface RecontagemItem {
  id: string;
  cod: number;
  desc: string;
  tipo: string;
  precoCx: number;
  fatorCx: number;
  fatorHl: number;

  // Dados no momento do envio
  dispPromaxUnid: number;
  dispPromaxCx: number;
  inventarioInicialUnid: number;
  inventarioInicialCx: number;
  difInicialCx: number;
  difInicialValor: number;

  // Nova Recontagem apurada
  novaContagemCx: number;
  novaContagemUnid: number;
  status: 'pendente' | 'ajustado';
  solicitadoEm: string;
  ajustadoEm?: string;
}

export interface DashboardSnapshot {
  id: string;
  date: string; // "YYYY-MM-DD"
  timestamp: number;
  label: string;
  ec: EstoqueCentralData;
  res?: ResRow[];
  summary?: {
    tf: number;
    ts: number;
    sd: number;
    countFaltas: number;
    countSobras: number;
  };
  fileName?: string;
  savedAt: string;
}

export interface RawData {
  xs: number[];
  res: ResRow[];
  gradeRes?: ResRow[];
  aj: AjustesData;
  dia: DiaRow[];
  men: MenRow[];
  ec: EstoqueCentralData;
  gradeEc?: EstoqueCentralData;
  ec0304?: EstoqueCentralData;
  recontagens?: RecontagemItem[];
  recontagem020502?: {
    rawHeaders?: string[];
    rawRows?: (string | number)[][];
    delimiter?: string;
    base: any[];
    over: Record<string, { 
      recontagens: { cx: number; src: string }[];
      p: string;
      d: string;
      cx?: number; // Legacy
      src?: string; // Legacy
      av?: number; // Legacy
    }>;
    hist: { name: string; n: number; snap: Record<string, any> }[];
  };
  desativados?: number[];
  dashboardSnapshots?: DashboardSnapshot[];
  contagem021101?: {
    counts: {
      id: string;
      label: string;
      rows: (string | number)[][];
      fileName?: string;
      totalItems?: number;
      parsedItems?: {
        code: string;
        cleanCode: number;
        desc: string;
        qty: number;
      }[];
      importedAt: string;
    }[];
  };
}

export interface CalculatedProduct {
  c: number;
  d: string;
  t: string;
  G: number;
  H: number;
  I: number;
  J: number;
  K: number;
  L: number;
  M: number;
  N: number;
  P: number;
  O: number;
  Q: number;
  R: number;
  S: number;
  T: number;
  U: number;
  V: number;
  W: number;
  X: number;
  Y: number;
  Z: number;
  A: number;
  desativado?: boolean;
}
