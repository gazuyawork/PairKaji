// src/app/task_manage/page.tsx

'use client';

import Header from '@/components/Header';
import { Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';
import type { Period } from '@/types/Task';
import { toast } from 'sonner'; 
import { deleteTaskFromFirestore } from '@/lib/firebaseUtils';
import TaskManageCard from '@/components/TaskManageCard'; 
import type { TaskManageTask } from '@/types/Task';
import { fetchPairUserIds, saveAllTasks } from '@/lib/taskUtils';
import { useProfileImages } from '@/hooks/useProfileImages';
import { mapFirestoreDocToTask } from '@/lib/taskMappers';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { RotateCcw } from 'lucide-react'; 
import { motion } from 'framer-motion';

export default function TaskManagePage() {
  const [tasks, setTasks] = useState<TaskManageTask[]>([]);
  const [filter, setFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { profileImage, partnerImage } = useProfileImages();
  const [isSaving, setIsSaving] = useState(false);
  const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pairStatus, setPairStatus] = useState<'confirmed' | 'none'>('none');

  const [todayFilter, setTodayFilter] = useState(false);
  const handleToggleTodayFilter = () => {
    setTodayFilter((prev) => !prev);
  };


  useEffect(() => {
    const fetchPairStatus = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const pairsSnap = await getDocs(
          query(collection(db, 'pairs'), where('userIds', 'array-contains', uid))
        );

        let foundConfirmed = false;
        pairsSnap.forEach(doc => {
          const data = doc.data();
          if (data.status === 'confirmed') {
            foundConfirmed = true;
          }
        });

        setPairStatus(foundConfirmed ? 'confirmed' : 'none');
      } catch (error) {
        console.error('ペアステータスの取得に失敗:', error);
        setPairStatus('none');
      }
    };

    fetchPairStatus();
  }, []);

useEffect(() => {
  const fetchUserIds = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let userIds = [uid];
    if (pairStatus === 'confirmed') {
      const fetched = await fetchPairUserIds(uid);
      userIds = fetched.includes(uid) ? fetched : [...fetched, uid];
    }
    setSharedUserIds(userIds);
  };

  fetchUserIds();
}, [pairStatus]);


  const addTask = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.error('ログインしてください');
      return;
    }

    let sharedUserIds: string[] = [uid];
    if (pairStatus === 'confirmed') {
      sharedUserIds = await fetchPairUserIds(uid);
    }

    const newId = crypto.randomUUID();

    setTasks(prev => [
      ...prev,
      {
        id: newId,
        title: '',
        name: '',
        period: '毎日',
        point: 5,
        users: sharedUserIds,     // ✅ 担当者設定
        userIds: sharedUserIds,   // ✅ Firestore保存用
        daysOfWeek: [],
        dates: [],
        isTodo: false,
        done: false,
        skipped: false,
        groupId: null,
        completedAt: null,
        completedBy: '',
        visible: false,
        person: '',
        image: '',
        userId: uid,
        isNew: true,
        isEdited: false,
        private: false,
        showDelete: false,
      },
    ]);
  };

    const updateTask = (
      id: string,
      key: keyof TaskManageTask, // 修正
      value: string | number | string[] | boolean
    ) => {

    setTasks(prev =>
      prev.map(task =>
        task.id === id
          ? {
              ...task,
              [key]: value,
              isEdited: !task.isNew ? true : task.isEdited,
              ...(key === 'name' ? { nameError: false } : {}), // 入力時にエラー解除
            }
          : task
      )
    );
  };

  const removeTask = async (id: string) => {
    const taskToRemove = tasks.find(task => task.id === id);
    if (!taskToRemove) return;

    if (!taskToRemove.isNew) {
      try {
        await deleteTaskFromFirestore(id);
        toast.success('タスクを削除しました');
      } catch (error) {
        console.error('Firestoreからの削除に失敗:', error);
        toast.error('タスクの削除に失敗しました');
        return;
      }
    }

    setTasks(prev => prev.filter(task => task.id !== id));
  };


  const toggleFilter = (period: Period | null) => {
    setFilter(prev => (prev === period ? null : period));
  };
  
  const togglePerson = (person: string | null) => {
    setPersonFilter(prev => (prev === person ? null : person));
  };
  
  const handleUserToggle = (id: string, user: string) => {
    updateTaskField(id, task => ({
      users: task.users.includes(user)
        ? task.users.filter(u => u !== user)
        : [...task.users, user]
    }));
  };


  const toggleDay = (id: string, day: string) => {
    updateTaskField(id, task => ({
      daysOfWeek: task.daysOfWeek.includes(day)
        ? task.daysOfWeek.filter(d => d !== day)
        : [...task.daysOfWeek, day]
    }));
  };


  const toggleShowDelete = (id: string) => {
    setTasks(prev =>
      prev.map(task => ({
        ...task,
        showDelete: task.id === id ? !task.showDelete : false,
      }))
    );
  };

  const updateTaskField = (
    id: string,
    updater: (task: TaskManageTask) => Partial<TaskManageTask>
  ) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === id
          ? { ...task, ...updater(task), isEdited: !task.isNew ? true : task.isEdited }
          : task
      )
    );
  };

