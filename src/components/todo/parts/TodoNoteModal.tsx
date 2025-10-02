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

// ▼▼ dnd-kit（参考URLの並び替え用） ▼▼
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
  recipe?: {
    ingredients?: Partial<Ingredient>[];
    steps?: string[];
  };
  timeStart?: string; // "HH:mm"
  timeEnd?: string;   // "HH:mm"
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
  return Array.isArray(v) && v.every((x) => x && typeof x.id === 'string');
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

// dnd のドラッグハンドル型（URL用）
type DragHandleRenderProps = {
  attributes: DraggableAttributes;
  listeners: ReturnType<typeof useSortable>['listeners'];
};

// 参考URL用の Sortable 行
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

  // 参考URL（移植先：ここで管理）
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [urlIds, setUrlIds] = useState<string[]>([]);
  const urlRefs = useRef<Array<HTMLInputElement | null>>([]);

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

  const hasContent = hasMemo || hasImage || hasRecipe || hasShopping || hasReference || (!!timeStart && !!timeEnd);
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
        setReferenceUrls(refs.length === 0 ? [''] : refs);
        setUrlIds((prev) => {
          const arr = [...prev];
          arr.length = 0;
          for (let i = 0; i < (refs.length === 0 ? 1 : refs.length); i++) {
            arr.push(`url_${i}_${Math.random().toString(16).slice(2)}`);
          }
          return [...arr];
        });

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
      setUrlIds(['url_init_' + Math.random().toString(16).slice(2)]);
    }
  }, [isPreview, referenceUrls.length]);

  // urlIds の長さを referenceUrls に同期
  useEffect(() => {
    setUrlIds((prev) => {
      if (prev.length === referenceUrls.length) return prev;
      const next = [...prev];
      while (next.length < referenceUrls.length) next.push(`url_${Math.random().toString(16).slice(2)}`);
      while (next.length > referenceUrls.length) next.pop();
      return next;
    });
  }, [referenceUrls]);

  // テキストエリアのリサイズ等
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

  // --- 参考URL：操作系（材料と同じ“動き”） ----------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
  );

  const addUrlAt = useCallback((index: number) => {
    setReferenceUrls((prev) => {
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
    setUrlIds((prev) => [...prev, `url_${Math.random().toString(16).slice(2)}`]);
    setTimeout(() => { urlRefs.current[referenceUrls.length]?.focus(); }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeUrl = (idx: number) => {
    setReferenceUrls((prev) => {
      if (prev.length <= 1) return ['']; // 最後の1件は空行に戻す
      return prev.filter((_, i) => i !== idx);
    });
    setUrlIds((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const changeUrl = (idx: number, val: string) => {
    setReferenceUrls((prev) => prev.map((u, i) => (i === idx ? val : u)));
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
        // 任意: トーストなどで result.messages[0] を通知してもOK
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

      // Firestore 更新 payload
      const payload: TodoUpdates = {
        memo,
        price: Number.isFinite(appliedPrice) && appliedPrice! > 0 ? appliedPrice : null,
        quantity: validQuantity,
        referenceUrls: referenceUrls.filter((u) => isString(u) && u.trim() !== ''), // ← TodoNoteModal の state を保存
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
            .map((i) => ({
              id: i.id,
              name: i.name.trim(),
              amount: typeof i.amount === 'number' ? i.amount : null,
              unit: i.unit || '適量',
            })),
          steps: recipe.steps.map((s) => s.trim()).filter((s) => s !== ''),
        };
      }

      if (category === '旅行') {
        (payload as { timeStart?: string | null }).timeStart = timeStart || null;
        (payload as { timeEnd?: string | null }).timeEnd = timeEnd || null;
      }

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
        <div className="px-2 pb-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">参考URL</h3>
            {!isPreview && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addUrl}
                  className="inline-flex items-center gap-1 pl-3 pr-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-blue-500 mr-[-10px] mt-2"
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

                            {/* 入力（入力した瞬間に保存対象に反映） */}
                            <input
                              ref={(el) => { urlRefs.current[idx] = el; }}
                              value={u}
                              onChange={(e) => changeUrl(idx, e.target.value)}
                              onKeyDown={(e) => onUrlKeyDown(e, idx)}
                              placeholder="https://example.com/..."
                              className="col-span-9 border-0 border-b border-gray-300 bg-transparent px-0 py-2 text-sm focus:outline-none focus:border-blue-500"
                              inputMode="url"
                            />

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
              {referenceUrls.filter((u) => u.trim() !== '').map((u, i) => (
                <li key={`pv_url_${i}`} className="mb-1">
                  <a href={u} target="_blank" rel="noreferrer" className="underline break-all">{u}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* ▲▲ 参考URLここまで ▲▲ */}

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
