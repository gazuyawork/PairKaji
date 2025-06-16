// 'use client';

// import { useEffect } from 'react';
// import { auth, db } from '@/lib/firebase';
// import { doc, onSnapshot, type DocumentSnapshot, type DocumentData } from 'firebase/firestore';
// import { callShareTasksWithPartner } from '@/lib/firebaseUtils';
// import { toast } from 'sonner';

// export default function PairListener() {
//   useEffect(() => {
//     const uid = auth.currentUser?.uid;
//     if (!uid) return;

//     const pairRef = doc(db, 'pairs', uid);
//     const unsubscribe = onSnapshot(pairRef, (snapshot: DocumentSnapshot<DocumentData>) => {
//       if (!snapshot.exists()) return;

//       const data = snapshot.data();
//       if (!data) return;

//       if (data.status === 'confirmed') {
//         const partnerId = data.userAId === uid ? data.userBId : data.userAId;
//         if (!partnerId) return;

//         const confirmed = window.confirm('パートナーが承認しました。タスク共有を開始しますか？');
//         if (confirmed) {
//           callShareTasksWithPartner(uid, partnerId)
//             .then((result) => {
//               if (result.success) {
//                 toast.success(`タスク共有が完了しました！ (${result.updatedCount}件 更新)`);
//               } else {
//                 toast.error('タスク共有に失敗しました。');
//               }
//             })
//             .catch((err: unknown) => {
//               const error = err as Error;
//               toast.error(`タスク共有に失敗しました: ${error.message}`);
//             });
//         }
//       }
//     });

//     return () => unsubscribe();
//   }, []);

//   return null; // UIなしのリスナー
// }
