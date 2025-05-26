// src/app/task_manage/page.tsx

'use client';

import Header from '@/components/Header';
import { Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';
import type { Period } from '@/types/Task';
import { db, auth } from '@/lib/firebase';
import { toast } from 'sonner'; 
import { fetchTasksForUser, saveTaskToFirestore } from '@/lib/firebaseUtils';
import type { FirestoreTask } from '@/types/Task';
import { deleteTaskFromFirestore } from '@/lib/firebaseUtils';
import { getDocs, query, where, collection } from 'firebase/firestore';
import type { Task } from '@/types/Task';
import TaskManageCard from '@/components/TaskManageCard'; 
import type { TaskManageTask } from '@/types/Task';

const dayNumberToName: Record<string, string> = {
  '0': '日','1': '月','2': '火','3': '水','4': '木','5': '金','6': '土',
};

const dayNameToNumber: Record<string, string> = {
  '日': '0','月': '1','火': '2','水': '3','木': '4','金': '5','土': '6',
};

export default function TaskManagePage() {
  const [tasks, setTasks] = useState<TaskManageTask[]>([]);
  const [filter, setFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [profileImage, setProfileImage] = useState<string>('/images/taro.png');
  const [partnerImage, setPartnerImage] = useState<string>('/images/hanako.png');
  const addTask = () => {
    const newId = crypto.randomUUID();
    const newGroupId = crypto.randomUUID();
    setTasks([
      {
        id: newId,
        name: '',
        frequency: '毎日',
        point: 10,
        users: ['太郎', '花子'],
        daysOfWeek: [],
        dates: [],
        isTodo: false,
        done: false,
        skipped: false,
        person: '',
        image: '',
        groupId: newGroupId,
        isNew: true,
        isEdited: false,
        showDelete: false,
      },
      ...tasks,
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
    setTasks(prev =>
      prev.map(task => {
        if (task.id !== id) return task;

        const isSelected = task.users.includes(user);
        if (isSelected) {
          // OFFにする
          return {
            ...task,
            users: task.users.filter(u => u !== user),
            isEdited: !task.isNew ? true : task.isEdited,
          };
        } else {
          // ONにする
          return {
            ...task,
            users: [...task.users, user],
            isEdited: !task.isNew ? true : task.isEdited,
          };
        }
      })
    );
  };

  const toggleDay = (id: string, day: string) => {
    setTasks(prev =>
      prev.map(task => {
        if (task.id === id) {
          const newDays = task.daysOfWeek.includes(day)
            ? task.daysOfWeek.filter(d => d !== day)
            : [...task.daysOfWeek, day];
          return { ...task, daysOfWeek: newDays, isEdited: !task.isNew ? true : task.isEdited };
        }
        return task;
      })
    );
  };

  const toggleShowDelete = (id: string) => {
    setTasks(prev =>
      prev.map(task => ({
        ...task,
        showDelete: task.id === id ? !task.showDelete : false,
      }))
    );
  };

  const confirmTasks = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toast.error('ログインしてください');
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

    if (hasEmptyName) return;

    // 🔍 パートナー共有情報取得
    let sharedUserIds: string[] = [uid];
    try {
      const pairSnap = await getDocs(
        query(collection(db, 'pairs'), where('userIds', 'array-contains', uid))
      );
      const confirmedPair = pairSnap.docs.find(doc => doc.data().status === 'confirmed');
      if (confirmedPair) {
        sharedUserIds = confirmedPair.data().userIds ?? [uid];
      }
    } catch (e) {
      console.error('ペア情報の取得に失敗:', e);
    }

    for (const task of tasks) {
      const daysOfWeek = task.frequency === '週次'
        ? task.daysOfWeek.map(d => dayNameToNumber[d]).filter((d): d is string => d !== undefined)
        : [];


      const taskData: FirestoreTask = {
        userId: uid,
        userIds: sharedUserIds,
        name: task.name,
        frequency: task.frequency,
        point: task.point,
        users: task.users,
        daysOfWeek,
        dates: task.dates,
        groupId: task.groupId ?? null,
        isTodo: task.isTodo ?? false,
      };

      try {
        await saveTaskToFirestore(task.isNew ? null : task.id, taskData);
      } catch (e) {
        console.error('タスク保存失敗:', e);
      }
    }

    setTasks(prev =>
      prev.map(task => ({ ...task, isNew: false, isEdited: false, showDelete: false }))
    );
    toast.success('タスクを保存しました');
  };

  useEffect(() => {
    const storedProfileImage = localStorage.getItem('profileImage');
    const storedPartnerImage = localStorage.getItem('partnerImage');

    if (storedProfileImage) {
      setProfileImage(storedProfileImage);
    }
    if (storedPartnerImage) {
      setPartnerImage(storedPartnerImage);
    }
  }, []);

  useEffect(() => {
    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const fetched = await fetchTasksForUser(uid);
      const loadedTasks: Task[] = fetched.map(({ id, data }) => ({
        id,
        name: data.name,
        frequency: data.frequency,
        point: data.point,
        users: data.users,
        daysOfWeek: data.daysOfWeek.map(d => dayNumberToName[d] ?? d),
        dates: data.dates,
        groupId: data.groupId,
        isTodo: data.isTodo ?? false,
        isNew: false,
        isEdited: false,
        showDelete: false,
        done: false,
        skipped: false,
        person: '',
        image: '',
        period: data.frequency,
      }));

      setTasks(loadedTasks);
    };

    fetchTasks();
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
        />



        <hr className="border-t border-gray-300 opacity-50 my-4" />

        <div className="space-y-2.5 pb-40">
          {tasks
            .filter(task => !filter || task.frequency === filter)
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
          disabled={isConfirmDisabled}
          className={`w-[300px] font-bold py-3 rounded-xl shadow-lg ${
            isConfirmDisabled
              ? 'bg-gray-300 text-white cursor-not-allowed'
              : 'bg-[#FFCB7D] text-white'
          }`}
        >
          OK
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