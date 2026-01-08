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
import { ChevronDown, ChevronUp, Plus, GripVertical, X } from 'lucide-react';
import ShoppingDetailsEditor from '@/components/todo/parts/ShoppingDetailsEditor';
import { auth, db, storage } from '@/lib/firebase';
import { updateTodoInTask } from '@/lib/firebaseUtils';
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { useUnitPriceDifferenceAnimation } from '@/hooks/useUnitPriceDifferenceAnimation';
import BaseModal from '../../common/modals/BaseModal';
import NextImage from 'next/image';

// ▼▼ dnd-kit（参考URL・チェックリストの並び替え用） ▼▼
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
} from '@dnd-kit/core';
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

type Category = '料理' | '買い物' | '旅行';

type Ingredient = {
  id: string;
  name: string;
  amount: number | null;
  unit: string;
};

// 追加：チェックリスト項目
type ChecklistItem = { id: string; text: string; done: boolean };

type TaskDoc = {
  category?: Category;
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
  recipe?: {
    ingredients?: Partial<Ingredient>[];
    steps?: string[];
  };
  timeStart?: string; // "HH:mm"
  timeEnd?: string; // "HH:mm"
  // 追加：チェックリスト
  checklist?: ChecklistItem[];
};

function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter(isString) : [];
}
function isTodoArray(v: unknown): v is TodoDoc[] {
  return Array.isArray(v) && v.every((x) => x && typeof (x as TodoDoc).id === 'string');
}

/* ---------------- Constants ---------------- */

const MAX_TEXTAREA_VH = 50;

/* ---------------- Helpers (time validation) ---------------- */

const isHHmm = (s: string) => /^\d{1,2}:\d{2}$/.test(s);
const toMinutes = (s: string) => {
  if (!isHHmm(s)) return null;
  const [h, m] = s.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};
const validateTimeRange = (start: string, end: string): string => {
  if (!start && !end) return '';
  if (!isHHmm(start) || !isHHmm(end)) return '時間は HH:MM 形式で入力してください。';
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null) return '存在しない時刻です。';
  if (s >= e) return '開始は終了より前にしてください。';
  return '';
};

