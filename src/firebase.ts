import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { RawData } from './data/types';

export const firebaseConfig = {
  apiKey: "AIzaSyCNeRWfV7L-i3X1GBegzETsEbpGkmK_s4g",
  authDomain: "banco-03-6b1ea.firebaseapp.com",
  projectId: "banco-03-6b1ea",
  storageBucket: "banco-03-6b1ea.firebasestorage.app",
  messagingSenderId: "645365828863",
  appId: "1:645365828863:web:beb28f8f10226a02e210ca"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

const STATE_COLLECTION = 'estoque_guarabira';
const MAIN_DOC = 'estado_atual';
const EC_DOC = 'estoque_central';
const LOGS_COLLECTION = 'historico_acoes';

export interface ActionLog {
  id?: string;
  action: string;
  timestamp?: any;
  dateStr: string;
  details?: string;
}

/**
 * Salva o estado completo no Firestore e registra a ação no histórico
 */
export async function saveStateToFirestore(data: RawData, actionName?: string, details?: string): Promise<boolean> {
  try {
    const mainDocRef = doc(db, STATE_COLLECTION, MAIN_DOC);
    const ecDocRef = doc(db, STATE_COLLECTION, EC_DOC);

    // Salva o estado completo, dividido em partes para evitar limite de 1MB do Firestore
    const fullPayload = JSON.stringify({
      xs: data.xs,
      res: data.res,
      gradeRes: data.gradeRes,
      aj: data.aj,
      dia: data.dia,
      men: data.men,
      recontagens: data.recontagens,
      recontagem020502: data.recontagem020502,
      desativados: data.desativados,
      dashboardSnapshots: data.dashboardSnapshots,
      ec0304: data.ec0304,
      gradeEc: data.gradeEc,
    });

    const CHUNK_SIZE = 900000; // ~900KB
    const numChunks = Math.ceil(fullPayload.length / CHUNK_SIZE);
    
    // Deleta chunks antigos se houver, de forma simplificada
    for (let i = 0; i < 10; i++) {
        try {
            await setDoc(doc(db, STATE_COLLECTION, `${MAIN_DOC}_part_${i}`), { exists: false });
        } catch {}
    }

    for (let i = 0; i < numChunks; i++) {
        await setDoc(doc(db, STATE_COLLECTION, `${MAIN_DOC}_part_${i}`), {
            payload: fullPayload.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
            totalChunks: numChunks,
            updatedAt: serverTimestamp(),
            updatedAtStr: new Date().toISOString(),
        });
    }

    // Salva o estoque central separado para performance
    if (data.ec) {
      await setDoc(ecDocRef, {
        payload: JSON.stringify(data.ec),
        updatedAt: serverTimestamp(),
        updatedAtStr: new Date().toISOString(),
      });
    }

    // Registra a ação no log permanente
    if (actionName) {
      await logActionToFirestore(actionName, details);
    }

    return true;
  } catch (error) {
    console.error('Erro ao salvar no Firestore:', error);
    return false;
  }
}

/**
 * Registra uma ação no histórico do Firestore
 */
export async function logActionToFirestore(action: string, details?: string): Promise<void> {
  try {
    const logsRef = collection(db, LOGS_COLLECTION);
    await addDoc(logsRef, {
      action,
      details: details || '',
      timestamp: serverTimestamp(),
      dateStr: new Date().toLocaleString('pt-BR'),
    });
  } catch (error) {
    console.error('Erro ao registrar log no Firestore:', error);
  }
}

/**
 * Carrega o estado salvo do Firestore
 */
export async function loadStateFromFirestore(): Promise<RawData | null> {
  try {
    const mainDocRef = doc(db, STATE_COLLECTION, MAIN_DOC);
    const ecDocRef = doc(db, STATE_COLLECTION, EC_DOC);

    const [mainSnap, ecSnap] = await Promise.all([
      getDoc(mainDocRef),
      getDoc(ecDocRef),
    ]);

    if (!mainSnap.exists()) {
      return null;
    }

    // Carrega os chunks do payload
    let fullPayload = '';
    let i = 0;
    while (true) {
        const chunkDocRef = doc(db, STATE_COLLECTION, `${MAIN_DOC}_part_${i}`);
        const chunkSnap = await getDoc(chunkDocRef);
        if (!chunkSnap.exists()) break;
        const chunkData = chunkSnap.data();
        if (!chunkData.payload) break;
        fullPayload += chunkData.payload;
        if (i >= (chunkData.totalChunks || 1) - 1) break;
        i++;
    }

    const parsedMain = JSON.parse(fullPayload);

    let parsedEc: any = undefined;
    if (ecSnap.exists()) {
      const ecDoc = ecSnap.data();
      if (ecDoc.payload) {
        parsedEc = JSON.parse(ecDoc.payload);
      } else if (ecDoc.ec) {
        parsedEc = ecDoc.ec;
      }
    }

    return {
      xs: parsedMain.xs || [],
      res: parsedMain.res || [],
      gradeRes: parsedMain.gradeRes,
      aj: parsedMain.aj || { av: [], so: [], rp: [], fm: [] },
      dia: parsedMain.dia || [],
      men: parsedMain.men || [],
      ec: parsedEc || { h: [], r: [] },
      gradeEc: parsedMain.gradeEc,
      ec0304: parsedMain.ec0304,
      recontagens: parsedMain.recontagens || [],
      recontagem020502: parsedMain.recontagem020502,
      desativados: parsedMain.desativados || [],
      dashboardSnapshots: parsedMain.dashboardSnapshots || [],
    };
  } catch (error) {
    console.error('Erro ao carregar do Firestore:', error);
    return null;
  }
}

/**
 * Escuta atualizações em tempo real do estado
 */
export function subscribeToState(callback: (data: RawData) => void): () => void {
  const mainDocRef = doc(db, STATE_COLLECTION, MAIN_DOC);
  return onSnapshot(mainDocRef, (snap) => {
    if (snap.exists()) {
      const d = snap.data();
      // Opcional: dispara quando outro cliente atualizar
    }
  });
}
