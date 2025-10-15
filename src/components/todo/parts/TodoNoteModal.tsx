'use client';

export const dynamic = 'force-dynamic';

import {
  useEffect,
  useState,
  useRef,
  useLayoutEffect,
  useCallback,
  useMemo,
} from 'react';
import { ChevronDown, ChevronUp, Eye, Pencil, Plus, GripVertical } from 'lucide-react';
import RecipeEditor, {
  type Recipe,
  type RecipeEditorHandle,
} from '@/components/todo/parts/RecipeEditor';
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
  timeEnd?: string;   // "HH:mm"
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
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    };
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

  const width = 'naturalWidth' in bitmapOrImg ? bitmapOrImg.naturalWidth : (bitmapOrImg as ImageBitmap).width;
  const height = 'naturalHeight' in bitmapOrImg ? bitmapOrImg.naturalHeight : (bitmapOrImg as ImageBitmap).height;

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

  if (!webpBlob && !jpegBlob) return { blob: file, mime: 'image/jpeg' };
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
  const recipeEditorRef = useRef<RecipeEditorHandle>(null);
  const isIOS =
    typeof navigator !== 'undefined' &&
    /iP(hone|od|ad)|Macintosh;.*Mobile/.test(navigator.userAgent);

  const [mounted, setMounted] = useState(false);
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
  const [isPreview, setIsPreview] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);

  const compareQuantityRef = useRef<string>('');
  useEffect(() => { compareQuantityRef.current = compareQuantity; }, [compareQuantity]);

  // 旅行
  const [timeStart, setTimeStart] = useState<string>('');
  const [timeEnd, setTimeEnd] = useState<string>('');
  const [timeError, setTimeError] = useState<string>('');
  const [durationMin, setDurationMin] = useState<string>('');

  // レシピ（※ referenceUrls はここでは持たない）
  const [recipe, setRecipe] = useState<Recipe>({ ingredients: [], steps: [] });

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

  // ラベルのインライン編集 index
  const [editingLabelIndex, setEditingLabelIndex] = useState<number | null>(null);

  // チェックリスト（input）
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checkIds, setCheckIds] = useState<string[]>([]);
  const checkInputRefs = useRef<Array<HTMLInputElement | null>>([]);

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

  const hasRecipe = useMemo(() => {
    if (category !== '料理') return false;
    const ings = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];
    const hasAnyIngredient = ings.some((i) => (i?.name ?? '').trim() !== '');
    const hasAnyStep = steps.some((s) => (s ?? '').trim() !== '');
    return hasAnyIngredient || hasAnyStep;
  }, [category, recipe]);

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

  const hasContent =
    hasMemo ||
    hasImage ||
    hasRecipe ||
    hasShopping ||
    hasReference ||
    (!!timeStart && !!timeEnd) ||
    hasChecklist;

  const showMemo = useMemo(() => !isPreview || hasMemo, [isPreview, hasMemo]);

  const shallowEqualRecipe = useCallback((a: Recipe, b: Recipe) => {
    if (a === b) return true;
    if (a.ingredients.length !== b.ingredients.length) return false;
    for (let i = 0; i < a.ingredients.length; i++) {
      const x = a.ingredients[i];
      const y = b.ingredients[i];
      if (!x || !y) return false;
      if (x.id !== y.id || x.name !== y.name || x.unit !== y.unit || x.amount !== y.amount)
        return false;
    }
    if (a.steps.length !== b.steps.length) return false;
    for (let i = 0; i < a.steps.length; i++) if (a.steps[i] !== b.steps[i]) return false;
    return true;
  }, []);

  const handleRecipeChange = useCallback(
    (next: Recipe) => {
      setRecipe((prev) => (shallowEqualRecipe(prev, next) ? prev : next));
    },
    [shallowEqualRecipe]
  );

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

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const parsed = Number.parseFloat(comparePrice);
    setSaveLabel(!Number.isNaN(parsed) && parsed > 0 ? '価格を更新する' : '保存');
  }, [comparePrice]);

  // --- 初期データの取得
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

        setMemo(todo.memo ?? '');
        setPrice(isNumber(todo.price) ? String(todo.price) : '');
        setQuantity(isNumber(todo.quantity) ? String(todo.quantity) : '');
        setUnit(todo.unit ?? 'g');

        if ((!compareQuantityRef.current || compareQuantityRef.current === '') && isNumber(todo.quantity)) {
          setCompareQuantity(String(todo.quantity));
        }

        const existing = todo.recipe;
        if (existing) {
          const safeIngredients: Ingredient[] = Array.isArray(existing.ingredients)
            ? existing.ingredients.map((ing, idx) => ({
              id: isString(ing?.id) ? ing!.id : `ing_${idx}`,
              name: isString(ing?.name) ? ing!.name : '',
              amount: isNumber(ing?.amount) ? ing!.amount : null,
              unit: isString(ing?.unit) ? ing!.unit : '適量',
            }))
            : [];
          setRecipe({
            ingredients: safeIngredients,
            steps: Array.isArray(existing.steps) ? existing.steps.filter(isString) : [],
          });
        } else {
          setRecipe({
            ingredients: [{ id: 'ing_0', name: '', amount: null, unit: '適量' }],
            steps: [''],
          });
        }

        const existingImageUrl = isString(todo.imageUrl) ? todo.imageUrl : null;
        setImageUrl(existingImageUrl);
        setPreviousImageUrl(existingImageUrl);
        setPendingUpload(null);
        setPreviewUrl(null);
        setIsImageRemoved(false);

        // 参考URL（移植先）をロード
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

        // チェックリスト初期化（最低1行保証）
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

        // 旅行
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
    fetchTodoData();
  }, [taskId, todoId, updateHints]);

  // 参考URL：編集モードでは最低1行を保証
  useEffect(() => {
    if (!isPreview && referenceUrls.length === 0) {
      setReferenceUrls(['']);
      setReferenceLabels(['']);
      setUrlIds(['url_init_' + Math.random().toString(16).slice(2)]);
    }
  }, [isPreview, referenceUrls.length]);

  // urlIds の長さを referenceUrls に同期 + ラベル配列の長さ同期
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

  // ▼ 追加：チェックリスト（編集モードでは最低1行を常に保証）
  useEffect(() => {
    if (!isPreview && checklist.length === 0) {
      const id = `cl_${Math.random().toString(16).slice(2)}`;
      setChecklist([{ id, text: '', done: false }]);
      setCheckIds([id]);
    }
  }, [isPreview, checklist.length]);

  // ▼ 追加：checkIds の長さを checklist に同期（URL と同様）
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

  // 画像選択
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
      } catch { }
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
    setReferenceUrls((prev) => {
      const arr = [...prev];
      arr.splice(index + 1, 0, '');
      return arr;
    });
    setReferenceLabels((prev) => {
      const arr = [...prev];
      arr.splice(index + 1, 0, '');
      return arr;
    });
    setUrlIds((prev) => {
      const arr = [...prev];
      arr.splice(index + 1, 0, `url_${Math.random().toString(16).slice(2)}`);
      return arr;
    });
    setTimeout(() => { urlRefs.current[index + 1]?.focus(); }, 0);
  }, []);

  const addUrl = useCallback(() => {
    setReferenceUrls((prev) => [...prev, '']);
    setReferenceLabels((prev) => [...prev, '']);
    setUrlIds((prev) => [...prev, `url_${Math.random().toString(16).slice(2)}`]);
    setTimeout(() => { urlRefs.current[referenceUrls.length]?.focus(); }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setReferenceUrls((prev) => prev.map((u, i) => (i === idx ? val : u)));
    setReferenceLabels((prev) => {
      const next = [...prev];
      if ((next[idx] ?? '').trim() === '') {
        next[idx] = suggestLabelFromUrl(val);
      }
      return next;
    });
  };

  const onUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    addUrlAt(idx);
  };
  // ---------------------------------------------------------

  // 保存
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    if (category === '料理') {
      const result = recipeEditorRef.current?.validateAndShowErrors();
      if (!result || result.hasErrors) {
        return; // ★ 保存中断
      }
    }

    setIsSaving(true);

    const committedIngredients = recipeEditorRef.current?.commitAllAmounts();

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

    if (category === '旅行') {
      const err = validateTimeRange(timeStart, timeEnd);
      if (err) {
        setTimeError(err);
        setIsSaving(false);
        return;
      }
    }

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
        referenceUrls: urlsForSave,           // URL
        referenceUrlLabels: labelsForSave,    // ラベル
      };

      if (appliedUnit) (payload as { unit?: string }).unit = appliedUnit;

      if (isImageRemoved) {
        (payload as { imageUrl?: string | null }).imageUrl = null;
      } else if (nextImage) {
        (payload as { imageUrl?: string | null }).imageUrl = nextImage;
      }

      if (category === '料理') {
        const finalIngredients = committedIngredients ?? recipe.ingredients;
        (payload as { recipe?: Recipe }).recipe = {
          ingredients: finalIngredients
            .filter((i) => i.name.trim() !== '')
            .map((i) => ([
              i.id,
              i.name.trim(),
              typeof i.amount === 'number' ? i.amount : null,
              i.unit || '適量',
            ])).map(([id, name, amount, unit]) => ({ id: id as string, name: name as string, amount: amount as number | null, unit: unit as string })),
          steps: recipe.steps.map((s) => s.trim()).filter((s) => s !== ''),
        };
      }

      if (category === '旅行') {
        (payload as { timeStart?: string | null }).timeStart = timeStart || null;
        (payload as { timeEnd?: string | null }).timeEnd = timeEnd || null;
      }

      // ▼▼ チェックリストを保存（空行は除外） ▼▼
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

  const previewInitRef = useRef(false);

  useEffect(() => {
    if (!isOpen || initialLoad || previewInitRef.current) return;
    if (hasMemo || hasContent) {
      setIsPreview(true);
    } else {
      setIsPreview(false);
    }
    previewInitRef.current = true;
  }, [isOpen, initialLoad, hasMemo, hasContent]);

  useEffect(() => {
    if (!isOpen) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPendingUpload(null);
      setIsImageRemoved(false);
      previewInitRef.current = false;
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
   *  チェックリスト保存系
   * ======================= */

  // 空行を除外しつつ整形
  const normalizeChecklistForSave = useCallback((list: ChecklistItem[]): ChecklistItem[] => {
    return list
      .filter((c) => (c.text ?? '').trim() !== '')
      .map((c) => ({ id: c.id, text: c.text.trim(), done: !!c.done }));
  }, []);

  // Firestoreへ保存（共通）
  const saveChecklistToFirestore = useCallback(
    async (listForState: ChecklistItem[]) => {
      try {
        const payload: TodoUpdates = {
          checklist: normalizeChecklistForSave(listForState),
        } as { checklist: ChecklistItem[] };
        await updateTodoInTask(taskId, todoId, payload);
      } catch (e) {
        throw e;
      }
    },
    [normalizeChecklistForSave, taskId, todoId]
  );

  // プレビューでのトグル（楽観的更新 → 保存 → 失敗時ロールバック）
  const handlePreviewToggleChecklist = useCallback(
    async (itemId: string, nextDone: boolean) => {
      // 対象インデックス
      const idx = checklist.findIndex((c) => c.id === itemId);
      if (idx < 0) return;

      // 楽観的更新
      const prevList = checklist;
      const nextList = prevList.map((c, i) => (i === idx ? { ...c, done: nextDone } : c));
      setChecklist(nextList);
      setSavingById((m) => ({ ...m, [itemId]: true }));

      try {
        await saveChecklistToFirestore(nextList);
      } catch (e) {
        console.error('チェック更新の保存に失敗:', e);
        // ロールバック
        setChecklist(prevList);
      } finally {
        // 個別インジケータ解除
        setSavingById((m) => {
          const next = { ...m };
          delete next[itemId];
          return next;
        });
      }
    },
    [checklist, saveChecklistToFirestore]
  );

  if (!mounted || initialLoad) return null;

  const showPreviewToggle = hasContent;

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      onSaveClick={handleSave}
      saveLabel={saveLabel}
      hideActions={false}
    >
      {/* ヘッダー */}
      <div className="flex items-start justify-between ml-2 mr-1">
        <h1 className="text-2xl font-bold text-gray-800 mr-3 break-words">{todoText}</h1>
        {showPreviewToggle && (
          <button
            type="button"
            onClick={() => setIsPreview((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 active:scale-[0.98] transition flex-shrink-0"
            aria-pressed={isPreview}
            aria-label={isPreview ? '編集モードに切り替え' : 'プレビューモードに切り替え'}
            title={isPreview ? '編集モードに切り替え' : 'プレビューモードに切り替え'}
          >
            {isPreview ? (<><Pencil size={16} /><span>編集</span></>) : (<><Eye size={16} /><span>プレビュー</span></>)}
          </button>
        )}
      </div>

      {/* 画像挿入UI */}
      <div className="mb-3 ml-2">
        {!isPreview && (
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center px-3 py-1.5 text-sm rounded-full border border-gray-300 hover:bg-gray-50 cursor-pointer">
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
      {showMemo && (
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

      {/* ▼▼ 参考URL（画像選択の直下：編集モードは1件の空行を常に表示） ▼▼ */}
      {(!isPreview || hasReference) && (
        <div className="pb-2">
          <div className="mb-3 flex items-center justify-between">
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
                            {/* ドラッグハンドル */}
                            <button
                              type="button"
                              className="col-span-1 flex items-center justify-center pt-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                              aria-label="行を並び替え"
                              {...attributes}
                              {...listeners}
                            >
                              <GripVertical size={16} />
                            </button>

                            {/* 行番号 */}
                            <div className="col-span-1 pt-1 text-sm text-gray-500 select-none text-center">
                              {idx + 1}.
                            </div>

                            {/* 入力（URL）+ ラベルUI（ピル/インライン編集） */}
                            <div className="col-span-9 flex items-center gap-2 min-w-0">
                              {/* favicon */}
                              {u.trim() !== '' && (
                                <img
                                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(extractHostname(u))}&sz=32`}
                                  alt=""
                                  className="w-4 h-4 shrink-0 opacity-80"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                                />
                              )}

                              {/* URL input */}
                              <input
                                ref={(el) => { urlRefs.current[idx] = el; }}
                                value={u}
                                onChange={(e) => changeUrl(idx, e.target.value)}
                                onKeyDown={(e) => onUrlKeyDown(e, idx)}
                                placeholder="https://example.com/..."
                                className="flex-1 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:outline-none focus:border-blue-500 min-w-0"
                                inputMode="url"
                              />

                              {/* ラベル表示 or 編集 */}
                              {editingLabelIndex === idx ? (
                                <input
                                  autoFocus
                                  value={referenceLabels[idx] ?? ''}
                                  onChange={(e) => setReferenceLabels((prev) => prev.map((t, i) => (i === idx ? e.target.value : t)))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      setEditingLabelIndex(null);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      setEditingLabelIndex(null);
                                    }
                                  }}
                                  onBlur={() => setEditingLabelIndex(null)}
                                  placeholder="表示ラベル（任意）"
                                  className="w-36 border border-gray-300 rounded-full px-3 py-1 text-xs focus:outline-none focus:border-blue-500"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingLabelIndex(idx)}
                                  className={`max-w-[10rem] truncate rounded-full px-2 py-1 text-xs border ${
                                    (referenceLabels[idx] ?? '').trim() === ''
                                      ? 'border-dashed text-gray-400'
                                      : 'border-gray-300 text-gray-700'
                                  } hover:bg-gray-50`}
                                  title="表示ラベルを編集"
                                  aria-label="表示ラベルを編集"
                                >
                                  {(referenceLabels[idx] ?? '').trim() || 'ラベル（任意）'}
                                </button>
                              )}
                            </div>

                            {/* 削除（×）：2件以上のとき表示。最後の1件は空行に戻す */}
                            {referenceUrls.length >= 2 && (
                              <button
                                type="button"
                                onClick={() => removeUrl(idx)}
                                aria-label="URLを削除"
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
            </>
          ) : (
            // プレビュー（URLが1件以上ある場合のみ）
            <ul className="list-disc list-inside text-sm text-blue-500">
              {referenceUrls
                .map((url, i) => ({ url: url.trim(), label: (referenceLabels[i] ?? '').trim() }))
                .filter((p) => p.url !== '')
                .map((p, i) => (
                  <li key={`pv_url_${i}`} className="mb-1">
                    <a href={p.url} target="_blank" rel="noreferrer" className="underline break-all">
                      {p.label || p.url}
                    </a>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {/* ▲▲ 参考URLここまで ▲▲ */}

      {/* ▼▼ チェックリスト ▼▼ */}
      {(!isPreview || hasChecklist) && (
        <div className=" pt-2 pb-3 mt-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">チェックリスト</h3>
            {!isPreview && (
              <button
                type="button"
                onClick={() => {
                  const id = `cl_${Math.random().toString(16).slice(2)}`;
                  setChecklist((prev) => [...prev, { id, text: '', done: false }]);
                  setCheckIds((prev) => [...prev, id]);
                  setTimeout(() => {
                    const idx = checkIds.length; // 追加行のインデックス
                    const el = checkInputRefs.current[idx];
                    el?.focus();
                  }, 0);
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
                          {/* 並べ替えハンドル */}
                          <button
                            type="button"
                            className="col-span-1 flex items-center justify-center pt-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
                            aria-label="行を並び替え"
                            {...attributes}
                            {...listeners}
                          >
                            <GripVertical size={16} />
                          </button>

                          {/* チェックボックス */}
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

                          {/* 入力（input：Enterで下に追加） */}
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
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                const id = `cl_${Math.random().toString(16).slice(2)}`;
                                setChecklist((prev) => {
                                  const arr = [...prev];
                                  arr.splice(idx + 1, 0, { id, text: '', done: false });
                                  return arr;
                                });
                                setCheckIds((prev) => {
                                  const arr = [...prev];
                                  arr.splice(idx + 1, 0, id);
                                  return arr;
                                });
                                setTimeout(() => checkInputRefs.current[idx + 1]?.focus(), 0);
                              }
                            }}
                            placeholder="項目を入力（Enterで下に追加）"
                            className="col-span-9 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:outline-none focus:border-blue-500"
                          />

                          {/* 削除 */}
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
            // プレビュー（チェック可能 & 即DB保存）
            <ul className="space-y-2">
              {checklist
                .filter((c) => (c.text ?? '').trim() !== '')
                .map((c) => {
                  const isSaving = !!savingById[c.id];
                  return (
                    <li key={`pv_cl_${c.id}`} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={!!c.done}
                        disabled={isSaving}
                        onChange={(e) => {
                          const next = e.currentTarget.checked;
                          void handlePreviewToggleChecklist(c.id, next);
                        }}
                        aria-label={`${c.text} を${c.done ? '未完了にする' : '完了にする'}`}
                      />
                      <button
                        type="button"
                        className={`text-left break-words ${c.done ? 'line-through text-gray-400' : 'text-gray-800'} ${isSaving ? 'opacity-60' : 'hover:opacity-80'} transition`}
                        onClick={() => void handlePreviewToggleChecklist(c.id, !c.done)}
                        disabled={isSaving}
                        aria-disabled={isSaving}
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
            {/* 開始 */}
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
                      setTimeError(validateTimeRange(v, autoEnd));
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

            {/* 終了 */}
            <div className="relative">
              {isPreview ? (
                <>
                  <span className="inline-block min-w-[5.5ch] border-b border-gray-300 pb-1 tabular-nums text-center">
                    {timeEnd || '— —'}
                  </span>
                  {previewDurationMin !== null && !timeError && (
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

            {/* 所要（分） */}
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
          {timeError && <p className="text-xs text-red-500 mt-1">{timeError}</p>}
        </div>
      )}

      {/* 買い物カテゴリ */}
      {category === '買い物' && (
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
          isPreview={isPreview}
          onRequestEditMode={() => setIsPreview(false)}
        />
      )}

      {/* 料理カテゴリ */}
      {category === '料理' && (
        <RecipeEditor
          ref={recipeEditorRef}
          headerNote=""
          value={recipe}
          onChange={handleRecipeChange}
          isPreview={isPreview}
        />
      )}
    </BaseModal>
  );
}
