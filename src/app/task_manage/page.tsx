// src/app/task_manage/page.tsx

'use client';

import Header from '@/components/Header';
import { Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import SearchBox from '@/components/SearchBox';
import FilterControls from '@/components/FilterControls';
import type { Period } from '@/types/Task';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useSwipeable } from 'react-swipeable';
import { toast } from 'sonner'; 
import { deleteDoc } from 'firebase/firestore';

const dayNumberToName: Record<string, string> = {
  '0': '日',
  '1': '月',
  '2': '火',
  '3': '水',
  '4': '木',
  '5': '金',
  '6': '土',
};


interface Task {
  id: string;
  name: string;
  frequency: '毎日' | '週次' | '不定期';
  point: number;
  users: string[];
  daysOfWeek: string[];
  dates: string[];
  isNew: boolean;
  isEdited: boolean;
  showDelete: boolean;
  isTodo?: boolean; // ← 追加（optional にしておく）
  nameError?: boolean;
}

interface TaskCardProps {
  task: Task;
  onChange: (id: string, key: keyof Task, value: string | number | string[] | boolean) => void;
  onRemove: (id: string) => void;
  onToggleUser: (id: string, user: string) => void;
  onToggleDay: (id: string, day: string) => void;
  onToggleDelete: (id: string) => void;
  profileImage: string;
  partnerImage: string;
}

