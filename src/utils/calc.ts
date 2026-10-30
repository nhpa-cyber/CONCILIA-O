import { RawData, CalculatedProduct } from '../data/types';

export interface CalcResult {
  C: CalculatedProduct[];
  CM: Record<number, CalculatedProduct>;
}

export function calculateProducts(data: RawData): CalcResult {
  const s: { M: Record<number, number>; N: Record<number, number>; O: Record<number, number> } = {
    M: {},
    N: {},
    O: {},
  };

  data.aj.so.forEach((r) => {
    if (r[8] === 'Pendente') {
      const code = Number(r[0]);
      s.M[code] = (s.M[code] || 0) + Number(r[2] || 0);
    }
  });

  data.aj.av.forEach((r) => {
    if (r[4] === 'Pendente') {
      const code = Number(r[1]);
      s.N[code] = (s.N[code] || 0) + Number(r[3] || 0);
    }
  });

  data.aj.fm.forEach((r) => {
    const code = Number(r[0]);
    s.O[code] = (s.O[code] || 0) + Number(r[2] || 0);
  });

  const desativadosSet = new Set(data.desativados || []);

  const validRes = data.res.filter((x) => {
    const desc = String(x[1] || '').trim();
    if (!desc || desc === '' || desc === '01' || /^\d+$/.test(desc)) {
      return false;
    }
    return true;
  });

  const C: CalculatedProduct[] = validRes.map((x) => {
    const [c, d, t, G, V0, U, X, b, P, rm, rn, ro] = x;
    const isDesativado = desativadosSet.has(c);
    const V = V0 || 1;
    const M = rm + (s.M[c] || 0);
    const Nn = rn + (s.N[c] || 0);
    const Oo = ro + (s.O[c] || 0);
    const J = b + Nn - M + P + Oo;
    const W = U / V;
    const I = G * W;
    const L = J * W;
    const H = G / V < 1 ? 0 : Math.round(G / V);
    const K = J / V < 1 ? 0 : Math.round(J / V);
    const Sd = isDesativado ? 0 : (L < 0 ? 0 : L - I);
    const R = isDesativado ? 0 : Math.round(K - H);
    const Q = isDesativado ? 0 : Math.round(J - G);

    return {
      c,
      d,
      t,
      G,
      H,
      I,
      J,
      K,
      L,
      M,
      N: Nn,
      P,
      O: Oo,
      Q,
      R,
      S: Sd,
      T: -Math.trunc(Nn / V),
      U,
      V: V0,
      W,
      X,
      Y: X * G,
      Z: X * J,
      A: isDesativado ? 999999 : (G / 1e5 + Sd + c / 1e6),
      desativado: isDesativado,
    };
  });

  const CM: Record<number, CalculatedProduct> = {};
  C.forEach((r) => {
    CM[r.c] = r;
  });

  data.men.forEach((r) => {
    // Busca a última diferença apurada válida nos dias 1 a 31
    let lastDiff: number | null = null;
    if (r[4]) {
      for (let i = r[4].length - 1; i >= 0; i--) {
        if (r[4][i] !== null && r[4][i] !== undefined) {
          lastDiff = r[4][i];
          break;
        }
      }
    }
    // r[5] representa a diferença real apurada no período (e não a soma de contagens repetidas)
    r[5] = lastDiff !== null ? lastDiff : 0;
    if (CM[r[0]]) {
      r[1] = CM[r[0]].d;
      r[2] = CM[r[0]].X;
    }
  });

  return { C, CM };
}

export const sum = <T>(arr: T[], fn: (item: T) => number): number => {
  return arr.reduce((acc, curr) => acc + fn(curr), 0);
};

export const CERVEGELA_CODES = new Set([23671, 23672, 29416, 29418, 35108]);

export function isCervegela(code: number, desc?: string): boolean {
  if (CERVEGELA_CODES.has(code)) return true;
  if (desc && desc.toUpperCase().includes('CERVEGELA')) return true;
  return false;
}

export function cleanCervegelas(data: RawData): RawData {
  if (!data) return data;
  return {
    ...data,
    xs: (data.xs || []).filter((c) => !CERVEGELA_CODES.has(c)),
    res: (data.res || []).filter((r) => !isCervegela(r[0], r[1])),
    men: (data.men || []).filter((r) => !isCervegela(r[0], r[1])),
    dia: (data.dia || []).filter((r) => !CERVEGELA_CODES.has(r[0])),
    aj: {
      av: (data.aj?.av || []).filter((r) => !isCervegela(Number(r[1]), String(r[2] || ''))),
      so: (data.aj?.so || []).filter((r) => !isCervegela(Number(r[0]), String(r[1] || ''))),
      rp: (data.aj?.rp || []).filter((r) => !isCervegela(Number(r[0]), String(r[1] || ''))),
      fm: (data.aj?.fm || []).filter((r) => !isCervegela(Number(r[0]), String(r[1] || ''))),
    },
    ec: data.ec
      ? {
          h: data.ec.h,
          r: (data.ec.r || []).filter((r) => {
            const cod = Number(r[3]);
            const desc = String(r[4] || '');
            return !isCervegela(cod, desc);
          }),
        }
      : data.ec,
    gradeEc: data.gradeEc
      ? {
          h: data.gradeEc.h,
          r: (data.gradeEc.r || []).filter((r) => {
            const cod = Number(r[3]);
            const desc = String(r[4] || '');
            return !isCervegela(cod, desc);
          }),
        }
      : data.gradeEc,
  };
}
