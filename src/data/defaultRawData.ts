import { xs, aj } from './part1_aj';
import { dia, rawDia } from './part2_dia';
import { res_a } from './part3_res_a';
import { res_b } from './part3_res_b';
import { men_a } from './part4_men_a';
import { men_b } from './part4_men_b';
import { ec } from './part5_ec';
import { initialRecontagens } from './defaultRecontagens';
import { RawData, MenRow } from './types';

const rawRes = [...res_a, ...res_b];
const zeroedRes = rawRes.map((r) => {
  const row = [...r] as typeof r;
  row[7] = row[3]; // contagem física b igual ao disponível Promax G para zerar divergência
  return row;
});

// Inicializa a DIF Mensal com o Dia 14 e Dia 15 pré-carregados a partir da conciliação gravada (rawDia)
const rawDiaMap = new Map<number, { eq: number; gq: number }>();
rawDia.forEach(([c, eq, gq]) => {
  rawDiaMap.set(c, { eq, gq });
});

const seededMen: MenRow[] = [...men_a, ...men_b].map((row) => {
  const r = [...row] as typeof row;
  const days = [...r[4]];
  const diaEntry = rawDiaMap.get(r[0]);
  if (diaEntry) {
    if (diaEntry.eq !== undefined && diaEntry.eq !== null) {
      days[13] = diaEntry.eq; // Dia 14 (ontem / congelada)
    }
    if (diaEntry.gq !== undefined && diaEntry.gq !== null) {
      days[14] = diaEntry.gq; // Dia 15 (dia atual)
    }
  }
  const soma = days.reduce<number>((acc, v) => acc + (v || 0), 0);
  return [r[0], r[1], r[2], r[3], days, soma] as MenRow;
});

export const initialRawData: RawData = {
  xs,
  aj,
  dia,
  res: zeroedRes,
  gradeRes: zeroedRes.map((r) => [...r] as typeof r),
  men: seededMen,
  ec,
  gradeEc: undefined,
  ec0304: undefined,
  recontagens: initialRecontagens,
  desativados: [],
};
