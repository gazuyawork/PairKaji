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



export default function TaskManagePage() {
  const [tasks, setTasks] = useState<TaskManageTask[]>([]);
  const [filter, setFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { profileImage, partnerImage } = useProfileImages();
  const [isSaving, setIsSaving] = useState(false);

  const [pairStatus, setPairStatus] = useState<'confirmed' | 'none'>('none');

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
      await saveAllTasks(tasks, uid, sharedUserIds);

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

      // ✅ ペアユーザーIDを取得
      const partnerUids = await fetchPairUserIds(uid);
      if (!partnerUids.includes(uid)) {
        partnerUids.push(uid);
      }

      // ✅ Firestoreからタスク取得（TaskViewと同じ条件に変更）
      const q = query(
        collection(db, 'tasks'),
        where('userId', 'in', partnerUids)
      );

      const snapshot = await getDocs(q);
      const loadedTasks = snapshot.docs.map(doc => ({
        ...mapFirestoreDocToTask(doc),
        isNew: false,
        isEdited: false,
        showDelete: false,
      }));

      setTasks(loadedTasks);
    };

    fetchTasks().catch(console.error);
  }, []);


  const isConfirmDisabled = !tasks.some(task => task.isNew || task.isEdited);

  useEffect(() => {
    sessionStorage.setItem('fromTaskManage', 'true');
  }, []);


  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#fffaf1] to-[#ffe9d2]">
      <Header title="Edit" />

      <main className="flex-1 px-4 py-6 space-y-4 overflow-y-auto">
        <SearchBox value={searchTerm} onChange={setSearchTerm} />

        <FilterControls
          periodFilter={filter}
          personFilter={personFilter}
          onTogglePeriod={toggleFilter}
          onTogglePerson={togglePerson}
          pairStatus={pairStatus}
        />



        <hr className="border-t border-gray-300 opacity-50 my-4" />

        <div className="space-y-2.5 pb-40">
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
                profileImage={profileImage}
                partnerImage={partnerImage}
              />
            ))}
        </div>
      </main>

      <div className="mt-auto py-10 px-4 flex justify-center items-center gap-4">
        <button
          onClick={confirmTasks}
          disabled={isConfirmDisabled || isSaving}
          className={`w-[300px] font-bold py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 ${
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