// src/components/TaskCard.tsx
'use client';

export const dynamic = 'force-dynamic'

import { motion } from 'framer-motion';
import { useSwipeable } from 'react-swipeable';
/* ★変更: 矢印アイコンを両方向で使うため ArrowRight/ArrowLeft を追加 */
/* ★追加: タップ促し用に MousePointerClick を追加 */
import { CheckCircle, Circle, Calendar, Clock, Pencil, Flag, Trash2, Notebook, X, SquareUser, ArrowRight, ArrowLeft, MousePointerClick } from 'lucide-react';
import { useEffect, useState, useRef, useMemo } from 'react';
import type { Task, Period } from '@/types/Task';
import Image from 'next/image';
import clsx from 'clsx';
import { useView } from '@/context/ViewContext';
import { updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ConfirmModal from '@/components/common/modals/ConfirmModal';
import { createPortal } from 'react-dom';
import LinkifiedText from '@/components/common/LinkifiedText';
/* ★追加: react-swipeable のイベント型 */
import type { SwipeEventData } from 'react-swipeable';
/* ★追加: ヘルプON/OFFのグローバル状態 */
import { useHelpHints } from '@/context/HelpHintsContext';

const dayBorderClassMap: Record<string, string> = {
  '0': 'border-orange-200',
  '1': 'border-gray-300',
  '2': 'border-red-200',
  '3': 'border-blue-200',
  '4': 'border-green-200',
  '5': 'border-yellow-200',
  '6': 'border-amber-200',
};

const dayBaseClass = 'bg-gray-600';

const dayKanjiToNumber: Record<string, string> = {
  '日': '0',
  '月': '1',
  '火': '2',
  '水': '3',
  '木': '4',
  '金': '5',
  '土': '6',
};

type UserInfo = {
  id: string;
  name: string;
  imageUrl: string;
};

// 備考noteをローカルで許容
type TaskWithNote = Task & { note?: string };

type Props = {
  task: Task;
  period: Period;
  index: number;
  onToggleDone: (period: Period, taskId: string) => void;
  onDelete: (period: Period, id: string) => void;
  onEdit: () => void;
  userList: UserInfo[];
  isPairConfirmed: boolean;
  isPrivate: boolean;
  onLongPress?: (x: number, y: number) => void;
  deletingTaskId: string | null;
  onSwipeLeft: (taskId: string) => void;
  onSkip?: (taskId: string) => void;
  isDragging?: boolean;
};

export default function TaskCard({
  task,
  period,
  onToggleDone,
  onDelete,
  userList,
  isPairConfirmed,
  onEdit,
  onSwipeLeft,
  deletingTaskId,
  onSkip,
  isDragging,
}: Props) {
  const { setIndex, setSelectedTaskName } = useView();

  /* ★追加: 「？」ボタンON/OFF（グローバル） */
  const { enabled: helpEnabled } = useHelpHints();

  const cardRef = useRef<HTMLDivElement | null>(null);

  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const [animateTrigger, setAnimateTrigger] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const [showActionButtons, setShowActionButtons] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingConfirmResolver = useRef<((ok: boolean) => void) | null>(null);
  const [localDone, setLocalDone] = useState(task.done);

  // ★追加: ヒントのフェーズ制御（2往復 → exit で吸い込まれる）
  const [leftHintPhase, setLeftHintPhase] = useState<'loop' | 'exit' | null>(null);
  const [rightHintPhase, setRightHintPhase] = useState<'loop' | 'exit' | null>(null);

  // 備考モーダル開閉
  const [showNote, setShowNote] = useState(false);

  const noteText = (task as TaskWithNote).note?.trim();

  /* ★追加: 表示範囲検知用（ToDo画面に切替わってカードが見えたら発火） */
  const [isInView, setIsInView] = useState(false);

  /* ★追加: 促しアニメ表示フラグ（左→中央付近） */
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  /* ★追加: 右端→左に「←SKIP」アニメ（？アイコンON時のみ） */
  const [showSkipHint, setShowSkipHint] = useState(false);

  /* ★追加: スワイプ方向ブースト（右スワイプ=左ヒント加速、左スワイプ=右ヒント加速） */
  const [swipeBoost, setSwipeBoost] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const boostTimerRef = useRef<{ left: number | null; right: number | null }>({ left: null, right: null });

  /** ★追加: 指を動かしている間＆離した直後に一定時間ブーストを維持 */
  const triggerBoost = (dir: 'left' | 'right', holdMs = 300) => {
    setSwipeBoost((prev) => ({ ...prev, [dir]: true }));
    const key = dir;
    if (boostTimerRef.current[key] != null) {
      clearTimeout(boostTimerRef.current[key]!);
    }
    boostTimerRef.current[key] = window.setTimeout(() => {
      setSwipeBoost((prev) => ({ ...prev, [key]: false }));
      boostTimerRef.current[key] = null;
    }, holdMs);
  };

  useEffect(() => {
    return () => {
      // ★追加: アンマウント時にブーストタイマーをクリア
      if (boostTimerRef.current.left != null) clearTimeout(boostTimerRef.current.left);
      if (boostTimerRef.current.right != null) clearTimeout(boostTimerRef.current.right);
    };
  }, []);

  useEffect(() => {
    setLocalDone(task.done);
  }, [task.done]);

  const { profileImage, profileName } = useMemo(() => {
    const assignedUserId = task.users?.[0];
    const assignedUser = userList.find((u) => u.id === assignedUserId);
    return {
      profileImage: assignedUser?.imageUrl ?? '/images/default.png',
      profileName: assignedUser?.name ?? '未設定',
    };
  }, [task.users, userList]);

  const sortedDays = useMemo(() => {
    if (!task.daysOfWeek) return [];
    const order = ['0', '1', '2', '3', '4', '5', '6'];
    return [...task.daysOfWeek].sort(
      (a, b) => order.indexOf(dayKanjiToNumber[a]) - order.indexOf(dayKanjiToNumber[b])
    );
  }, [task.daysOfWeek]);

  // 日付/時間の表示用フォーマッタ
  const dateStr = useMemo(() => {
    const d = task.dates?.[0];
    if (!d) return '';
    // YYYY-MM-DD -> MM/DD
    return d.replace(/-/g, '/').slice(5);
  }, [task.dates]);

  const timeStr = task.time || '';

  const toggleFlag = async () => {
    if (task.done) return;
    try {
      const newFlag = !task.flagged;
      setTimeout(() => setShowActionButtons(false), 500);

      const taskRef = doc(db, 'tasks', task.id);
      const taskSnap = await getDoc(taskRef);
      if (!taskSnap.exists()) {
        console.warn('該当タスクが存在しません');
        return;
      }

      await updateDoc(taskRef, {
        flagged: newFlag,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error('フラグ更新エラー:', error);
    }
  };

  // ★変更: onSwiping を追加して実スワイプ方向で促しアニメを加速（ヘルプON時のみ）
  const swipeable = useSwipeable({
    onSwipedLeft: () => {
      setSwipeDirection('left');
      setShowActions(false);
      onSwipeLeft(task.id);
    },
    onSwipedRight: () => {
      setSwipeDirection('right');
      setShowActions(false);
    },
    onSwiping: (e: SwipeEventData) => {
      if (!helpEnabled) return; // ★ヘルプOFFならブースト無効
      if (e.dir === 'Left') {
        // 左へスワイプ中 → 右ヒント(←SKIP)を加速
        triggerBoost('left');
      } else if (e.dir === 'Right') {
        // 右へスワイプ中 → 左ヒント(Todo→)を加速
        triggerBoost('right');
      }
    },
    trackTouch: true,
  });

  // ★変更: 左ヒント（Todo）表示トリガー。isInView かつ ヘルプON になったら loop フェーズ開始
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (helpEnabled && task.visible && isInView) {
      setShowSwipeHint(true);
      setLeftHintPhase('loop');
    } else {
      // OFFや非可視になったら即リセット
      setShowSwipeHint(false);
      setLeftHintPhase(null);
    }
  }, [helpEnabled, task.visible, isInView]);

  // ★変更: 右ヒント（SKIP）表示トリガー。同様にヘルプON時のみ loop フェーズ開始
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (helpEnabled && isInView) {
      setShowSkipHint(true);
      setRightHintPhase('loop');
    } else {
      setShowSkipHint(false);
      setRightHintPhase(null);
    }
  }, [helpEnabled, isInView]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!cardRef.current) return;
      if (!cardRef.current.contains(e.target as Node)) {
        setSwipeDirection(null);
        setShowActions(false);
        setShowActionButtons(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClick = () => {
    if (showActions) return;
    setAnimateTrigger((prev) => prev + 1);
    setLocalDone(true);
    setTimeout(() => {
      onToggleDone(period, task.id);
    }, 300);
  };

  const handleDelete = () => {
    new Promise<boolean>((resolve) => {
      pendingConfirmResolver.current = resolve;
      setConfirmOpen(true);
    }).then((ok) => {
      if (ok) onDelete(period, task.id);
      setSwipeDirection(null);
    });
  };

  const handleTodoClick = () => {
    // タスクIDを渡して、Todo側で「詳細を直接開く」挙動にする
    setSelectedTaskName(task.id); // ★ ここを name → id に
    setIndex(2);
  };

  /* ★変更: メニュー自動クローズ時間（誤 50000 → 正 5000ms に修正） */
  useEffect(() => {
    if (!showActions) return;
    const timeout = setTimeout(() => setShowActions(false), 5000);
    return () => clearTimeout(timeout);
  }, [showActions]);

  /* ★追加: IntersectionObserver で「カードが50%以上見えたら isInView=true」 */
  useEffect(() => {
    if (!cardRef.current) return;
    const el = cardRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsInView(entry.isIntersecting && entry.intersectionRatio >= 0.5);
      },
      { threshold: [0, 0.5, 1] }
    );
    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  /* ★追加: スワイプ加速用の可変パラメータ（右スワイプ=左ヒント加速 / 左スワイプ=右ヒント加速） */
  const leftLoopDuration = swipeBoost.right ? 0.7 : 1.6;  // 右へスワイプ中は左ヒント(Todo→)を加速
  const rightLoopDuration = swipeBoost.left ? 0.7 : 1.6;  // 左へスワイプ中は右ヒント(←SKIP)を加速
  const leftEase: any = swipeBoost.right ? 'easeOut' : 'easeInOut';
  const rightEase: any = swipeBoost.left ? 'easeOut' : 'easeInOut';

  return (
    <div className="relative" ref={cardRef}>
      {swipeDirection === 'left' && deletingTaskId === task.id && !showActions && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
          <button
            className="w-16 h-11 text-sm font-bold text-white flex items-center justify-center rounded-xl bg-gradient-to-b from-orange-300 to-orange-500 shadow-md ring-1 ring-white/30 ring-2 ring-white active:translate-y-[1px] transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onSkip?.(task.id);
              setSwipeDirection(null);
            }}
            title="スキップ（ポイント加算なし）"
          >
            <span className="[text-shadow:1px_1px_1px_rgba(0,0,0,0.5)]">SKIP</span>
          </button>
        </div>
      )}

      {swipeDirection === 'right' && task.visible && (
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20">
          <button
            className="w-16 h-11 text-sm font-bold text-white rounded-xl bg-gradient-to-b from-blue-300 to-blue-500 shadow-md ring-1 ring-white/30 ring-2 ring-white active:translate-y-[1px] transition-transform"
            onClick={handleTodoClick}
          >
            <span className="[text-shadow:1px_1px_1px_rgba(0,0,0,0.5)]">TODO</span>
          </button>
        </div>
      )}

      {/* メニュー表示 */}
      {showActions && showActionButtons && swipeDirection === null && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-auto">
          <div className="flex items-center gap-6">
            {/* 削除 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-b from-red-300 to-red-600 shadow ring-1 ring-red-300 ring-offset-1 flex items-center justify-center text-white active:translate-y-0.5 transition-all duration-150"
              title="削除"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            {/* フラグ */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFlag();
              }}
              disabled={task.done}
              className={clsx(
                'w-12 h-12 rounded-full shadow ring-offset-1 flex items-center justify-center text-white transition-all duration-150',
                task.done
                  ? 'bg-gray-300 opacity-30 cursor-not-allowed'
                  : task.flagged
                  ? 'bg-gradient-to-b from-red-300 to-red-500 ring-1 ring-red-300'
                  : 'bg-gray-300 ring-1 ring-gray-300 text-white'
              )}
              title="重要マーク"
            >
              <Flag className="w-5 h-5" />
            </button>

            {/* 編集 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="w-12 h-12 rounded-full bg-gradient-to-b from-green-300 to-green-600 shadow ring-1 ring-green-300 ring-offset-1 flex items-center justify-center text-white active:translate-y-0.5 transition-all duration-150"
              title="編集"
            >
              <Pencil className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <motion.div
        {...swipeable}
        onClick={() => {
          setSwipeDirection(null);
          setShowActions(true);
          setShowActionButtons(true);
        }}
        className={clsx(
          // 新しいベースクラス
          'w-full relative flex justify-between items-center px-2.5 py-2 overflow-hidden [touch-action:pan-y] cursor-pointer min-h-[58px]',
          // 両方のデザイン統合
          'group text-[#5E5E5E]',
          'rounded-xl border border-gray-200 border-[#e5e5e5]',
          'bg-gradient-to-b from-white to-gray-50 bg-white',
          'shadow-[0_2px_1px_rgba(0,0,0,0.08)] hover:shadow-[0,14px,28px_rgba(0,0,0,0.16)] hover:shadow-md',
          'transition-all duration-300 will-change-transform',
          'active:translate-y-[1px]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFCB7D]/50',
          // 状態による動的クラス
          task.done && 'opacity-50 scale-[0.99]',
          isDragging && 'opacity-70'
        )}
      >
        {/* TODOバッジ（左上） */}
        {task.visible && (
          <div
            className="absolute top-0 left-0 w-[30px] h-[30px] bg-gradient-to-br from-blue-400 to-blue-600 text-white text-[11px] font-bold flex items-center justify-center z-10 shadow-inner ring-1 ring-white/40"
            style={{ clipPath: 'polygon(0 0, 0 100%, 100% 0)' }}
          >
            <span className="translate-y-[-6px] translate-x-[-4px]">T</span>
          </div>
        )}

        {/* ★変更: 左端→中央 促し（2往復 → exitで内側に縮小しつつフェードアウト） */}
        {helpEnabled && task.visible && showSwipeHint && (
          <div className="absolute inset-0 z-40 pointer-events-none">
            <div className="absolute inset-y-0 left-0 flex items-center">
              <motion.div
                key="hint-left"
                initial={{ opacity: 0.95, x: '0%', scale: 1 }}
                animate={
                  leftHintPhase === 'exit'
                    ? {
                        // ★exit: カード内へ「吸い込まれる」演出（少し内側へ + 縮小 + フェード）
                        x: '16%',
                        scale: 0.6,
                        opacity: 0,
                        transition: { duration: 0.35, ease: 'easeIn' },
                      }
                    : {
                        // ★loop: 2往復（行って戻る × 2回）
                        x: ['0%', '40%', '0%'],
                        transition: {
                          times: [0, 0.5, 1],
                          duration: leftLoopDuration, // ★可変
                          ease: leftEase,             // ★可変
                          repeat: 0,
                        },
                      }
                }
                onAnimationComplete={() => {
                  if (leftHintPhase === 'loop') {
                    // 2往復が終わったら exit フェーズへ
                    setLeftHintPhase('exit');
                  } else if (leftHintPhase === 'exit') {
                    // 吸い込みフェード完了で DOM から取り除く
                    setShowSwipeHint(false);
                    setLeftHintPhase(null);
                  }
                }}
                className="px-3 py-1.5 rounded-md bg-blue-500/80 backdrop-blur-sm shadow ring-1 ring-black/10 flex items-center gap-2"
              >
                <span className="text-[12px] font-semibold text-white">Todo</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </motion.div>
            </div>
          </div>
        )}

        {/* ★変更: 右端→左へ 促し（2往復 → exitで内側に縮小しつつフェードアウト） */}
        {helpEnabled && showSkipHint && (
          <div className="absolute inset-0 z-40 pointer-events-none">
            <div className="absolute inset-y-0 right-0 flex items-center">
              <motion.div
                key="hint-right"
                initial={{ opacity: 0.95, x: '0%', scale: 1 }}
                animate={
                  rightHintPhase === 'exit'
                    ? {
                        x: '-16%',
                        scale: 0.6,
                        opacity: 0,
                        transition: { duration: 0.35, ease: 'easeIn' },
                      }
                    : {
                        x: ['0%', '-40%', '0%'],
                        transition: {
                          times: [0, 0.5, 1],
                          duration: rightLoopDuration, // ★可変
                          ease: rightEase,             // ★可変
                          repeat: 0,
                        },
                      }
                }
                onAnimationComplete={() => {
                  if (rightHintPhase === 'loop') {
                    setRightHintPhase('exit');
                  } else if (rightHintPhase === 'exit') {
                    setShowSkipHint(false);
                    setRightHintPhase(null);
                  }
                }}
                className="px-3 py-1.5 rounded-md bg-orange-500/80 backdrop-blur-sm shadow ring-1 ring-black/10 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
                <span className="text-[12px] font-semibold text-white">SKIP</span>
              </motion.div>
            </div>
          </div>
        )}

        {/* ★追加: タップ促しアイコン（〇に囲まれた指）— 促しアニメ表示中のみ（ヘルプON時） */}
        {helpEnabled && (showSwipeHint || showSkipHint) && (
          <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
            <motion.div
              aria-hidden
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{
                opacity: 0.95,
                scale: [0.96, 1.02, 0.96],
              }}
              transition={{
                duration: 1.2,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatType: 'reverse',
              }}
              className="pointer-events-none rounded-full bg-white/85 backdrop-blur-sm shadow-md ring-2 ring-[#5E5E5E]/15 w-12 h-12 flex items-center justify-center"
            >
              <MousePointerClick className="w-6 h-6 text-[#5E5E5E]" />
            </motion.div>
          </div>
        )}

        {/* 左側：チェック・2行表示（1行目=名前、2行目=日時+曜日） */}
        <div className="flex items-center gap-3 ml-2 min-w-0 flex-1">
          {/* チェック */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            className="focus:outline-none"
          >
            <div className="relative w-6 h-6">
              {localDone ? (
                <motion.div
                  key={animateTrigger}
                  className="absolute top-0 left-0 w-full h-full"
                  initial={{ rotate: 0, scale: 1 }}
                  animate={{ rotate: 360, scale: [1, 1.3, 1] }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <CheckCircle className="text-emerald-500 w-6 h-6" />
                </motion.div>
              ) : (
                <Circle className="text-gray-400 w-6 h-6" />
              )}
            </div>
          </button>

          {/* 本体（2行） */}
          <div className="min-w-0 flex-1">
            {/* 1行目：タスク名 + フラグ */}
            <div className="flex items-center gap-1 min-w-0">
              {task.flagged && <Flag className="text-red-500 w-4 h-4 shrink-0" />}
              <span className="text-[#5E5E5E] font-bold font-sans truncate">{task.name}</span>
            </div>
            {/* 2行目：日付・曜日・時間 */}
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-600">
              {/* 日付 */}
              {dateStr && (
                <span className="inline-flex items-center gap-1 leading-none">
                  <Calendar size={12} className="text-gray-600" />
                  <span className="leading-none">{dateStr}</span>
                </span>
              )}

              {/* 曜日（ピル） */}
              {sortedDays.length > 0 && (
                <div className="flex items-center gap-[2px]">
                  {sortedDays.map((d, i) => (
                    <div
                      key={i}
                      className={clsx(
                        'w-5 h-5 rounded-full text-white text-[10px] flex items-center justify-center border-2',
                        'shrink-0 leading-none',
                        dayBaseClass,
                        dayBorderClassMap[dayKanjiToNumber[d]] ?? 'border-gray-500'
                      )}
                      title={`${d}曜`}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              )}

              {/* 時間 */}
              {timeStr && (
                <span className="inline-flex items-center gap-1 leading-none">
                  <Clock size={12} className="text-gray-600" />
                  <span className="leading-none">{timeStr}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 右側：ポイント・画像（日時と曜日は左へ移動） */}
        <div className="flex items-center gap-1">
          {task.private && isPairConfirmed ? (
            <div className="flex items-center gap-2">
              {/* 備考がある時だけ Info を表示（privateでも表示） */}
              {noteText && (
                <button
                  type="button"
                  aria-label="備考を表示"
                  title="備考を表示"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote(true);
                  }}
                  className="shrink-0 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <Notebook className="w-5 h-5 text-yellow-500" />
                </button>
              )}
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-300">
                <SquareUser className="w-6 h-6 text-green-600" />
              </div>
            </div>
          ) : !task.private ? (
            <div className="flex items-center gap-2 w-">
              {noteText && (
                <button
                  type="button"
                  aria-label="備考を表示"
                  title="備考を表示"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote(true);
                  }}
                  className="shrink-0 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <Notebook className="w-5 h-5 text-yellow-500" />
                </button>
              )}

              {task.point > 0 && (
                <p className="text-[#5E5E5E] font-sans min-w-[34px] text-right">
                  {task.point} <span className="text-xs">pt</span>
                </p>
              )}

              {isPairConfirmed && (
                <Image
                  src={profileImage || '/images/default.png'}
                  alt={`${profileName}のアイコン`}
                  width={35}
                  height={35}
                  className="rounded-full border border-gray-300 object-cover aspect-square select-none"
                  draggable={false}
                />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* private かつ not confirmed でも備考があれば Info を表示 */}
              {noteText && (
                <button
                  type="button"
                  aria-label="備考を表示"
                  title="備考を表示"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote(true);
                  }}
                  className="shrink-0 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <Notebook className="w-5 h-5 text-yellow-500" />
                </button>
              )}

              <div className="w-[10px] h-[30px]" />
            </div>
          )}
        </div>
      </motion.div>

      {/* 備考モーダル */}
      {showNote &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              setShowNote(false);
            }}
          >
            {/* 背景：白の透過 */}
            <div className="absolute inset-0 bg-white/80" />

            {/* ダイアログ本体 */}
            <div
              className="relative z-[10001] w-[min(92vw,520px)] max-h-[70vh] rounded-2xl bg-white shadow-xl ring-1 ring-black/5 p-5 overflow-auto"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="タスク備考"
            >
              <div className="flex items-start gap-3 mb-3">
                <Notebook className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                <h3 className="text;base font-semibold text-gray-800">備考</h3>

                {/* 右上 × ボタン */}
                <button
                  type="button"
                  aria-label="閉じる"
                  title="閉じる"
                  className="ml-auto -mt-1 p-2 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote(false);
                  }}
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              {/* URLをクリック可能に */}
              <LinkifiedText
                text={(task as Task & { note?: string }).note?.trim() || ''}
                className="whitespace-pre-wrap break-words text-[15px] leading-6 text-gray-700"
              />
            </div>
          </div>,
          document.body
        )}

      <ConfirmModal
        isOpen={confirmOpen}
        title=""
        message={<div className="text-xl font-semibold">このタスクを削除しますか？</div>}
        onConfirm={() => {
          setConfirmOpen(false);
          pendingConfirmResolver.current?.(true);
          pendingConfirmResolver.current = null;
        }}
        onCancel={() => {
          setConfirmOpen(false);
          pendingConfirmResolver.current?.(false);
          pendingConfirmResolver.current = null;
        }}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
      />
    </div>
  );
}
