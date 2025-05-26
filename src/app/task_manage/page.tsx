// src/app/task_manage/page.tsx

'use client';

import Header from '@/components/Header';
import { Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';
import type { Period } from '@/types/Task';
import { auth } from '@/lib/firebase';
import { toast } from 'sonner'; 
import { fetchTasksForUser } from '@/lib/firebaseUtils';
import { deleteTaskFromFirestore } from '@/lib/firebaseUtils';
import type { Task } from '@/types/Task';
import TaskManageCard from '@/components/TaskManageCard'; 
import type { TaskManageTask } from '@/types/Task';
import { dayNumberToName } from '@/lib/constants';
import { fetchPairUserIds, saveAllTasks } from '@/lib/taskUtils';
import { useProfileImages } from '@/hooks/useProfileImages';


export default function TaskManagePage() {
  const [tasks, setTasks] = useState<TaskManageTask[]>([]);
  const [filter, setFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { profileImage, partnerImage } = useProfileImages();
  const addTask = () => {
    const newId = crypto.randomUUID();
    const newGroupId = crypto.randomUUID();
    setTasks([
      {
        id: newId,
        name: '',
        period: '毎日',
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

    const sharedUserIds = await fetchPairUserIds(uid);
    await saveAllTasks(tasks, uid, sharedUserIds);

    setTasks(prev =>
      prev.map(task => ({ ...task, isNew: false, isEdited: false, showDelete: false }))
    );
    toast.success('タスクを保存しました');
  };

  useEffect(() => {
    const fetchTasks = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const fetched = await fetchTasksForUser(uid);
      const loadedTasks: Task[] = fetched.map(({ id, data }) => ({
        id,
        name: data.name,
        period: data.period,
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