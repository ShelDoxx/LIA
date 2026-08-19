import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, firebaseEnabled } from "@/lib/firebase";
import type { LiaState } from "@/lib/types";

function cloudDocId(producerId: string) {
  return doc(db!, "producers", producerId);
}

function slimForCloud(state: LiaState): LiaState {
  return {
    ...state,
    documents: state.documents.map((d) =>
      d.archived && d.dataUrl ? { ...d, dataUrl: undefined } : d,
    ),
  };
}

export async function loadStateFromCloud(producerId: string): Promise<LiaState | null> {
  if (!firebaseEnabled || !db) return null;
  try {
    const snap = await getDoc(cloudDocId(producerId));
    if (!snap.exists()) return null;
    const data = snap.data() as { state?: LiaState };
    return data.state ?? null;
  } catch {
    return null;
  }
}

export async function saveStateToCloud(state: LiaState): Promise<boolean> {
  if (!firebaseEnabled || !db) return false;
  try {
    await setDoc(cloudDocId(state.producer.id), {
      updatedAt: new Date().toISOString(),
      email: state.producer.email,
      state: slimForCloud(state),
    });
    return true;
  } catch {
    return false;
  }
}

export function cloudSyncAvailable() {
  return firebaseEnabled && Boolean(db);
}
