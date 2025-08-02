'use client';

import { CheckCircle } from 'lucide-react';
import type { Task } from '@/types/Task';
import { format } from 'date-fns';

type Props = {
    tasks: Task[];
};

export default function TodayCompletedTasksCard({ tasks }: Props) {
    return (
        <div className="bg-white rounded-lg shadow-md p-4 mx-auto w-full max-w-xl">
            <div className="flex items-center justify-center mb-2">
                <CheckCircle className="w-6 h-6 text-green-500" />
                <h3 className="ml-2 font-bold text-lg text-gray-800">本日の完了タスク</h3>
            </div>

            {tasks.length > 0 ? (
                <ul className="divide-y divide-gray-200">
                    {tasks.map((task) => (
                        <li key={task.id} className="py-2 flex items-center justify-between">
                            <span className="text-gray-700 truncate">{task.name}</span>
                            <span className="text-sm text-gray-400">
                                {task.completedAt
                                    ? format(
                                        typeof task.completedAt === 'string'
                                            ? new Date(task.completedAt)
                                            : task.completedAt.toDate(),
                                        'HH:mm'
                                    )
                                    : ''}

                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-gray-500 text-sm text-center py-4">本日の完了タスクはありません。</p>
            )}
        </div>
    );
}