const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onChange,
  onRemove,
  onToggleUser,
  onToggleDay,
  onToggleDelete,
  profileImage,
  partnerImage,
}) => {
  const days = ['月', '火', '水', '木', '金', '土', '日'];


  const handlers = useSwipeable({
    onSwipedLeft: () => onToggleDelete(task.id),
    delta: 50,
  });


  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    onChange(task.id, 'dates', [newDate]);
  };

  return (
    <div
      {...handlers}
      onClick={() => task.showDelete && onToggleDelete(task.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggleDelete(task.id); // ✅ 右クリックで削除トグル
      }}
      className="relative bg-white shadow rounded-2xl px-4 py-3 space-y-2 flex flex-col"
    >
      {(task.isNew || task.isEdited) && (
        <div
          className={`absolute -top-2 -left-2 w-4 h-4 rounded-full ${
            task.isNew ? 'bg-red-400' : 'bg-blue-400'
          }`}
        />
      )}

      {task.showDelete && (
        <button
          className="absolute right-2 top-2 w-20 h-18 bg-[#ff6347] text-white font-bold rounded-xl shadow-md flex items-center justify-center z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(task.id);
          }}
        >
          削除
        </button>
      )}

      <div className="flex flex-col flex-1">
        <input
          type="text"
          value={task.name}
          placeholder="ここに家事を入力する"
          onChange={(e) => onChange(task.id, 'name', e.target.value)}
          className="text-[#5E5E5E] placeholder-gray-300 outline-none bg-transparent border-b border-gray-300"
        />
        {task.nameError && (
          <p className="text-red-500 text-xs mt-1">タスク名を入力してください</p>
        )}
      </div>


      <div className="flex items-center justify-between">
        <select
          value={task.frequency}
          onChange={(e) => onChange(task.id, 'frequency', e.target.value as Task['frequency'])}
          className="bg-transparent outline-none border-b border-gray-300"
        >
          {['毎日', '週次', '不定期'].map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <div className="flex items-center w-20">
          <select
            value={task.point}
            onChange={(e) => onChange(task.id, 'point', Number(e.target.value))}
            className="w-20 bg-transparent outline-none border-b border-gray-300"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
              <option key={val} value={val}>{val}</option>
            ))}
          </select>
          <span className="ml-1">pt</span>
        </div>

        <div className="flex gap-2">
          {[{ name: '太郎', image: profileImage }, { name: '花子', image: partnerImage }].map((user, _, array) => (
            <button
              key={user.name}
              onClick={() => {
                const isSelected = task.users.includes(user.name);
                const other = array.find(u => u.name !== user.name);
                const isOtherSelected = other ? task.users.includes(other.name) : false;

                if (isSelected && !isOtherSelected) {
                  // 自分だけ ON → 自分を OFF、相手を ON
                  onToggleUser(task.id, user.name);     // OFF
                  if (other) onToggleUser(task.id, other.name); // ON
                } else if (isSelected && isOtherSelected) {
                  // 両方 ON → 自分だけ OFF
                  onToggleUser(task.id, user.name);     // OFF
                } else if (!isSelected) {
                  // 自分が OFF → 自分を ON
                  onToggleUser(task.id, user.name);     // ON
                }
              }}
              className={`w-8.5 h-8.5 rounded-full border overflow-hidden ${
                task.users.includes(user.name)
                  ? 'border-[#FFCB7D] opacity-100'
                  : 'border-gray-300 opacity-30'
              }`}
            >
              <Image
                src={user.image}
                alt={`${user.name}のフィルター`}
                width={32}
                height={32}
                className="object-cover w-full h-full"
              />
            </button>
          ))}
        </div>
      </div>

      {task.frequency === '週次' && (
        <div className="flex gap-2 pt-1">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => onToggleDay(task.id, day)}
              className={`w-6 h-6 rounded-full text-xs font-bold ${
                task.daysOfWeek.includes(day)
                  ? 'bg-[#5E5E5E] text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      )}

      {task.frequency === '不定期' && (
        <div className="pt-1">
          <label className="text-sm text-gray-600">日付選択：</label>
          <input
            type="date"
            value={task.dates[0] || ''}
            onChange={handleDateChange}
            className="ml-2 border-b border-gray-300 px-2 py-1 text-sm bg-transparent focus:outline-none"
          />
        </div>
      )}
    </div>
  );
};

TaskCard.displayName = 'TaskCard';

export default function TaskManagePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Period | null>(null);
  const [personFilter, setPersonFilter] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [profileImage, setProfileImage] = useState<string>('/images/taro.png');
  const [partnerImage, setPartnerImage] = useState<string>('/images/hanako.png');
  const addTask = () => {
  const newId = crypto.randomUUID(); // 例: "9a4b-xxx-..."
    setTasks([
      {
        id: newId,
        name: '',
        frequency: '毎日',
        point: 10,
        users: ['太郎', '花子'],
        daysOfWeek: [],
        dates: [],
        isNew: true,
        isEdited: false,
        showDelete: false,
      },
      ...tasks,
    ]);
  };
  

  const updateTask = (
    id: string,
    key: keyof Task,
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
        await deleteDoc(doc(db, 'tasks', id));
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
        return {
          ...task,
          nameError: isEmpty,
        };
      })
    );

    if (hasEmptyName) return;

    for (const task of tasks) {

      const dayNameToNumber: Record<string, string> = {
        '日': '0',
        '月': '1',
        '火': '2',
        '水': '3',
        '木': '4',
        '金': '5',
        '土': '6',
      };

      const daysOfWeek =
        task.frequency === '週次'
          ? task.daysOfWeek.map((d) => dayNameToNumber[d])
          : task.daysOfWeek;

      const taskData = {
        userId: uid,
        name: task.name,
        frequency: task.frequency,
        point: task.point,
        users: task.users,
        daysOfWeek,
        dates: task.dates,
        isTodo: task.isTodo ?? false,
        updatedAt: serverTimestamp(),
      };


      if (task.isNew) {
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          createdAt: serverTimestamp(),
        });
      } else if (task.isEdited) {
        await updateDoc(doc(db, 'tasks', task.id), taskData);
      }
    }

    setTasks(prev =>
      prev.map(task => ({ ...task, isNew: false, isEdited: false, showDelete: false }))
    );
    toast.success('タスクを保存しました');
  };



  const clearFilters = () => {
    setFilter(null);
    setPersonFilter(null);
    setSearchTerm('');
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

      const q = query(collection(db, 'tasks'), where('userId', '==', uid));
      const snapshot = await getDocs(q);
      const loadedTasks: Task[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...(data as Omit<Task, 'id' | 'isNew' | 'isEdited' | 'showDelete'>),
          id: doc.id,
          daysOfWeek: (data.daysOfWeek ?? []).map((d: string) => dayNumberToName[d] ?? d),
          isNew: false,
          isEdited: false,
          showDelete: false,
        };
      });

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

        {(filter || personFilter || searchTerm) && (
          <div className="flex justify-center mt-2">
            <button
              onClick={clearFilters}
              className="text-xs px-3 py-1 bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300 transition"
            >
              フィルター解除
            </button>
          </div>
        )}

        <hr className="border-t border-gray-300 opacity-50 my-4" />

        <div className="space-y-2.5 pb-40">
          {tasks
            .filter(task => !filter || task.frequency === filter)
            .filter(task => !personFilter || task.users.includes(personFilter))
            .filter(task => (task.name || '').toLowerCase().includes(searchTerm.toLowerCase()))
            .map(task => (
              <TaskCard
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