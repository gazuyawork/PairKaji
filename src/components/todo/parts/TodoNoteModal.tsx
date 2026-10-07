'use client';

export const dynamic = 'force-dynamic';

import type React from 'react';
import {
  useEffect,
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react';
import { ChevronDown, ChevronUp, Eye, GripVertical, Pencil, Plus, X } from 'lucide-react';
import { auth, db, storage } from '@/lib/firebase';
import { updateTodoInTask } from '@/lib/firebaseUtils';
import {
  doc,
  getDoc,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import BaseModal from '../../common/modals/BaseModal';
import { createPortal } from 'react-dom';
import NextImage from 'next/image';
import { toast } from 'sonner';

const SAVE_TIMEOUT_MS = 20_000;

function withTimeout<T>(work: Promise<T>, ms = SAVE_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('save-timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ▼▼ dnd-kit（参考URL・チェックリストの並び替え用） ▼▼
import {
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from '@dnd-kit/core';
import RecoverableDndContext from '@/components/common/RecoverableDndContext';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
// ▲▲ dnd-kit ▲▲

/* ---------------- Types & guards ---------------- */

type ChecklistItem = { id: string; text: string; done: boolean };

type TaskDoc = {
  todos?: TodoDoc[];
};

type TodoDoc = {
  id: string;
  text?: string;
  memo?: string;
  price?: number | null;
  quantity?: number | null;
  unit?: string;
  imageUrl?: string | null;
  referenceUrls?: string[];
  /** 追加: URLの表示用ラベル（referenceUrls と同じ長さ・順序） */
  referenceUrlLabels?: string[];
  // 追加：チェックリスト
  checklist?: ChecklistItem[];
};

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(isString) : [];
}
function isTodoArray(v: unknown): v is TodoDoc[] {
  return Array.isArray(v) && v.every((x) => x && typeof (x as TodoDoc).id === 'string');
}

/* ---------------- Constants ---------------- */

const MAX_TEXTAREA_VH = 50;

/* ---------------- URL helper（ラベル候補 & favicon用） ---------------- */

// ホスト名抽出
const extractHostname = (raw: string): string => {
  try {
    const u = new URL(raw);
    return u.hostname.replace(/^www\./, '');
  } catch {
    const m = raw.match(/^(?:https?:\/\/)?([^\/:?#]+)/i);
    return (m?.[1] ?? '').replace(/^www\./, '');
  }
};

// URL → 簡易ラベル候補
const suggestLabelFromUrl = (raw: string): string => {
  const host = extractHostname(raw);
  if (!host) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const pathSeg = u.pathname.split('/').filter(Boolean)[0] ?? '';
    const hostCore = host.split('.').slice(-2, -1)[0] || host;
    const head = hostCore.charAt(0).toUpperCase() + hostCore.slice(1);
    return pathSeg ? `${head} - ${pathSeg}` : head;
  } catch {
    const head = host.charAt(0).toUpperCase() + host.slice(1);
    return head;
  }
};

// ゆるめのURL検証（http/https 省略も許容）
const isValidUrlLoose = (value: string): boolean => {
  if (!value.trim()) return true;
  const v = value.trim();
  try {
    const u = new URL(v.startsWith('http') ? v : `https://${v}`);
    return !!u.hostname && /\./.test(u.hostname);
  } catch {
    return false;
  }
};

/* ---------------- Image compression ---------------- */

async function compressImage(
  file: File,
  opts: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<{ blob: Blob; mime: 'image/webp' | 'image/jpeg' }> {
  const maxWidth = opts.maxWidth ?? 1600;
  const maxHeight = opts.maxHeight ?? 1600;
  const quality = opts.quality ?? 0.7;

  if (file.size < 200 * 1024) {
    return {
      blob: file,
      mime: file.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
    } as { blob: Blob; mime: 'image/webp' | 'image/jpeg' };
  }

  const bitmapOrImg: ImageBitmap | HTMLImageElement = await (async () => {
    try {
      return await createImageBitmap(file);
    } catch {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = document.createElement('img');
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = URL.createObjectURL(file);
      });
      return img;
    }
  })();

  const width =
    'naturalWidth' in bitmapOrImg ? bitmapOrImg.naturalWidth : (bitmapOrImg as ImageBitmap).width;
  const height =
    'naturalHeight' in bitmapOrImg ? bitmapOrImg.naturalHeight : (bitmapOrImg as ImageBitmap).height;

  let targetW = width;
  let targetH = height;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    targetW = Math.round(width * ratio);
    targetH = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas 2D コンテキストの取得に失敗しました。');

  ctx.drawImage(bitmapOrImg as unknown as CanvasImageSource, 0, 0, targetW, targetH);

  const toBlob = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));

  const [webpBlob, jpegBlob] = await Promise.all([
    toBlob('image/webp', quality),
    toBlob('image/jpeg', quality),
  ]);

  if (!webpBlob && !jpegBlob) {
    return { blob: file, mime: 'image/jpeg' } as { blob: Blob; mime: 'image/webp' | 'image/jpeg' };
  }
  if (webpBlob && jpegBlob) {
    return webpBlob.size <= jpegBlob.size
      ? { blob: webpBlob, mime: 'image/webp' }
      : { blob: jpegBlob, mime: 'image/jpeg' };
  }
  if (webpBlob) return { blob: webpBlob, mime: 'image/webp' };
  return { blob: jpegBlob!, mime: 'image/jpeg' };
}

/* ---------------- Component ---------------- */

interface TodoNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  todoText: string;
  todoId: string;
  taskId: string;
}

type PendingUpload = { blob: Blob; mime: 'image/webp' | 'image/jpeg' };
type TodoUpdates = Parameters<typeof updateTodoInTask>[2];

// dnd のドラッグハンドル型（URL/チェックリスト用）
type DragHandleRenderProps = {
  attributes: DraggableAttributes;
  listeners: ReturnType<typeof useSortable>['listeners'];
};

function MemoImageFrame({ src, ready }: { src: string; ready: boolean }) {
  return (
    <>
      <div className="w-full" style={{ aspectRatio: '4 / 3' }} />
      <div className="absolute inset-0">
        <NextImage
          src={src}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 640px"
          className="object-contain transition-opacity duration-200"
          style={{ opacity: ready ? 1 : 0 }}
          priority={false}
        />
        {!ready && <div className="absolute inset-0 animate-pulse bg-gray-100" />}
      </div>
    </>
  );
}

// Sortable 行（URL/チェックリスト共通で使用）
function SortableUrlRow({
  id,
  children,
}: { id: string; children: (p: DragHandleRenderProps) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-12 gap-2 items-center">
      {children({ attributes, listeners })}
    </div>
  );
}

export default function TodoNoteModal({
  isOpen,
  onClose,
  todoText,
  todoId,
  taskId,
}: TodoNoteModalProps) {
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iP(hone|od|ad)|Macintosh;.*Mobile/.test(navigator.userAgent);

  const [mounted, setMounted] = useState(false);

  // ★追加：Todo名（todo.text）を編集できるようにする
  const [todoTitle, setTodoTitle] = useState(todoText);

  const [memo, setMemo] = useState('');
  const [initialLoad, setInitialLoad] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const saveLabel = '保存';
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);

  // ★ 編集/プレビュー
  const [isPreview, setIsPreview] = useState(false);
  const [modeInitialized, setModeInitialized] = useState(false);

  // ▼▼ バリデーション制御 ▼▼
  const [errorsShown, setErrorsShown] = useState(false);
  const [urlErrors, setUrlErrors] = useState<string[]>([]);

  // 画像
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previousImageUrl, setPreviousImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isImageRemoved, setIsImageRemoved] = useState(false);

  // 参考URL
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [referenceLabels, setReferenceLabels] = useState<string[]>([]); // 表示ラベル
  const [urlIds, setUrlIds] = useState<string[]>([]);
  const urlRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [pendingUrlFocusIndex, setPendingUrlFocusIndex] = useState<number | null>(null);

  // チェックリスト（input）
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checkIds, setCheckIds] = useState<string[]>([]);
  const checkInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [pendingCheckFocusIndex, setPendingCheckFocusIndex] = useState<number | null>(null);

  // プレビュー用の個別保存インジケータ
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});

  // プレビュー用
  const [imgReady, setImgReady] = useState(false);
  const [imageZoomed, setImageZoomed] = useState(false);
  const displaySrc = previewUrl ?? imageUrl;
  const showMediaFrame = isOpen && !!displaySrc;

  const memoRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 内容の存在判定
  const hasMemo = useMemo(() => memo.trim().length > 0, [memo]);
  const hasImage = useMemo(() => imageUrl !== null, [imageUrl]);

  const hasReference = useMemo(
    () => referenceUrls.some((u) => u.trim() !== ''),
    [referenceUrls]
  );

  const hasChecklist = useMemo(
    () => checklist.some((c) => (c.text ?? '').trim() !== ''),
    [checklist]
  );

  const hasContent = useMemo(() => {
    return hasMemo || hasImage || hasReference || hasChecklist;
  }, [hasMemo, hasImage, hasReference, hasChecklist]);

  const [showScrollHint, setShowScrollHint] = useState(false);
  const [showScrollUpHint, setShowScrollUpHint] = useState(false);

  const updateHints = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;
    const canScroll = el.scrollHeight > el.clientHeight + 1;
    const notAtBottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    const notAtTop = el.scrollTop > 1;
    setShowScrollHint(canScroll && notAtBottom);
    setShowScrollUpHint(canScroll && notAtTop);
  }, []);

  const onTextareaScroll = useCallback(() => updateHints(), [updateHints]);

  useEffect(() => setMounted(true), []);

  // ★ モーダルを開くたびに、モード初期化フラグをリセット（初期データ取得後に決める）
  useEffect(() => {
    if (isOpen) {
      setModeInitialized(false);
      setErrorsShown(false);
    }
  }, [isOpen]);

  // ★追加：props の todoText が変わったらタイトルも追従（必要なら）
  useEffect(() => {
    setTodoTitle(todoText);
  }, [todoText]);

  // --- 初期データの取得 ---
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const fetchTodoData = async () => {
      try {
        if (!taskId || !todoId) return;
        const tRef = doc(db, 'tasks', taskId);
        const tSnap = await withTimeout(getDoc(tRef), 15_000);
        if (cancelled) return;
        if (!tSnap.exists()) return;

        const taskData = tSnap.data() as TaskDoc;

        const todos = isTodoArray(taskData.todos) ? taskData.todos : [];
        const todo = todos.find((t) => t.id === todoId);
        if (!todo) return;

        // ★修正：Firestore の todo.text を優先してタイトルに反映
        setTodoTitle(todo.text ?? todoText);

        setMemo(todo.memo ?? '');

        const existingImageUrl = isString(todo.imageUrl) ? todo.imageUrl : null;
        setImageUrl(existingImageUrl);
        setPreviousImageUrl(existingImageUrl);
        setPendingUpload(null);
        setPreviewUrl(null);
        setIsImageRemoved(false);

        const refs = asStringArray(todo.referenceUrls);
        const refLabels = asStringArray((todo as TodoDoc).referenceUrlLabels);
        setReferenceUrls(refs.length === 0 ? [''] : refs);
        setReferenceLabels(() => {
          const desired = refs.length === 0 ? 1 : refs.length;
          const labels: string[] = [...refLabels];
          while (labels.length < desired) labels.push('');
          if (labels.length > desired) labels.length = desired;
          return labels;
        });
        setUrlIds(() => {
          const arr: string[] = [];
          for (let i = 0; i < (refs.length === 0 ? 1 : refs.length); i++) {
            arr.push(`url_${i}_${Math.random().toString(16).slice(2)}`);
          }
          return arr;
        });

        // チェックリスト（必須ではないが、編集モードで最低1行は表示）
        const existingChecklist = Array.isArray((todo as TodoDoc).checklist)
          ? (todo as TodoDoc).checklist!.map((c, idx) => ({
              id: typeof c?.id === 'string' ? c.id : `cl_${idx}`,
              text: typeof c?.text === 'string' ? c.text : '',
              done: typeof c?.done === 'boolean' ? c.done : false,
            }))
          : [];
        const safeChecklist =
          existingChecklist.length > 0
            ? existingChecklist
            : [{ id: `cl_${Math.random().toString(16).slice(2)}`, text: '', done: false }];
        if (cancelled) return;
        setChecklist(safeChecklist);
        setCheckIds(safeChecklist.map((c) => c.id));
        setLoadFailed(false);
      } catch (e) {
        console.error('初期データの取得に失敗:', e);
        if (!cancelled) {
          setLoadFailed(true);
          toast.error('内容を読み込めませんでした。閉じてもう一度開いてください。');
        }
      } finally {
        if (!cancelled) {
          setInitialLoad(false);
          setTimeout(updateHints, 0);
        }
      }
    };

    setInitialLoad(true);
    setLoadFailed(false);
    void fetchTodoData();
    return () => {
      cancelled = true;
    };
  }, [isOpen, taskId, todoId, todoText, updateHints]);

  // ★ 初期ロード完了後、内容があるならプレビュー / なければ編集 をデフォルトにする
  useEffect(() => {
    if (!isOpen) return;
    if (initialLoad) return;
    if (modeInitialized) return;

    setIsPreview(hasContent); // 内容がある => プレビュー, ない => 編集
    setModeInitialized(true);
  }, [isOpen, initialLoad, modeInitialized, hasContent]);

  // 参考URL：編集モードでは最低1行を保証
  useEffect(() => {
    if (!isPreview && referenceUrls.length === 0) {
      setReferenceUrls(['']);
      setReferenceLabels(['']);
      setUrlIds(['url_init_' + Math.random().toString(16).slice(2)]);
    }
  }, [isPreview, referenceUrls.length]);

  // urlIds 長さ同期 + ラベル長さ同期
  useEffect(() => {
    setUrlIds((prev) => {
      if (prev.length === referenceUrls.length) return prev;
      const next = [...prev];
      while (next.length < referenceUrls.length) next.push(`url_${Math.random().toString(16).slice(2)}`);
      while (next.length > referenceUrls.length) next.pop();
      return next;
    });
    setReferenceLabels((prev) => {
      if (prev.length === referenceUrls.length) return prev;
      const next = [...prev];
      while (next.length < referenceUrls.length) next.push('');
      while (next.length > referenceUrls.length) next.pop();
      return next;
    });
  }, [referenceUrls]);

  // checkIds 同期
  useEffect(() => {
    setCheckIds((prev) => {
      if (prev.length === checklist.length) {
        const aligned = prev.map((id, i) => (checklist[i]?.id ?? id));
        return aligned;
      }
      const next = [...prev];
      while (next.length < checklist.length) {
        next.push(checklist[next.length]?.id ?? `cl_${Math.random().toString(16).slice(2)}`);
      }
      while (next.length > checklist.length) {
        next.pop();
      }
      for (let i = 0; i < checklist.length; i++) {
        if (checklist[i]?.id && next[i] !== checklist[i]!.id) {
          next[i] = checklist[i]!.id;
        }
      }
      return next;
    });
  }, [checklist]);

  // フォーカス適用
  useEffect(() => {
    if (pendingUrlFocusIndex == null) return;
    const el = urlRefs.current[pendingUrlFocusIndex];
    if (el) {
      el.focus();
      setPendingUrlFocusIndex(null);
    }
  }, [pendingUrlFocusIndex, referenceUrls.length, urlIds.length]);

  useEffect(() => {
    if (pendingCheckFocusIndex == null) return;
    const el = checkInputRefs.current[pendingCheckFocusIndex];
    if (el) {
      el.focus();
      setPendingCheckFocusIndex(null);
    }
  }, [pendingCheckFocusIndex, checklist.length, checkIds.length]);

  useEffect(() => {
    if (!isOpen || !isPreview) setImageZoomed(false);
  }, [isOpen, isPreview]);

  useEffect(() => {
    if (!imageZoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImageZoomed(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageZoomed]);

  // テキストエリアのリサイズ等（備考）
  const resizeTextarea = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;
    const maxHeightPx =
      (typeof window !== 'undefined' ? window.innerHeight : 0) * (MAX_TEXTAREA_VH / 100);
    el.style.height = 'auto';
    el.style.maxHeight = `${maxHeightPx}px`;
    el.style.setProperty('-webkit-overflow-scrolling', 'touch');

    if (el.scrollHeight > maxHeightPx) {
      el.style.height = `${maxHeightPx}px`;
      el.style.overflowY = 'auto';
    } else {
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflowY = 'hidden';
    }
    updateHints();
  }, [updateHints]);

  useLayoutEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        resizeTextarea();
        requestAnimationFrame(resizeTextarea);
      });
    }
  }, [isOpen, resizeTextarea]);

  useLayoutEffect(() => {
    if (!initialLoad) {
      requestAnimationFrame(() => {
        resizeTextarea();
        requestAnimationFrame(resizeTextarea);
      });
    }
  }, [initialLoad, resizeTextarea]);

  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(resizeTextarea);
    });
  }, [memo, resizeTextarea]);

  useEffect(() => {
    const onResize = () => resizeTextarea();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeTextarea]);

  // 画像選択（編集時のみ）
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const user = auth.currentUser;
    if (!user) {
      console.warn('未ログインのため画像選択不可');
      return;
    }
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file || !taskId || !todoId) return;

    try {
      setIsUploadingImage(true);

      const { blob, mime } = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.7,
      });

      setPendingUpload({ blob, mime });

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const localUrl = URL.createObjectURL(blob);
      setPreviewUrl(localUrl);

      setIsImageRemoved(false);
    } catch (err) {
      console.error('画像の読み込み/圧縮に失敗しました:', err);
    } finally {
      setIsUploadingImage(false);
      try {
        if (fileInputRef.current) fileInputRef.current.value = '';
        else inputEl.value = '';
      } catch {
        // ignore
      }
    }
  };

  const handleClearImage = () => {
    setIsImageRemoved(true);
    setPendingUpload(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setImageUrl(null);
  };

  // --- dnd sensors（URL / チェックリスト共通） ----------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );

  // 参考URL：操作系
  const addUrlAt = useCallback((index: number) => {
    const newIndex = index + 1;
    setReferenceUrls((prev) => {
      const arr = [...prev];
      arr.splice(newIndex, 0, '');
      return arr;
    });
    setReferenceLabels((prev) => {
      const arr = [...prev];
      arr.splice(newIndex, 0, '');
      return arr;
    });
    setUrlIds((prev) => {
      const arr = [...prev];
      arr.splice(newIndex, 0, `url_${Math.random().toString(16).slice(2)}`);
      return arr;
    });
    setPendingUrlFocusIndex(newIndex);
  }, []);

  const addUrl = useCallback(() => {
    setReferenceUrls((prev) => {
      const next = [...prev, ''];
      setPendingUrlFocusIndex(next.length - 1);
      return next;
    });
    setReferenceLabels((prev) => [...prev, '']);
    setUrlIds((prev) => [...prev, `url_${Math.random().toString(16).slice(2)}`]);
  }, []);

  const removeUrl = (idx: number) => {
    setReferenceUrls((prev) => {
      if (prev.length <= 1) return ['']; // 最後の1件は空行に戻す
      return prev.filter((_, i) => i !== idx);
    });
    setReferenceLabels((prev) => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== idx);
    });
    setUrlIds((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  // URL変更時：ラベル未設定なら候補補完
  const changeUrl = (idx: number, val: string) => {
    setReferenceUrls((prevUrls) => {
      const prevUrl = prevUrls[idx] ?? '';
      const nextUrls = prevUrls.map((u, i) => (i === idx ? val : u));

      setReferenceLabels((prevLabels) => {
        const current = (prevLabels[idx] ?? '').trim();
        const prevAuto = suggestLabelFromUrl(prevUrl).trim();
        const wasAuto = current === '' || current === prevAuto;

        if (!wasAuto) return prevLabels;

        const next = [...prevLabels];
        next[idx] = suggestLabelFromUrl(val);
        return next;
      });

      return nextUrls;
    });
  };

  const onUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.nativeEvent.isComposing) return;
    if (e.keyCode === 229) return;

    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    addUrlAt(idx);
  };

  /* =========================
   *  バリデーション（保存時）
   * ========================= */
  const runValidation = useCallback(() => {
    const nextUrlErrors = referenceUrls.map((u) =>
      u.trim() && !isValidUrlLoose(u) ? 'URLの形式が正しくありません。' : ''
    );

    setUrlErrors(nextUrlErrors);
    return !nextUrlErrors.some((e) => !!e);
  }, [referenceUrls]);

  // 保存（編集時のみ使う想定）
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setErrorsShown(true);
    const okCommon = runValidation();
    if (!okCommon) return;

    setIsSaving(true);

    try {
      const nextImage = await withTimeout((async () => {
        let uploaded: string | null = imageUrl;
        if (!isImageRemoved && pendingUpload) {
          const ext = pendingUpload.mime === 'image/webp' ? 'webp' : 'jpg';
          const path = `task_todos/${taskId}/${todoId}/${Date.now()}.${ext}`;
          const fileRef = storageRef(storage, path);
          await uploadBytes(fileRef, pendingUpload.blob, {
            contentType: pendingUpload.mime,
            customMetadata: { ownerUid: user.uid, taskId, todoId },
          });
          uploaded = await getDownloadURL(fileRef);
        }

        const pairs = referenceUrls.map((url, i) => ({ url, label: referenceLabels[i] ?? '' }));
        const filteredPairs = pairs.filter((p) => isString(p.url) && p.url.trim() !== '');
        const urlsForSave = filteredPairs.map((p) => p.url.trim());
        const labelsForSave = filteredPairs.map((p) => (p.label ?? '').trim());

        const payload: TodoUpdates = {
          memo,
          referenceUrls: urlsForSave,
          referenceUrlLabels: labelsForSave,
        };

        (payload as TodoUpdates & { text?: string }).text = todoTitle.trim();

        if (isImageRemoved) {
          (payload as { imageUrl?: string | null }).imageUrl = null;
        } else if (uploaded) {
          (payload as { imageUrl?: string | null }).imageUrl = uploaded;
        }

        (payload as { checklist?: ChecklistItem[] }).checklist = checklist
          .filter((c) => (c.text ?? '').trim() !== '')
          .map((c) => ({ id: c.id, text: c.text.trim(), done: !!c.done }));

        await updateTodoInTask(taskId, todoId, payload);
        return uploaded;
      })());

      const urlsToDelete: string[] = [];
      if (!isImageRemoved && previousImageUrl && previousImageUrl !== nextImage) {
        urlsToDelete.push(previousImageUrl);
      }
      if (isImageRemoved && previousImageUrl) {
        urlsToDelete.push(previousImageUrl);
      }
      if (urlsToDelete.length > 0) {
        void Promise.all(
          urlsToDelete.map(async (url) => {
            try {
              await withTimeout(deleteObject(storageRef(storage, url)), 8_000);
            } catch (e) {
              console.warn('Storage 画像削除に失敗:', url, e);
            }
          })
        );
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPendingUpload(null);
      setIsImageRemoved(false);
      setImageUrl(nextImage ?? null);
      setPreviousImageUrl(isImageRemoved ? null : nextImage ?? null);

      setSaveComplete(true);
      setTimeout(() => {
        setIsSaving(false);
        setSaveComplete(false);
        onClose();
      }, 900);
    } catch (error) {
      console.error('保存に失敗しました:', error);
      setIsSaving(false);
      setSaveComplete(false);
      const timedOut = error instanceof Error && error.message === 'save-timeout';
      toast.error(
        timedOut
          ? '保存に時間がかかっています。通信状況を確認してもう一度お試しください。'
          : '保存に失敗しました。通信状況を確認してもう一度お試しください。'
      );
    }
  };

  useEffect(() => {
    if (!isOpen) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPendingUpload(null);
      setIsImageRemoved(false);
      setErrorsShown(false);
    }
  }, [isOpen, previewUrl]);

  // 画像のプレロード
  useEffect(() => {
    if (!displaySrc) {
      setImgReady(false);
      return;
    }
    setImgReady(false);
    const img = document.createElement('img');
    img.onload = () => setImgReady(true);
    img.onerror = () => setImgReady(true);
    img.src = displaySrc;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [displaySrc]);

  /* =======================
   *  チェックリスト保存系（プレビューの即保存）
   * ======================= */

  const normalizeChecklistForSave = useCallback((list: ChecklistItem[]): ChecklistItem[] => {
    return list
      .filter((c) => (c.text ?? '').trim() !== '')
      .map((c) => ({ id: c.id, text: c.text.trim(), done: !!c.done }));
  }, []);

  const saveChecklistToFirestore = useCallback(
    async (listForState: ChecklistItem[]) => {
      const payload: TodoUpdates = {
        checklist: normalizeChecklistForSave(listForState),
      } as { checklist: ChecklistItem[] };
      await updateTodoInTask(taskId, todoId, payload);
    },
    [normalizeChecklistForSave, taskId, todoId]
  );

  const handlePreviewToggleChecklist = useCallback(
    async (itemId: string, nextDone: boolean) => {
      const idx = checklist.findIndex((c) => c.id === itemId);
      if (idx < 0) return;

      const prevList = checklist;
      const nextList = prevList.map((c, i) => (i === idx ? { ...c, done: nextDone } : c));
      setChecklist(nextList);
      setSavingById((m) => ({ ...m, [itemId]: true }));

      try {
        await saveChecklistToFirestore(nextList);
      } catch (e) {
        console.error('チェック更新の保存に失敗:', e);
        setChecklist(prevList);
      } finally {
        setSavingById((m) => {
          const n = { ...m };
          delete n[itemId];
          return n;
        });
      }
    },
    [checklist, saveChecklistToFirestore]
  );

  // --- 描画（SSR ガード） ---
  if (!mounted) return null;

  const isLoading = initialLoad;

  // ★ BaseModal のフッターは「編集時のみ」表示（プレビュー時は保存ボタン非表示）
  const hideActions = isLoading || isPreview;

  return (
    <>
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving || isLoading}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
      saveLabel={saveLabel}
      saveDisabled={loadFailed}
      hideActions={hideActions}
    >
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <div className="inline-flex items-center gap-2 text-gray-600 text-sm">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" fill="none" />
              </svg>
              <span>読み込み中…</span>
            </div>
          </div>
        )}

        <div
          className={`transition-opacity duration-150 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          style={{ minHeight: 240 }}
        >
          {/* ヘッダー：ボタンを上に置き、リスト名は下で全幅に折り返す */}
          <div>
            <div className="mb-2 flex items-center justify-end gap-2">
              {isPreview ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsPreview(false);
                    setErrorsShown(false);
                  }}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 hover:border-blue-500"
                  aria-label="編集に切り替える"
                  title="編集"
                >
                  <Pencil size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsPreview(true);
                    setErrorsShown(false);
                  }}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-300 hover:border-blue-500"
                  aria-label="プレビューに切り替える"
                  title="プレビュー"
                >
                  <Eye size={18} />
                </button>
              )}

              {/* ★ 重要：プレビュー時でも必ず閉じられるよう、独自の閉じるボタンを常時表示 */}
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 inline-flex items-center justify-center rounded-full hover:bg-gray-100"
                aria-label="閉じる"
                title="閉じる"
              >
                <X size={18} />
              </button>
            </div>
            {isPreview ? (
              <h2 className="text-base font-bold text-gray-800 break-words">
                {todoTitle.trim() ? todoTitle : '（未入力）'}
              </h2>
            ) : (
              <div className="grid w-full min-w-0 text-base font-bold leading-6 text-gray-800">
                <div
                  aria-hidden
                  className="invisible col-start-1 row-start-1 whitespace-pre-wrap break-words border-b border-transparent pb-1"
                >
                  {(todoTitle || 'リスト名を入力') + '\u200b'}
                </div>
                <textarea
                  value={todoTitle}
                  rows={1}
                  onChange={(e) => setTodoTitle(e.target.value.replace(/\r?\n/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  placeholder="リスト名を入力"
                  className="col-start-1 row-start-1 h-full min-h-0 w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent border-b border-gray-200 pb-1 outline-none focus:border-blue-500"
                  aria-label="リスト名"
                />
              </div>
            )}
          </div>

          {/* 画像挿入UI（編集時のみ操作可能） */}
          <div className="mb-3">
            {!isPreview && (
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center px-3 py-1.5 text-sm rounded-full border border-gray-300 hover:bg-gray-50 cursor-pointer mt-5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageSelect}
                    aria-label="画像を選択"
                  />
                  {isUploadingImage ? '圧縮中…' : '画像を選択'}
                </label>

                {(imageUrl || previewUrl) && (
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-800"
                    aria-label="挿入画像を削除"
                    title="挿入画像を削除"
                  >
                    画像を削除
                  </button>
                )}
              </div>
            )}

            {showMediaFrame && (
              isPreview ? (
                <button
                  type="button"
                  onClick={() => {
                    if (imgReady) setImageZoomed(true);
                  }}
                  className="mt-2 relative block w-full overflow-hidden rounded-lg border border-gray-200 bg-white"
                  aria-label="画像を拡大"
                  disabled={!imgReady}
                >
                  <MemoImageFrame src={displaySrc!} ready={imgReady} />
                </button>
              ) : (
                <div className="mt-2 relative overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <MemoImageFrame src={displaySrc!} ready={imgReady} />
                </div>
              )
            )}
          </div>

          {/* textarea（備考） */}
          {(!isPreview || hasMemo) && (
            <div className="relative pr-8 mt-6">
              <textarea
                ref={memoRef}
                data-scrollable="true"
                onScroll={onTextareaScroll}
                value={memo}
                rows={1}
                placeholder="備考を入力"
                onChange={(e) => setMemo(e.target.value)}
                onTouchMove={(e) => e.stopPropagation()}
                readOnly={isPreview}
                aria-readonly={isPreview}
                className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none ml-2 pb-1 touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch]"
              />

              {isIOS && showScrollHint && (
                <div className="pointer-events-none absolute bottom-3 right-1 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
                  <ChevronDown size={16} className="text-white" />
                </div>
              )}
              {isIOS && showScrollUpHint && (
                <div className="pointer-events-none absolute top-1 right-1 flex items-center justify-center w-7 h-7 rounded-full bg-black/50 animate-pulse">
                  <ChevronUp size={16} className="text-white" />
                </div>
              )}
            </div>
          )}

          {/* ▼▼ 参考URL ▼▼ */}
          {(!isPreview || hasReference) && (
            <div className="pb-2">
              <div className="mb-3 mt-5 flex items-center justify-between">
                <h3 className="font-medium">参考リンク</h3>
                {!isPreview && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addUrl}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 hover:border-blue-500"
                      aria-label="参考リンクを追加"
                      title="追加"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                )}
              </div>

              {!isPreview ? (
                <>
                  <RecoverableDndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                    onDragEnd={(e: DragEndEvent) => {
                      const { active, over } = e;
                      if (!over || active.id === over.id) return;
                      const oldIndex = urlIds.findIndex((id) => id === active.id);
                      const newIndex = urlIds.findIndex((id) => id === over.id);
                      if (oldIndex < 0 || newIndex < 0) return;
                      setUrlIds((prev) => arrayMove(prev, oldIndex, newIndex));
                      setReferenceUrls((prev) => arrayMove(prev, oldIndex, newIndex));
                      setReferenceLabels((prev) => arrayMove(prev, oldIndex, newIndex));
                    }}
                  >
                    <SortableContext items={urlIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {referenceUrls.map((u, idx) => (
                          <SortableUrlRow key={urlIds[idx] ?? `url_k_${idx}`} id={urlIds[idx] ?? `url_id_${idx}`}>
                            {({ attributes, listeners }) => (
                              <>
                                <button
                                  type="button"
                                  className="col-span-1 flex items-center justify-center pt-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                                  aria-label="行を並び替え"
                                  {...attributes}
                                  {...listeners}
                                >
                                  <GripVertical size={16} />
                                </button>

                                <div className="col-span-1 pt-1 text-sm text-gray-500 select-none text-center">
                                  {idx + 1}.
                                </div>

                                <div className="col-span-9 flex items-center gap-2 min-w-0">
                                  <input
                                    ref={(el) => { urlRefs.current[idx] = el; }}
                                    value={u}
                                    onChange={(e) => changeUrl(idx, e.target.value)}
                                    onKeyDown={(e) => onUrlKeyDown(e, idx)}
                                    placeholder="https://example.com/..."
                                    className="flex-1 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-md focus:outline-none focus:border-blue-500 min-w-0"
                                    inputMode="url"
                                    aria-invalid={errorsShown && !!urlErrors[idx]}
                                    aria-describedby={errorsShown && urlErrors[idx] ? `url-err-${idx}` : undefined}
                                  />
                                </div>

                                {referenceUrls.length >= 2 && (
                                  <button
                                    type="button"
                                    onClick={() => removeUrl(idx)}
                                    aria-label="URLを削除"
                                    className="col-span-1 flex items-center justify-center w-5 h-8 text-gray-700 hover:text-red-600"
                                  >
                                    <span aria-hidden className="text-lg leading-none">×</span>
                                  </button>
                                )}

                                {errorsShown && urlErrors[idx] && (
                                  <div className="col-span-12">
                                    <p id={`url-err-${idx}`} className="mt-1 text-xs text-red-500">
                                      {urlErrors[idx]}
                                    </p>
                                  </div>
                                )}
                              </>
                            )}
                          </SortableUrlRow>
                        ))}
                      </div>
                    </SortableContext>
                  </RecoverableDndContext>
                </>
              ) : (
                <ul className="list-disc list-inside text-md text-blue-500 marker:text-black">
                  {referenceUrls
                    .map((url, i) => ({ url: url.trim(), label: (referenceLabels[i] ?? '').trim() }))
                    .filter((p) => p.url !== '')
                    .map((p, i) => (
                      <li key={`pv_url_${i}`} className="mb-1 ml-2">
                        {/* ★ プレビュー時もリンククリック可能 */}
                        <a href={p.url} target="_blank" rel="noreferrer" className="underline break-all">
                          {p.url}
                        </a>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
          {/* ▲▲ 参考URLここまで ▲▲ */}

          {/* ▼▼ チェックリスト（必須ではない） ▼▼ */}
          {(!isPreview || hasChecklist) && (
            <div className="pt-2 pb-3 mt-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium">チェックリスト</h3>
                {!isPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = `cl_${Math.random().toString(16).slice(2)}`;
                      setChecklist((prev) => {
                        const next = [...prev, { id, text: '', done: false }];
                        return next;
                      });
                      setCheckIds((prev) => [...prev, id]);
                      setPendingCheckFocusIndex(checkIds.length);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 hover:border-blue-500"
                    aria-label="チェックリストを追加"
                    title="追加"
                  >
                    <Plus size={18} />
                  </button>
                )}
              </div>

              {!isPreview ? (
                <RecoverableDndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                  onDragEnd={(e: DragEndEvent) => {
                    const { active, over } = e;
                    if (!over || active.id === over.id) return;
                    const oldIndex = checkIds.findIndex((id) => id === active.id);
                    const newIndex = checkIds.findIndex((id) => id === over.id);
                    if (oldIndex < 0 || newIndex < 0) return;
                    setCheckIds((prev) => arrayMove(prev, oldIndex, newIndex));
                    setChecklist((prev) => arrayMove(prev, oldIndex, newIndex));
                  }}
                >
                  <SortableContext items={checkIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {checklist.map((item, idx) => (
                        <SortableUrlRow key={checkIds[idx] ?? item.id} id={checkIds[idx] ?? item.id}>
                          {({ attributes, listeners }) => (
                            <>
                              <button
                                type="button"
                                className="col-span-1 flex items-center justify-center pt-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                                aria-label="行を並び替え"
                                {...attributes}
                                {...listeners}
                              >
                                <GripVertical size={16} />
                              </button>

                              <div className="col-span-1 flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={!!item.done}
                                  onChange={(e) => {
                                    const val = e.currentTarget.checked;
                                    setChecklist((prev) =>
                                      prev.map((c, i) => (i === idx ? { ...c, done: val } : c)),
                                    );
                                  }}
                                  aria-label="完了"
                                  className="w-4 h-4"
                                />
                              </div>

                              <input
                                ref={(el) => { checkInputRefs.current[idx] = el; }}
                                value={item.text}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setChecklist((prev) =>
                                    prev.map((c, i) => (i === idx ? { ...c, text: val } : c)),
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (e.nativeEvent.isComposing) return;
                                  if (e.keyCode === 229) return;

                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    const id = `cl_${Math.random().toString(16).slice(2)}`;
                                    const newIndex = idx + 1;

                                    setChecklist((prev) => {
                                      const arr = [...prev];
                                      arr.splice(newIndex, 0, { id, text: '', done: false });
                                      return arr;
                                    });
                                    setCheckIds((prev) => {
                                      const arr = [...prev];
                                      arr.splice(newIndex, 0, id);
                                      return arr;
                                    });
                                    setPendingCheckFocusIndex(newIndex);
                                  }
                                }}
                                placeholder="項目を入力（Enterで下に追加）"
                                className="col-span-9 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-md focus:outline-none focus:border-blue-500"
                              />

                              <button
                                type="button"
                                onClick={() => {
                                  setChecklist((prev) => prev.filter((_, i) => i !== idx));
                                  setCheckIds((prev) => prev.filter((_, i) => i !== idx));
                                }}
                                aria-label="項目を削除"
                                className="col-span-1 flex items-center justify-center w-8 h-8 text-gray-700 hover:text-red-600"
                              >
                                <span aria-hidden className="text-lg leading-none">×</span>
                              </button>
                            </>
                          )}
                        </SortableUrlRow>
                      ))}
                    </div>
                  </SortableContext>
                </RecoverableDndContext>
              ) : (
                <ul className="space-y-2">
                  {checklist
                    .filter((c) => (c.text ?? '').trim() !== '')
                    .map((c) => {
                      const isSavingOne = !!savingById[c.id];
                      return (
                        <li key={`pv_cl_${c.id}`} className="flex items-center gap-3 text-md ml-1">
                          {/* ★ プレビュー時もチェック切替可能 */}
                          <input
                            type="checkbox"
                            className="scale-130 accent-blue-500 cursor-pointer"
                            checked={!!c.done}
                            disabled={isSavingOne}
                            onChange={(e) => {
                              const next = e.currentTarget.checked;
                              void handlePreviewToggleChecklist(c.id, next);
                            }}
                            aria-label={`${c.text} を${c.done ? '未完了にする' : '完了にする'}`}
                          />
                          <button
                            type="button"
                            className={`text-left break-words ${c.done ? 'line-through text-gray-400' : 'text-gray-800'} ${isSavingOne ? 'opacity-60' : 'hover:opacity-80'} transition`}
                            onClick={() => void handlePreviewToggleChecklist(c.id, !c.done)}
                            disabled={isSavingOne}
                            aria-disabled={isSavingOne}
                            title="クリックでチェックを切り替え"
                          >
                            {c.text}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          )}
          {/* ▲▲ チェックリストここまで ▲▲ */}
        </div>
      </div>
    </BaseModal>
    {imageZoomed && displaySrc && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/80 p-4"
        onClick={() => setImageZoomed(false)}
        role="dialog"
        aria-modal="true"
        aria-label="拡大画像"
      >
        <button
          type="button"
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-[1] flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-800"
          aria-label="拡大を閉じる"
          onClick={() => setImageZoomed(false)}
        >
          <X size={18} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displaySrc}
          alt="拡大画像"
          className="max-h-full max-w-full object-contain"
          onClick={(event) => event.stopPropagation()}
        />
      </div>,
      document.body
    )}
    </>
  );
}