const confirmTasks = async () => {
  if (isSaving) return; // 二重送信防止
  setIsSaving(true);

  const uid = auth.currentUser?.uid;
  if (!uid) {
    toast.error('ログインしてください');
    setIsSaving(false);
    return;
  }

  let hasEmptyName = false;

  setTasks(prev =>
    prev.map(task => {
      const isEmpty = !task.name.trim();
      if (isEmpty) hasEmptyName = true;
      return { ...task, nameError: isEmpty };
    })
  );

  if (hasEmptyName) {
    setIsSaving(false);
    return;
  }

  try {
    const sharedUserIds = await fetchPairUserIds(uid);
    if (!sharedUserIds.includes(uid)) {
      sharedUserIds.push(uid);
    }

    // ✅ 修正: 変更のあったタスクのみを抽出
    const tasksToSave = tasks.filter(task => task.isNew || task.isEdited);
    if (tasksToSave.length === 0) {
      toast.success('変更がありませんでした');
      setIsSaving(false);
      return;
    }

    await saveAllTasks(tasksToSave, uid, sharedUserIds);

    setTasks(prev =>
      prev.map(task => ({ ...task, isNew: false, isEdited: false, showDelete: false }))
    );

    toast.success('タスクを保存しました');
  } catch (error) {
    console.error(error);
    toast.error('保存に失敗しました');
  } finally {
    setIsSaving(false);
  }
};



  useEffect(() => {
    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const partnerUids = await fetchPairUserIds(uid);
      if (!partnerUids.includes(uid)) {
        partnerUids.push(uid);
      }

      const q = query(
        collection(db, 'tasks'),
        where('userIds', 'array-contains', uid)
      );

      const snapshot = await getDocs(q);
      const loadedTasks = snapshot.docs.map(doc => ({
        ...mapFirestoreDocToTask(doc),
        isNew: false,
        isEdited: false,
        showDelete: false,
      }));

      setTasks(loadedTasks);
      setIsLoading(false); // ✅ 追加
    };

    fetchTasks().catch((err) => {
      console.error(err);
      setIsLoading(false); // エラーでも非表示
    });
  }, []);



  const isConfirmDisabled = !tasks.some(task => task.isNew || task.isEdited);

  useEffect(() => {
    sessionStorage.setItem('fromTaskManage', 'true');
  }, []);


  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2] relative">
      <Header title="Edit" />

      <main className="main-content flex-1 px-4 py-6 space-y-4 overflow-y-auto pb-25">
        {isLoading ? (
          <div className="flex items-center justify-center text-gray-400 text-sm h-200">
            <div className="w-8 h-8 border-4 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <SearchBox value={searchTerm} onChange={setSearchTerm} />
            <div className="mt-4">
              <FilterControls
                periodFilter={filter}
                personFilter={personFilter}
                onTogglePeriod={toggleFilter}
                onTogglePerson={togglePerson}
                pairStatus={pairStatus}
                todayFilter={todayFilter} // ✅ 追加
                onToggleTodayFilter={handleToggleTodayFilter}
              />
            </div>
            <hr className="border-t border-gray-300 opacity-50 my-4" />
            <div className="space-y-2.5">
              {tasks
                .filter(task => !filter || task.period === filter)
                .filter(task => !personFilter || task.users.includes(personFilter))
                .filter(task => (task.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
                .map(task => (
                  <TaskManageCard
                    key={task.id}
                    task={task}
                    onChange={updateTask}
                    onRemove={removeTask}
                    onToggleUser={handleUserToggle}
                    onToggleDay={toggleDay}
                    onToggleDelete={toggleShowDelete}
                    users={sharedUserIds.map((id) => {
                      const isSelf = id === auth.currentUser?.uid;
                      return {
                        id,
                        name: isSelf ? 'あなた' : 'パートナー',
                        imageUrl: isSelf ? profileImage : (partnerImage || '/default-partner.png'),
                      };
                    })}
                    isPairConfirmed={pairStatus === 'confirmed'}
                  />
                ))}
            </div>
          </motion.div>
        )}
      </main>



      {/* ✅ 固定表示のボタンコンテナ */}
      <div className="fixed bottom-10 left-0 right-0 flex justify-center items-center gap-8 z-50 px-4">
        <button
          onClick={confirmTasks}
          disabled={isConfirmDisabled || isSaving}
          className={`w-[200px] font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 ${
            isConfirmDisabled || isSaving
              ? 'bg-gray-300 text-white cursor-not-allowed'
              : 'bg-[#FFCB7D] text-white'
          }`}
        >
          {isSaving ? (
            <>
              <RotateCcw className="w-5 h-5 animate-spin" />
              保存中...
            </>
          ) : (
            'OK'
          )}
        </button>

        <button
          onClick={addTask}
          className="w-12 h-12 bg-[#FFCB7D] text-white rounded-full flex items-center justify-center shadow-lg"
        >
          <Plus size={24} />
        </button>
      </div>
    </div>
  );

}