import {
  db,
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
  serverTimestamp,
} from './firebase';

export interface FirestoreRound {
  id: string;
  patient_id: string;
  transcript: string;
  created_at: any;
  extractions?: any[];
  review_flags?: any[];
  draft_notes?: any[];
}

export async function saveRoundToFirestore(
  roundId: string,
  patientId: string,
  transcript: string,
  extractions: any[],
  reviewFlags: any[],
  draftNote: string
) {
  try {
    const roundRef = doc(db, 'rounds', roundId);
    await setDoc(roundRef, {
      patient_id: patientId,
      transcript,
      created_at: serverTimestamp(),
      extractions,
      review_flags: reviewFlags,
      draft_notes: [
        {
          id: `note_${roundId}`,
          round_id: roundId,
          content: draftNote,
          status: 'draft',
          created_at: new Date().toISOString(),
        },
      ],
    });
    return true;
  } catch (err) {
    console.error('Firestore saveRound error:', err);
    return false;
  }
}

export async function getRoundsFromFirestore(maxLimit = 20): Promise<FirestoreRound[]> {
  try {
    const q = query(collection(db, 'rounds'), orderBy('created_at', 'desc'), limit(maxLimit));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
  } catch (err) {
    console.error('Firestore getRounds error:', err);
    return [];
  }
}

export async function approveNoteInFirestore(roundId: string) {
  try {
    const roundRef = doc(db, 'rounds', roundId);
    await updateDoc(roundRef, {
      'draft_notes.0.status': 'approved',
      'draft_notes.0.approved_at': new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.error('Firestore approveNote error:', err);
    return false;
  }
}
