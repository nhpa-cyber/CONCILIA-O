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

    // Salva o estado completo, dividido em partes seguras de ~700KB
    const fullPayload = JSON.stringify({
      xs: data.xs,
      res: data.res,
      gradeRes: data.gradeRes,
      aj: data.aj,
      dia: data.dia,
      men: data.men,
      recontagens: data.recontagens,
      desativados: data.desativados,
      dashboardSnapshots: data.dashboardSnapshots,
      ec0304: data.ec0304,
      gradeEc: data.gradeEc,
      contagem021101: data.contagem021101,
    });

    const CHUNK_SIZE = 700000;
    const numChunks = Math.max(1, Math.ceil(fullPayload.length / CHUNK_SIZE));

    // Salva cada chunk individualmente
    const savePromises: Promise<any>[] = [];
    for (let i = 0; i < numChunks; i++) {
      const chunkDocRef = doc(db, STATE_COLLECTION, `${MAIN_DOC}_part_${i}`);
      savePromises.push(
        setDoc(chunkDocRef, {
          payload: fullPayload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
          index: i,
          totalChunks: numChunks,
          updatedAt: serverTimestamp(),
          updatedAtStr: new Date().toISOString(),
        })
      );
    }
    await Promise.all(savePromises);

    // Limpa chunks residuais antigos se houver
    for (let i = numChunks; i < numChunks + 5; i++) {
      try {
        const excessDocRef = doc(db, STATE_COLLECTION, `${MAIN_DOC}_part_${i}`);
        await setDoc(excessDocRef, { payload: '', totalChunks: 0, exists: false });
      } catch {}
    }

    // Atualiza o documento principal com metadados
    await setDoc(mainDocRef, {
      totalChunks: numChunks,
      chunkSize: CHUNK_SIZE,
      payloadLength: fullPayload.length,
      updatedAt: serverTimestamp(),
      updatedAtStr: new Date().toISOString(),
      version: 2,
    });

    // Salva o estoque central separado para melhor performance
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
 * Carrega o estado salvo do Firestore com recuperação resiliente
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

    const mainData = mainSnap.data();
    const totalChunks = mainData?.totalChunks || 1;

    // Busca todos os chunks em paralelo
    const chunkPromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkDocRef = doc(db, STATE_COLLECTION, `${MAIN_DOC}_part_${i}`);
      chunkPromises.push(getDoc(chunkDocRef));
    }
    const chunkSnaps = await Promise.all(chunkPromises);

    let fullPayload = '';
    for (const snap of chunkSnaps) {
      if (snap.exists() && snap.data().payload) {
        fullPayload += snap.data().payload;
      }
    }

    let parsedMain: any = null;

    if (fullPayload) {
      try {
        parsedMain = JSON.parse(fullPayload);
      } catch (parseErr) {
        console.warn('Tentativa de reparo de junção no JSON do Firestore...', parseErr);
        // Tenta auto-reparar qualquer falha de junção de colunas ou linhas
        try {
          const repaired = fullPayload.replace(/",01",/g, '"],["01",');
          parsedMain = JSON.parse(repaired);
        } catch {
          // Se ainda falhar, tenta usar payload direto do mainSnap se existir
          if (mainData.payload) {
            try {
              parsedMain = JSON.parse(mainData.payload);
            } catch {}
          }
        }
      }
    } else if (mainData.payload) {
      try {
        parsedMain = JSON.parse(mainData.payload);
      } catch {}
    }

    if (!parsedMain) {
      console.warn('Nenhum payload de estado válido encontrado no Firestore.');
      return null;
    }

    let parsedEc: any = undefined;
    if (ecSnap.exists()) {
      const ecDoc = ecSnap.data();
      if (ecDoc.payload) {
        try {
          parsedEc = JSON.parse(ecDoc.payload);
        } catch (e) {
          console.warn('Erro ao parsear ecDoc payload:', e);
        }
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
      desativados: parsedMain.desativados || [],
      dashboardSnapshots: parsedMain.dashboardSnapshots || [],
      contagem021101: parsedMain.contagem021101 || { counts: [] },
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