const clampToDayMinutes = (mins: number) => Math.max(0, Math.min(23 * 60 + 59, mins));
const addMinutesToHHmm = (hhmm: string, deltaMin: number): string => {
  const base = toMinutes(hhmm);
  if (base == null || !Number.isFinite(deltaMin)) return '';
  const next = clampToDayMinutes(base + Math.trunc(deltaMin));
  const h = Math.floor(next / 60);
  const m = next % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` as string;
};
const minutesBetweenHHmm = (start: string, end: string): number | null => {
  if (!isHHmm(start) || !isHHmm(end)) return null;
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null || e <= s) return null;
  return e - s;
};

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
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('g');
  const [compareMode, setCompareMode] = useState(false);
  const [comparePrice, setComparePrice] = useState('');
  const [compareQuantity, setCompareQuantity] = useState('');
  const [initialLoad, setInitialLoad] = useState(true);
  const [saveLabel, setSaveLabel] = useState('保存');
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);

  // ★ 編集/プレビュー
  const [isPreview, setIsPreview] = useState(false);
  const [modeInitialized, setModeInitialized] = useState(false);

  const [category, setCategory] = useState<Category | null>(null);

  // ▼▼ バリデーション制御 ▼▼
  const [errorsShown, setErrorsShown] = useState(false);
  const [urlErrors, setUrlErrors] = useState<string[]>([]);
  const [shoppingErrors, setShoppingErrors] = useState<{ price?: string; quantity?: string; unit?: string }>({});
  const [timeError, setTimeError] = useState<string>('');

  const compareQuantityRef = useRef<string>('');
  useEffect(() => { compareQuantityRef.current = compareQuantity; }, [compareQuantity]);

  // 旅行
  const [timeStart, setTimeStart] = useState<string>('');
  const [timeEnd, setTimeEnd] = useState<string>('');
  const [durationMin, setDurationMin] = useState<string>('');

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
  const displaySrc = previewUrl ?? imageUrl;
  const showMediaFrame = isOpen && !!displaySrc;

  const memoRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 内容の存在判定
  const hasMemo = useMemo(() => memo.trim().length > 0, [memo]);
  const hasImage = useMemo(() => imageUrl !== null, [imageUrl]);

  const hasShopping = useMemo(() => {
    if (category !== '買い物') return false;
    const p = Number.parseFloat(price);
    const q = Number.parseFloat(quantity);
    const validPrice = Number.isFinite(p) && p > 0;
    const validQty = Number.isFinite(q) && q > 0;
    return validPrice || validQty;
  }, [category, price, quantity]);

  const hasReference = useMemo(
    () => referenceUrls.some((u) => u.trim() !== ''),
    [referenceUrls]
  );

  const hasChecklist = useMemo(
    () => checklist.some((c) => (c.text ?? '').trim() !== ''),
    [checklist]
  );

  const isUncategorized = useMemo(() => {
    if (category == null) return true;
    const v = String(category).normalize('NFKC').trim();
    return v === '' || v === '未設定' || v === '未分類' || v === '未選択';
  }, [category]);

  const hasContent = useMemo(() => {
    return (
      hasMemo ||
      hasImage ||
      hasShopping ||
      hasReference ||
      (!!timeStart && !!timeEnd) ||
      (isUncategorized && hasChecklist)
    );
  }, [hasMemo, hasImage, hasShopping, hasReference, timeStart, timeEnd, isUncategorized, hasChecklist]);

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

  const numericPrice = Number.parseFloat(price);
  const numericQuantity = Number.parseFloat(quantity);
  const numericComparePrice = Number.parseFloat(comparePrice);
  const numericCompareQuantity = Number.parseFloat(compareQuantity);
  const isCompareQuantityMissing =
    !numericCompareQuantity || Number.isNaN(numericCompareQuantity) || numericCompareQuantity <= 0;
  const safeCompareQuantity = isCompareQuantityMissing ? 1 : numericCompareQuantity;
  const safeQuantity = numericQuantity > 0 ? numericQuantity : 1;
  const currentUnitPrice =
    numericPrice > 0 && safeQuantity > 0 ? numericPrice / safeQuantity : null;
  const compareUnitPrice =
    numericComparePrice > 0 ? numericComparePrice / safeCompareQuantity : null;
  const unitPriceDiff =
    compareUnitPrice !== null && currentUnitPrice !== null
      ? compareUnitPrice - currentUnitPrice
      : null;
  const totalDifference =
    unitPriceDiff !== null ? unitPriceDiff * safeCompareQuantity : null;

  const { animatedDifference, animationComplete: diffAnimationComplete } =
    useUnitPriceDifferenceAnimation(totalDifference);

  const previewDurationMin = useMemo(() => {
    const diff = minutesBetweenHHmm(timeStart, timeEnd);
    return diff != null ? diff : null;
  }, [timeStart, timeEnd]);

  // ★ プレビュー時の「買い物」表示（完全に静的：編集不可）
  const shoppingPreview = useMemo(() => {
    if (category !== '買い物') return null;

    const p = Number.parseFloat(price);
    const q = Number.parseFloat(quantity);

    const hasP = Number.isFinite(p) && p > 0;
    const hasQ = Number.isFinite(q) && q > 0;
    const unitTxt = (unit ?? '').trim() || 'g';

    const unitPrice =
      hasP && hasQ && q > 0 ? Math.round((p / q) * 100) / 100 : null;

    const cmpP = Number.parseFloat(comparePrice);
    const cmpQ = Number.parseFloat(compareQuantity);
    const hasCmpP = Number.isFinite(cmpP) && cmpP > 0;
    const hasCmpQ = Number.isFinite(cmpQ) && cmpQ > 0;

    const cmpUnitPrice =
      hasCmpP && hasCmpQ && cmpQ > 0 ? Math.round((cmpP / cmpQ) * 100) / 100 : null;

    const diff =
      unitPrice != null && cmpUnitPrice != null ? Math.round((cmpUnitPrice - unitPrice) * 100) / 100 : null;

    return (
      <div className="mt-4 ml-2 space-y-3">
        <h3 className="font-medium">買い物</h3>

        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-5">
            <div className="text-xs text-gray-500 mb-1">価格</div>
            <div className="border-b border-gray-200 pb-1 tabular-nums">
              {hasP ? `${p}` : '—'}
            </div>
          </div>
          <div className="col-span-5">
            <div className="text-xs text-gray-500 mb-1">数量</div>
            <div className="border-b border-gray-200 pb-1 tabular-nums">
              {hasQ ? `${q}` : '—'} {hasQ ? unitTxt : ''}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-xs text-gray-500 mb-1">単価</div>
            <div className="border-b border-gray-200 pb-1 tabular-nums text-right">
              {unitPrice != null ? `${unitPrice}` : '—'}
            </div>
          </div>
        </div>

        {(Number.parseFloat(comparePrice) > 0 || Number.parseFloat(compareQuantity) > 0) && (
          <div className="pt-2 border-t border-gray-100">
            <div className="text-xs text-gray-500 mb-2">比較</div>

            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <div className="text-xs text-gray-500 mb-1">比較価格</div>
                <div className="border-b border-gray-200 pb-1 tabular-nums">
                  {hasCmpP ? `${cmpP}` : '—'}
                </div>
              </div>
              <div className="col-span-5">
                <div className="text-xs text-gray-500 mb-1">比較数量</div>
                <div className="border-b border-gray-200 pb-1 tabular-nums">
                  {hasCmpQ ? `${cmpQ}` : '—'} {hasCmpQ ? unitTxt : ''}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-500 mb-1">比較単価</div>
                <div className="border-b border-gray-200 pb-1 tabular-nums text-right">
                  {cmpUnitPrice != null ? `${cmpUnitPrice}` : '—'}
                </div>
              </div>
            </div>

            {diff != null && (
              <p className="mt-2 text-sm text-gray-700">
                差額（単価）: <span className="tabular-nums">{diff}</span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  }, [category, price, quantity, unit, comparePrice, compareQuantity]);

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

  useEffect(() => {
    const parsed = Number.parseFloat(comparePrice);
    setSaveLabel(!Number.isNaN(parsed) && parsed > 0 ? '価格を更新する' : '保存');
  }, [comparePrice]);

  // --- 初期データの取得 ---
  useEffect(() => {
    const fetchTodoData = async () => {
      if (!taskId || !todoId) return;
      try {
        const tRef = doc(db, 'tasks', taskId);
        const tSnap = await getDoc(tRef);
        if (!tSnap.exists()) return;

        const taskData = tSnap.data() as TaskDoc;
        setCategory(taskData?.category ?? null);

        const todos = isTodoArray(taskData.todos) ? taskData.todos : [];
        const todo = todos.find((t) => t.id === todoId);
        if (!todo) return;

        // ★修正：Firestore の todo.text を優先してタイトルに反映
        setTodoTitle(todo.text ?? todoText);

        setMemo(todo.memo ?? '');
        setPrice(isNumber(todo.price) ? String(todo.price) : '');
        setQuantity(isNumber(todo.quantity) ? String(todo.quantity) : '');
        setUnit(todo.unit ?? 'g');

        if ((!compareQuantityRef.current || compareQuantityRef.current === '') && isNumber(todo.quantity)) {
          setCompareQuantity(String(todo.quantity));
        }

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
        setChecklist(safeChecklist);
        setCheckIds(safeChecklist.map((c) => c.id));

        const loadedStart = isString((todo as TodoDoc).timeStart) ? (todo as TodoDoc).timeStart! : '';
        const loadedEnd = isString((todo as TodoDoc).timeEnd) ? (todo as TodoDoc).timeEnd! : '';
        setTimeStart(loadedStart);
        setTimeEnd(loadedEnd);
        setTimeError('');
        const diffMin = minutesBetweenHHmm(loadedStart, loadedEnd);
        setDurationMin(diffMin != null ? String(diffMin) : '');
      } catch (e) {
        console.error('初期データの取得に失敗:', e);
      } finally {
        setInitialLoad(false);
        setTimeout(updateHints, 0);
      }
    };

    if (isOpen) {
      setInitialLoad(true);
      void fetchTodoData();
    }
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

  // チェックリスト（編集モード最低1行）
  useEffect(() => {
    if (!isPreview && checklist.length === 0) {
      const id = `cl_${Math.random().toString(16).slice(2)}`;
      setChecklist([{ id, text: '', done: false }]);
      setCheckIds([id]);
    }
  }, [isPreview, checklist.length]);

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
    if ((e.nativeEvent as any).isComposing) return;
    if ((e.nativeEvent as any).keyCode === 229) return;

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

    const shopErr: { price?: string; quantity?: string; unit?: string } = {};
    if (category === '買い物') {
      const p = Number.parseFloat(price);
      const q = Number.parseFloat(quantity);
      const hasP = Number.isFinite(p) && p > 0;
      const hasQ = Number.isFinite(q) && q > 0;

      if (hasP && !hasQ) shopErr.quantity = '数量を入力してください。';
      if (hasQ && !hasP && !(Number.parseFloat(comparePrice) > 0)) {
        shopErr.price = '価格を入力してください。';
      }
      if (hasQ && !unit.trim()) shopErr.unit = '単位を選択してください。';
    }

    const timeErr = category === '旅行' ? validateTimeRange(timeStart, timeEnd) : '';

    setUrlErrors(nextUrlErrors);
    setShoppingErrors(shopErr);
    setTimeError(timeErr);

    const hasUrlError = nextUrlErrors.some((e) => !!e);
    const hasShopError = Object.keys(shopErr).length > 0;
    const hasTimeError = !!timeErr;

    return !(hasUrlError || hasShopError || hasTimeError);
  }, [referenceUrls, category, price, quantity, unit, comparePrice, timeStart, timeEnd]);

  // 保存（編集時のみ使う想定）
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setErrorsShown(true);
    const okCommon = runValidation();
    if (!okCommon) return;

    setIsSaving(true);

    const nPrice = Number.parseFloat(price);
    const nQty = Number.parseFloat(quantity);
    const nCmpPrice = Number.parseFloat(comparePrice);
    const nCmpQty = Number.parseFloat(compareQuantity);

    const appliedPrice = nCmpPrice > 0 ? nCmpPrice : nPrice;
    const rawQuantity = nCmpPrice > 0 ? nCmpQty : nQty;
    const validQuantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : null;
    const appliedUnit = validQuantity ? unit : null;

    const safeCmpQty = nCmpQty > 0 ? nCmpQty : 1;
    const safeQty = nQty > 0 ? nQty : 1;
    const currentUnitPriceCalced =
      nPrice > 0 && safeQty > 0 ? nPrice / safeQty : null;
    const compareUnitPriceCalced =
      nCmpPrice > 0 ? nCmpPrice / safeCmpQty : null;
    const unitPriceDiffCalced =
      compareUnitPriceCalced !== null && currentUnitPriceCalced !== null
        ? compareUnitPriceCalced - currentUnitPriceCalced
        : null;
    const totalDifferenceCalced =
      unitPriceDiffCalced !== null ? unitPriceDiffCalced * safeCmpQty : null;

    try {
      // 画像アップロード
      let nextImage: string | null = imageUrl;
      if (!isImageRemoved && pendingUpload) {
        const ext = pendingUpload.mime === 'image/webp' ? 'webp' : 'jpg';
        const path = `task_todos/${taskId}/${todoId}/${Date.now()}.${ext}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, pendingUpload.blob, {
          contentType: pendingUpload.mime,
          customMetadata: { ownerUid: user.uid, taskId, todoId },
        });
        nextImage = await getDownloadURL(fileRef);
      }

      // URL/ラベルの整形（空URL行を除外）
      const pairs = referenceUrls.map((url, i) => ({ url, label: referenceLabels[i] ?? '' }));
      const filteredPairs = pairs.filter((p) => isString(p.url) && p.url.trim() !== '');
      const urlsForSave = filteredPairs.map((p) => p.url.trim());
      const labelsForSave = filteredPairs.map((p) => (p.label ?? '').trim());

      // Firestore 更新 payload
      const payload: TodoUpdates = {
        memo,
        price: Number.isFinite(appliedPrice) && appliedPrice! > 0 ? appliedPrice : null,
        quantity: validQuantity,
        referenceUrls: urlsForSave,
        referenceUrlLabels: labelsForSave,
      };

      (payload as TodoUpdates & { text?: string }).text = todoTitle.trim();

      if (appliedUnit) (payload as { unit?: string }).unit = appliedUnit;

      if (isImageRemoved) {
        (payload as { imageUrl?: string | null }).imageUrl = null;
      } else if (nextImage) {
        (payload as { imageUrl?: string | null }).imageUrl = nextImage;
      }

      if (category === '旅行') {
        (payload as { timeStart?: string | null }).timeStart = timeStart || null;
        (payload as { timeEnd?: string | null }).timeEnd = timeEnd || null;
      }

      (payload as { checklist?: ChecklistItem[] }).checklist = checklist
        .filter((c) => (c.text ?? '').trim() !== '')
        .map((c) => ({ id: c.id, text: c.text.trim(), done: !!c.done }));

      await updateTodoInTask(taskId, todoId, payload);

      // Storage クリーンアップ
      try {
        const urlsToDelete: string[] = [];
        if (!isImageRemoved && previousImageUrl && previousImageUrl !== nextImage) {
          urlsToDelete.push(previousImageUrl);
        }
        if (isImageRemoved && previousImageUrl) {
          urlsToDelete.push(previousImageUrl);
        }
        await Promise.all(
          urlsToDelete.map(async (url) => {
            try {
              const refFromUrl = storageRef(storage, url);
              await deleteObject(refFromUrl);
            } catch (e) {
              console.warn('Storage 画像削除に失敗:', url, e);
            }
          })
        );
        setPreviousImageUrl(isImageRemoved ? null : nextImage ?? null);
      } catch (e) {
        console.warn('Storage クリーンアップ処理で警告:', e);
      }

      if (totalDifferenceCalced !== null) {
        await addDoc(collection(db, 'savings'), {
          userId: user.uid,
          todoId,
          savedAt: serverTimestamp(),
          currentUnitPrice: currentUnitPriceCalced,
          compareUnitPrice: compareUnitPriceCalced,
          difference: Math.round(totalDifferenceCalced),
        });
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPendingUpload(null);
      setIsImageRemoved(false);
      setImageUrl(nextImage ?? null);

      setSaveComplete(true);
      setTimeout(() => {
        setIsSaving(false);
        setSaveComplete(false);
        onClose();
      }, 1500);
    } catch (error) {
      console.error('保存に失敗しました:', error);
      setIsSaving(false);
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
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving || isLoading}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
      saveLabel={saveLabel}
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
          {/* ヘッダー（閉じる + 編集/プレビュー切替は「非活性ではなく非表示で切替」） */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {isPreview ? (
                <h2 className="text-2xl font-bold text-gray-800 break-words">
                  {todoTitle.trim() ? todoTitle : '（未入力）'}
                </h2>
              ) : (
                <input
                  value={todoTitle}
                  onChange={(e) => setTodoTitle(e.target.value)}
                  placeholder="TODO名を入力"
                  className="w-full text-2xl font-bold text-gray-800 bg-transparent border-b border-gray-200 focus:outline-none focus:border-blue-500 pb-1"
                  aria-label="TODO名"
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              {isPreview ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsPreview(false);
                    setErrorsShown(false);
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-blue-500"
                  aria-label="編集に切り替える"
                >
                  編集
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsPreview(true);
                    setErrorsShown(false);
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-blue-500"
                  aria-label="プレビューに切り替える"
                >
                  プレビュー
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
              <div className="mt-2 relative rounded-lg border border-gray-200 overflow-hidden bg-white">
                <div className="w-full" style={{ aspectRatio: '4 / 3' }} />
                <div className="absolute inset-0">
                  <NextImage
                    src={displaySrc!}
                    alt="挿入画像プレビュー"
                    fill
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="object-contain transition-opacity duration-200"
                    style={{ opacity: imgReady ? 1 : 0 }}
                    priority={false}
                  />
                  {!imgReady && <div className="absolute inset-0 animate-pulse bg-gray-100" />}
                </div>
              </div>
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
                      className="inline-flex items-center gap-1 pl-3 pr-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-blue-500"
                    >
                      <Plus size={16} />
                      追加
                    </button>
                  </div>
                )}
              </div>

              {!isPreview ? (
                <>
                  <DndContext
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
                  </DndContext>
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

          {/* ▼▼ チェックリスト（カテゴリ未選択と料理のときだけ表示・必須ではない） ▼▼ */}
          {(isUncategorized || category === '料理') && (!isPreview || hasChecklist) && (
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
                    className="inline-flex items-center gap-1 pl-3 pr-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-blue-500"
                  >
                    <Plus size={16} />
                    追加
                  </button>
                )}
              </div>

              {!isPreview ? (
                <DndContext
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
                                  if ((e.nativeEvent as any).isComposing) return;
                                  if ((e.nativeEvent as any).keyCode === 229) return;

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

                              {checklist.length >= 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setChecklist((prev) => {
                                      if (prev.length <= 1) return [{ ...prev[0], text: '', done: false }];
                                      return prev.filter((_, i) => i !== idx);
                                    });
                                    setCheckIds((prev) => {
                                      if (prev.length <= 1) return prev;
                                      return prev.filter((_, i) => i !== idx);
                                    });
                                  }}
                                  aria-label="項目を削除"
                                  className="col-span-1 flex items-center justify-center w-8 h-8 text-gray-700 hover:text-red-600"
                                >
                                  <span aria-hidden className="text-lg leading-none">×</span>
                                </button>
                              )}
                            </>
                          )}
                        </SortableUrlRow>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
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

          {/* 旅行カテゴリ */}
          {category === '旅行' && (
            <div className="mt-4 ml-2">
              <h3 className="font-medium">時間帯</h3>
              <div className="flex items-center gap-2 mt-1">
                <div className="relative">
                  {isPreview ? (
                    <span className="inline-block min-w-[5.5ch] border-b border-gray-300 pb-1 tabular-nums text-center">
                      {timeStart || '— —'}
                    </span>
                  ) : (
                    <input
                      type="time"
                      value={timeStart}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTimeStart(v);
                        const n = Number.parseInt(durationMin, 10);
                        if (Number.isFinite(n) && n > 0) {
                          const autoEnd = addMinutesToHHmm(v, n);
                          setTimeEnd(autoEnd);
                          const err = validateTimeRange(v, autoEnd);
                          setTimeError(err);
                        } else {
                          setTimeError(validateTimeRange(v, timeEnd));
                        }
                        const diff2 = minutesBetweenHHmm(v, timeEnd);
                        if (diff2 != null) setDurationMin(String(diff2));
                      }}
                      className="border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent pb-1 tabular-nums text-center"
                      aria-label="開始時刻"
                    />
                  )}
                </div>

                <span className="text-gray-500">~</span>

                <div className="relative">
                  {isPreview ? (
                    <>
                      <span className="inline-block min-w-[5.5ch] border-b border-gray-300 pb-1 tabular-nums text-center">
                        {timeEnd || '— —'}
                      </span>
                      {previewDurationMin !== null && !(errorsShown && timeError) && (
                        <span className="ml-2 text-gray-700">（所要時間：{previewDurationMin}分）</span>
                      )}
                    </>
                  ) : (
                    <input
                      type="time"
                      value={timeEnd}
                      onChange={(e) => {
                        const v = e.target.value;
                        setTimeEnd(v);
                        setTimeError(validateTimeRange(timeStart, v));
                        const diff = minutesBetweenHHmm(timeStart, v);
                        if (diff != null) setDurationMin(String(diff));
                      }}
                      className="border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent pb-1 tabular-nums text-center"
                      aria-label="終了時刻"
                    />
                  )}
                </div>

                {!isPreview && (
                  <div className="flex items-center gap-1 ml-2">
                    <span className="text-gray-500 text-sm">所要</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={durationMin}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, '');
                        setDurationMin(v);
                        const n = Number.parseInt(v, 10);
                        if (isHHmm(timeStart) && Number.isFinite(n) && n > 0) {
                          const autoEnd = addMinutesToHHmm(timeStart, n);
                          setTimeEnd(autoEnd);
                          setTimeError(validateTimeRange(timeStart, autoEnd));
                        } else {
                          setTimeError(validateTimeRange(timeStart, timeEnd));
                        }
                      }}
                      placeholder="分"
                      className="w-20 border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent pb-1 text-right"
                      aria-label="所要時間（分）"
                    />
                    <span className="text-gray-500 text-sm">分</span>
                  </div>
                )}
              </div>
              {errorsShown && timeError && <p className="text-xs text-red-500 mt-1">{timeError}</p>}
            </div>
          )}

          {/* 買い物カテゴリ */}
          {category === '買い物' && (
            <>
              {isPreview ? (
                // ★重要：プレビュー時は ShoppingDetailsEditor を使わず、完全に静的表示（価格/数量編集不可）
                shoppingPreview
              ) : (
                <>
                  <ShoppingDetailsEditor
                    price={price}
                    quantity={quantity}
                    unit={unit}
                    compareMode={compareMode}
                    comparePrice={comparePrice}
                    compareQuantity={compareQuantity}
                    onChangePrice={setPrice}
                    onChangeQuantity={setQuantity}
                    onChangeUnit={setUnit}
                    onToggleCompareMode={(next) => setCompareMode(next)}
                    onChangeComparePrice={setComparePrice}
                    onChangeCompareQuantity={setCompareQuantity}
                    animatedDifference={animatedDifference}
                    animationComplete={diffAnimationComplete}
                    isPreview={false}
                    onRequestEditMode={() => setIsPreview(false)}
                  />
                  {errorsShown && (shoppingErrors.price || shoppingErrors.quantity || shoppingErrors.unit) && (
                    <ul className="mt-2 text-xs text-red-500 list-disc list-inside">
                      {shoppingErrors.price && <li>{shoppingErrors.price}</li>}
                      {shoppingErrors.quantity && <li>{shoppingErrors.quantity}</li>}
                      {shoppingErrors.unit && <li>{shoppingErrors.unit}</li>}
                    </ul>
                  )}
                </>
              )}
            </>
          )}

          {/* ✅ 料理カテゴリの RecipeEditor は一旦表示も呼び出しも撤去 */}
        </div>
      </div>
    </BaseModal>
  );
}
