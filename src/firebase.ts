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
import { RawData, ContagemEstoqueItem } from './data/types';

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

// Identificador único da sessão do cliente para evitar loops de eco em tempo real
export const CLIENT_SESSION_ID =
  'cli_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);

const STATE_COLLECTION = 'estoque_guarabira';
const MAIN_DOC = 'estado_atual';
const EC_DOC = 'estoque_central';
const CONTAGENS_DOC = 'contagens_estoque';
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
 * Salva contagens_estoque em documento rápido separado para sincronia instantânea entre usuários
 */
export async function saveStateToFirestore(
  data: RawData,
  actionName?: string,
  details?: string
): Promise<boolean> {
  try {
    const mainDocRef = doc(db, STATE_COLLECTION, MAIN_DOC);
    const ecDocRef = doc(db, STATE_COLLECTION, EC_DOC);
    const contagensDocRef = doc(db, STATE_COLLECTION, CONTAGENS_DOC);

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
      contagensEstoque: data.contagensEstoque || [],
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

    // Salva contagens_estoque em documento leve e direto para broadcast instantâneo (sub-segundo)
    await setDoc(contagensDocRef, {
      items: data.contagensEstoque || [],
      clientSessionId: CLIENT_SESSION_ID,
      updatedAt: serverTimestamp(),
      updatedAtStr: new Date().toISOString(),
      actionName: actionName || 'atualizou_contagens',
    });

    // Atualiza o documento principal com metadados e clientSessionId
    await setDoc(mainDocRef, {
      totalChunks: numChunks,
      chunkSize: CHUNK_SIZE,
      payloadLength: fullPayload.length,
      clientSessionId: CLIENT_SESSION_ID,
      updatedAt: serverTimestamp(),
      updatedAtStr: new Date().toISOString(),
      actionName: actionName || '',
      version: 2,
    });

    // Salva o estoque central separado para melhor performance
    if (data.ec) {
      await setDoc(ecDocRef, {
        payload: JSON.stringify(data.ec),
        clientSessionId: CLIENT_SESSION_ID,
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
    const contagensDocRef = doc(db, STATE_COLLECTION, CONTAGENS_DOC);

    const [mainSnap, ecSnap, contagensSnap] = await Promise.all([
      getDoc(mainDocRef),
      getDoc(ecDocRef),
      getDoc(contagensDocRef).catch(() => null),
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
        try {
          const repaired = fullPayload.replace(/",01",/g, '"],["01",');
          parsedMain = JSON.parse(repaired);
        } catch {
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

    // Carrega contagens de estoque (prioriza o documento direto se existir)
    let parsedContagens: ContagemEstoqueItem[] = parsedMain.contagensEstoque || [];
    if (contagensSnap && contagensSnap.exists()) {
      const cData = contagensSnap.data();
      if (Array.isArray(cData?.items) && cData.items.length > 0) {
        parsedContagens = cData.items;
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
      contagensEstoque: parsedContagens,
    };
  } catch (error) {
    console.error('Erro ao carregar do Firestore:', error);
    return null;
  }
}

/**
 * Escuta atualizações em tempo real do estado (Firestore onSnapshot)
 * Permite que múltiplos usuários no celular ou PC vejam alterações 100% em tempo real
 */
export function subscribeToState(
  onFullStateUpdate: (data: RawData, actionName?: string) => void,
  onContagensUpdate?: (items: ContagemEstoqueItem[], actionName?: string) => void
): () => void {
  const mainDocRef = doc(db, STATE_COLLECTION, MAIN_DOC);
  const contagensDocRef = doc(db, STATE_COLLECTION, CONTAGENS_DOC);

  let isFirstMain = true;
  let isFirstContagens = true;

  // Escuta o documento principal do estado (tabelas, ajustes, preços, snapshots)
  const unsubMain = onSnapshot(
    mainDocRef,
    async (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // Ignora o snapshot inicial e escritas feitas pela própria sessão
      if (isFirstMain) {
        isFirstMain = false;
        return;
      }
      if (data?.clientSessionId === CLIENT_SESSION_ID) {
        return;
      }

      try {
        const remote = await loadStateFromFirestore();
        if (remote) {
          onFullStateUpdate(remote, data?.actionName);
        }
      } catch (e) {
        console.warn('Erro ao atualizar estado remoto via snapshot:', e);
      }
    },
    (error) => {
      console.error('Erro no listener realtime do Firestore (main):', error);
    }
  );

  // Escuta contagens de estoque em tempo real direto (resposta imediata em <500ms)
  const unsubContagens = onSnapshot(
    contagensDocRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      if (isFirstContagens) {
        isFirstContagens = false;
        return;
      }
      if (data?.clientSessionId === CLIENT_SESSION_ID) {
        return;
      }

      if (Array.isArray(data?.items) && onContagensUpdate) {
        onContagensUpdate(data.items, data?.actionName);
      }
    },
    (error) => {
      console.error('Erro no listener realtime do Firestore (contagens):', error);
    }
  );

  return () => {
    unsubMain();
    unsubContagens();
  };
}
