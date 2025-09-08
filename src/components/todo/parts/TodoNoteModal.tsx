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
import { ChevronDown, ChevronUp, Eye, Pencil, Plus } from 'lucide-react';
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

/* ---------------- Types & guards ---------------- */

// ★ 旅行を追加
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

// ★ TodoDocにも時間帯を追加（読み込みのため）
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

// 表示上限: 画面高の 50%（vh基準）
const MAX_TEXTAREA_VH = 50;

/* ---------------- Helpers (time validation) ---------------- */

// ★ 旅行時の時間帯入力検証
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

// ★ 追加: HH:mm に分を加算して HH:mm に戻す（24時超過は 23:59 にクランプ）
const clampToDayMinutes = (mins: number) => {
  return Math.max(0, Math.min(23 * 60 + 59, mins));
};
const addMinutesToHHmm = (hhmm: string, deltaMin: number): string => {
  const base = toMinutes(hhmm);
  if (base == null || !Number.isFinite(deltaMin)) return '';
  const next = clampToDayMinutes(base + Math.trunc(deltaMin));
  const h = Math.floor(next / 60);
  const m = next % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ★ 追加: HH:mm 同士の差分（分）を返す。無効なら null
const minutesBetweenHHmm = (start: string, end: string): number | null => {
  if (!isHHmm(start) || !isHHmm(end)) return null;
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null || e == null || e <= s) return null;
  return e - s;
};

/* ---------------- Image compression ---------------- */

/**
 * クライアント側で画像を圧縮して Blob を返す。
 * - 最大辺 1600px に収まるよう等比縮小
 * - WebP(0.7) と JPEG(0.7) を生成して小さい方を採用
 * - もともと十分小さい場合は再圧縮スキップ
 */
async function compressImage(
  file: File,
  opts: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<{ blob: Blob; mime: 'image/webp' | 'image/jpeg' }> {
  const maxWidth = opts.maxWidth ?? 1600;
  const maxHeight = opts.maxHeight ?? 1600;
  const quality = opts.quality ?? 0.7;

  // 200KB 未満はそのまま使う（品質劣化・再圧縮コストを避ける）
  if (file.size < 200 * 1024) {
    return {
      blob: file,
      mime: file.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
    };
  }

  // 画像読み込み（ImageBitmap がだめなら <img> フォールバック）
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

  // サイズ取得（HTMLImageElement / ImageBitmap 両対応）
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

// ★ updateTodoInTask の第三引数の型をそのまま利用（payload 赤線の根対策）
type TodoUpdates = Parameters<typeof updateTodoInTask>[2];

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

  // ★ compareQuantity の現在値をエフェクト外で参照するための Ref（依存配列回避）
  const compareQuantityRef = useRef<string>('');
  useEffect(() => {
    compareQuantityRef.current = compareQuantity;
  }, [compareQuantity]);

  // ★ 旅行時間帯の状態とエラー
  const [timeStart, setTimeStart] = useState<string>('');
  const [timeEnd, setTimeEnd] = useState<string>('');
  const [timeError, setTimeError] = useState<string>('');
  // ★ 追加: 所要時間（分）— 編集時のみ使用／DB保存対象外
  const [durationMin, setDurationMin] = useState<string>(''); // ← 新規

  const [recipe, setRecipe] = useState<Recipe>({ ingredients: [], steps: [] });

  // 保存済みURL（Firestore側の値）
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // 差分削除用：直前に保存されていたURL
  const [previousImageUrl, setPreviousImageUrl] = useState<string | null>(null);
  // 選択後～保存前までの状態
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isImageRemoved, setIsImageRemoved] = useState(false);

  // 参考URL
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [newRefUrl, setNewRefUrl] = useState('');

  // フェードイン用
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

  const hasContent = hasMemo || hasImage || hasRecipe || hasShopping || referenceUrls.length > 0 || (!!timeStart && !!timeEnd);
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
    for (let i = 0; i < a.steps.length; i++) {
      if (a.steps[i] !== b.steps[i]) return false;
    }
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

  // 初期データの取得
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

        // ★ 修正: compareQuantity の初期反映は Ref を使って依存配列を汚さない
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

        setReferenceUrls(asStringArray(todo.referenceUrls));

        // ★ 旅行の時間帯をロード
        const loadedStart = isString((todo as TodoDoc).timeStart) ? (todo as TodoDoc).timeStart! : '';
        const loadedEnd = isString((todo as TodoDoc).timeEnd) ? (todo as TodoDoc).timeEnd! : '';
        setTimeStart(loadedStart);
        setTimeEnd(loadedEnd);
        setTimeError('');

        // ★ 追加: 再表示時に開始・終了の差分（分）を所要に表示（DB保存なし）
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
    // ★ compareQuantity を依存に入れず、Ref 経由で参照することで再フェッチループを回避
  }, [taskId, todoId, updateHints]);

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

  // 画像選択→圧縮（アップロードは保存時）
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

      // 未アップロードとして保持
      setPendingUpload({ blob, mime });

      // プレビューURLを作成（前回があれば解放）
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const localUrl = URL.createObjectURL(blob);
      setPreviewUrl(localUrl);

      // 新規選択なので削除予約は解除
      setIsImageRemoved(false);
    } catch (err) {
      console.error('画像の読み込み/圧縮に失敗しました:', err);
    } finally {
      setIsUploadingImage(false);
      try {
        if (fileInputRef.current) fileInputRef.current.value = '';
        else inputEl.value = '';
      } catch {
        // noop
      }
    }
  };

  const handleClearImage = () => {
    // 即時に Storage を削除せず、保存時にクリーンアップ（整合性のため）
    setIsImageRemoved(true);
    setPendingUpload(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setImageUrl(null);
  };

  // 保存処理
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
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

    // ★ 旅行カテゴリの時間帯チェック（エラー時は保存中断）
    if (category === '旅行') {
      const err = validateTimeRange(timeStart, timeEnd);
      if (err) {
        setTimeError(err);
        setIsSaving(false);
        return;
      }
    }

    try {
      // アップロード（必要時）
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

      // Firestore 更新 payload（型は updateTodoInTask から取得）
      const payload: TodoUpdates = {
        memo,
        price: Number.isFinite(appliedPrice) && appliedPrice! > 0 ? appliedPrice : null,
        quantity: validQuantity,
        referenceUrls: referenceUrls.filter((u) => isString(u) && u.trim() !== ''),
      };

      // unit は数量があるときだけ付ける（undefined ならキーを作らない）
      if (appliedUnit) {
        (payload as { unit?: string }).unit = appliedUnit;
      }

      // 画像の扱い
      if (isImageRemoved) {
        (payload as { imageUrl?: string | null }).imageUrl = null;
      } else if (nextImage) {
        (payload as { imageUrl?: string | null }).imageUrl = nextImage;
      }

      // 料理のときだけレシピを保存
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

      // ★ 旅行のときだけ時間範囲を保存（空なら null で削除）
      if (category === '旅行') {
        (payload as { timeStart?: string | null }).timeStart = timeStart || null;
        (payload as { timeEnd?: string | null }).timeEnd = timeEnd || null;
      }

      // ① Firestore 更新
      await updateTodoInTask(taskId, todoId, payload);

      // ② Storage クリーンアップ
      try {
        const urlsToDelete: string[] = [];

        // 差し替え: 前回URLがあり、今回URLと異なる → 前回を削除
        if (!isImageRemoved && previousImageUrl && previousImageUrl !== nextImage) {
          urlsToDelete.push(previousImageUrl);
        }

        // 明示削除
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

      // 節約ログ
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

      // 後片付け
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

    // メモがある/他の内容がある場合はプレビュー開始
    if (hasMemo || hasContent) {
      setIsPreview(true);
    } else {
      setIsPreview(false);
    }

    previewInitRef.current = true;
  }, [isOpen, initialLoad, hasMemo, hasContent]);

  useEffect(() => {
    if (!isOpen) {
      // モーダルが閉じられたらローカルプレビューを解放し、未アップロードも破棄
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPendingUpload(null);
      setIsImageRemoved(false);
      previewInitRef.current = false;
    }
  }, [isOpen, previewUrl]);

  // 画像のプレロード（中身だけフェードイン）
  useEffect(() => {
    if (!displaySrc) {
      setImgReady(false);
      return;
    }
    setImgReady(false);
    const img = document.createElement('img');
    img.onload = () => setImgReady(true);
    img.onerror = () => setImgReady(true); // エラー時も遷移終了扱い
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
      onSaveClick={isPreview ? undefined : handleSave}
      saveLabel={isPreview ? undefined : saveLabel}
      hideActions={false}
    >
{/* ヘッダー行 */}
<div className="flex items-start justify-between ml-2 mr-1">
  {/* todo名は複数行OK・折返し表示 */}
  <h1 className="text-2xl font-bold text-gray-800 mr-3 break-words">
    {todoText}
  </h1>

  {showPreviewToggle && (
    <button
      type="button"
      onClick={() => setIsPreview((v) => !v)}
      className="inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 active:scale-[0.98] transition flex-shrink-0"
      aria-pressed={isPreview}
      aria-label={isPreview ? '編集モードに切り替え' : 'プレビューモードに切り替え'}
      title={isPreview ? '編集モードに切り替え' : 'プレビューモードに切り替え'}
    >
      {isPreview ? (
        <>
          <Pencil size={16} />
          <span>編集</span>
        </>
      ) : (
        <>
          <Eye size={16} />
          <span>プレビュー</span>
        </>
      )}
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

        {/* 画像表示エリア：画像がある時だけ枠を出す（Next/Image 使用） */}
        {showMediaFrame && (
          <div className="mt-2 relative rounded-lg border border-gray-200 overflow-hidden bg-white">
            {/* 高さ予約（4:3） */}
            <div className="w-full" style={{ aspectRatio: '4 / 3' }} />
            {/* 実画像（fill） */}
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
        <div className="relative pr-8 mt-4">
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
            className="w-full border-b border-gray-300 focus:outline-none focus:border-blue-500 resize-none mb-2 ml-2 pb-1 touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch]"
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

      {/* ▼▼▼ 参考URL（プレビュー時は「追加項目」を非表示にする） ▼▼▼ */}
      <div className="mt-2 ml-2">
        {(!isPreview || referenceUrls.length > 0) && <h3 className="font-medium">参考URL</h3>}

        {!isPreview && (
          <div className="flex gap-2">
            <input
              type="url"
              inputMode="url"
              placeholder="https://example.com/ ..."
              value={newRefUrl}
              onChange={(e) => setNewRefUrl(e.target.value)}
              className="flex-1 border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent pb-1"
            />
            <button
              type="button"
              disabled={!/^https?:\/\/\S+/i.test(newRefUrl)}
              onClick={() => {
                const v = newRefUrl.trim();
                if (!/^https?:\/\/\S+/i.test(v)) return;
                setReferenceUrls((prev) => (prev.includes(v) ? prev : [...prev, v]));
                setNewRefUrl('');
              }}
              className="inline-flex items-center gap-1 pl-3 pr-3 py-1.5 text-sm border border-gray-300 rounded-full hover:border-blue-500 mr-1 mt-2"
              aria-label="参考URLを追加"
              title="参考URLを追加"
            >
              <Plus size={16} />
              追加
            </button>
          </div>
        )}

        {referenceUrls.length > 0 && (
          <ul className="mt-2 space-y-1">
            {referenceUrls.map((url) => (
              <li key={url} className="flex items-center justify-between gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline underline-offset-2 break-all flex-1 min-w-0"
                >
                  {url}
                </a>
                {!isPreview && (
                  <button
                    type="button"
                    onClick={() =>
                      setReferenceUrls((prev) => prev.filter((u) => u !== url))
                    }
                    className="inline-flex items-center justify-center w-7 h-7 hover:bg-gray-50 mr-1 shrink-0"
                    aria-label="このURLを削除"
                    title="このURLを削除"
                  >
                    <span aria-hidden="true" className="text-lg leading-none">
                      ×
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* ▲▲▲ 参考URLここまで ▲▲▲ */}

      {/* ★ 旅行カテゴリ：時間帯入力（開始〜終了 + 所要分） */}
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

                    // ★ 修正: 所要分が入っていれば自動で終了を更新
                    const n = Number.parseInt(durationMin, 10);
                    if (Number.isFinite(n) && n > 0) {
                      const autoEnd = addMinutesToHHmm(v, n);
                      setTimeEnd(autoEnd);
                      setTimeError(validateTimeRange(v, autoEnd));
                    } else {
                      setTimeError(validateTimeRange(v, timeEnd));
                    }

                    // ★ 追加: すでに終了が入っている場合、所要分を開始～終了差で同期
                    const diff2 = minutesBetweenHHmm(v, timeEnd);
                    if (diff2 != null) {
                      setDurationMin(String(diff2));
                    }
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
                  {/* ★ 追加: プレビュー時のみ所要時間を併記（有効な時間帯かつエラーなし時） */}
                  {previewDurationMin !== null && !timeError && (
                    <span className="ml-2 text-gray-700">
                      （所要時間：{previewDurationMin}分）
                    </span>
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

                    // （既存）終了手入力時に所要分を同期
                    const diff = minutesBetweenHHmm(timeStart, v);
                    if (diff != null) {
                      setDurationMin(String(diff));
                    }
                  }}
                  className="border-b border-gray-300 focus:outline-none focus:border-blue-500 bg-transparent pb-1 tabular-nums text-center"
                  aria-label="終了時刻"
                />
              )}

            </div>

            {/* ★ 追加: 終了の右隣に「所要（分）」入力（DB保存なし） */}
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
                    // 開始が妥当 & 所要分が正のとき、終了を自動計算
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
