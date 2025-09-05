'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Eye, Pencil, Plus } from 'lucide-react';
// import RecipeEditor, { type Recipe } from '@/components/todo/parts/RecipeEditor';
import RecipeEditor, { type Recipe, type RecipeEditorHandle } from '@/components/todo/parts/RecipeEditor';
import ShoppingDetailsEditor from '@/components/todo/parts/ShoppingDetailsEditor';
import { auth, db, storage } from '@/lib/firebase';
import { updateTodoInTask } from '@/lib/firebaseUtils';
import { addDoc, collection, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useUnitPriceDifferenceAnimation } from '@/hooks/useUnitPriceDifferenceAnimation';
import BaseModal from '../../common/modals/BaseModal';

// 表示上限: 画面高の 50%（vh基準）
const MAX_TEXTAREA_VH = 50;

// 画像圧縮ユーティリティ
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
    return { blob: file, mime: file.type === 'image/webp' ? 'image/webp' as const : 'image/jpeg' as const };
  }

  const bitmap = await (async () => {
    try {
      return await createImageBitmap(file);
    } catch {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = URL.createObjectURL(file);
      });
      return img as any as ImageBitmap;
    }
  })();

  const { width, height } = bitmap;
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

  ctx.drawImage(bitmap, 0, 0, targetW, targetH);

  const toBlob = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));

  const [webpBlob, jpegBlob] = await Promise.all([
    toBlob('image/webp', quality),
    toBlob('image/jpeg', quality),
  ]);

  if (!webpBlob && !jpegBlob) return { blob: file, mime: 'image/jpeg' };
  if (webpBlob && jpegBlob) {
    if (webpBlob.size <= jpegBlob.size) return { blob: webpBlob, mime: 'image/webp' };
    return { blob: jpegBlob, mime: 'image/jpeg' };
  }
  if (webpBlob) return { blob: webpBlob, mime: 'image/webp' };
  return { blob: jpegBlob!, mime: 'image/jpeg' };
}

interface TodoNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  todoText: string;
  todoId: string;
  taskId: string;
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
  const [category, setCategory] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe>({ ingredients: [], steps: [] });
  const [imageUrl, setImageUrl] = useState<string | null>(null); // 保存済みURL（Firestoreに保存される値）
  const [previousImageUrl, setPreviousImageUrl] = useState<string | null>(null); // 差分削除用
  const [isUploadingImage, setIsUploadingImage] = useState(false); // 選択時は圧縮中にのみ使用

  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [newRefUrl, setNewRefUrl] = useState('');

  // ★ 保存時アップロード方式のための追加state
  const [pendingUpload, setPendingUpload] = useState<{ blob: Blob; mime: 'image/webp' | 'image/jpeg' } | null>(null); // 未アップロードの新画像
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // 画面表示用のローカルURL
  const [isImageRemoved, setIsImageRemoved] = useState(false); // 削除予約（保存時に previous を削除）

  // 🆕 フェードイン／枠常時表示用
  const [imgReady, setImgReady] = useState(false);             // 画像の読込完了フラグ
  const displaySrc = previewUrl ?? imageUrl;                   // 表示に使うURL（プレビュー優先）
  const showMediaFrame = isOpen && !!displaySrc; // 画像がある時だけ枠を出す

  const memoRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ▼ 内容の存在判定（メモ／画像／レシピ／買い物入力）
  const hasMemo = useMemo(() => memo.trim().length > 0, [memo]);

  // 画像は Firestore 保存済みURLのみを対象（previewUrl は無視）
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
    const p = parseFloat(price);
    const q = parseFloat(quantity);
    const validPrice = Number.isFinite(p) && p > 0;
    const validQty = Number.isFinite(q) && q > 0;
    return validPrice || validQty;
  }, [category, price, quantity]);

  // 変更: hasContent に参考URLがある場合も含める
  const hasContent = hasMemo || hasImage || hasRecipe || hasShopping || referenceUrls.length > 0;

  const showMemo = useMemo(() => !isPreview || hasMemo, [isPreview, hasMemo]);

  const shallowEqualRecipe = useCallback((a: Recipe, b: Recipe) => {
    if (a === b) return true;
    if (a.ingredients.length !== b.ingredients.length) return false;
    for (let i = 0; i < a.ingredients.length; i++) {
      const x = a.ingredients[i];
      const y = b.ingredients[i];
      if (!x || !y) return false;
      if (x.id !== y.id || x.name !== y.name || x.unit !== y.unit || x.amount !== y.amount) return false;
    }
    if (a.steps.length !== b.steps.length) return false;
    for (let i = 0; i < a.steps.length; i++) {
      if (a.steps[i] !== b.steps[i]) return false;
    }
    return true;
  }, []);

  const handleRecipeChange = useCallback((next: Recipe) => {
    setRecipe((prev) => (shallowEqualRecipe(prev, next) ? prev : next));
  }, [shallowEqualRecipe]);

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

  const numericPrice = parseFloat(price);
  const numericQuantity = parseFloat(quantity);
  const numericComparePrice = parseFloat(comparePrice);
  const numericCompareQuantity = parseFloat(compareQuantity);
  const isCompareQuantityMissing = !numericCompareQuantity || numericCompareQuantity <= 0;
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const parsed = parseFloat(comparePrice);
    setSaveLabel(!isNaN(parsed) && parsed > 0 ? 'この価格で更新する' : '保存');
  }, [comparePrice]);

  useEffect(() => {
    const fetchTodoData = async () => {
      if (!taskId || !todoId) return;
      try {
        const taskRef = doc(db, 'tasks', taskId);
        const taskSnap = await getDoc(taskRef);
        if (taskSnap.exists()) {
          const taskData = taskSnap.data();
          const cat = (taskData as any)?.category ?? null;
          setCategory(cat);

          const todos = Array.isArray(taskData.todos) ? taskData.todos : [];
          const todo = todos.find((t: { id: string }) => t.id === todoId);
          if (todo) {
            setMemo((todo as any).memo || '');
            setPrice((todo as any).price?.toString?.() || '');
            setQuantity((todo as any).quantity?.toString?.() || '');
            setUnit((todo as any).unit || 'g');

            if (!compareQuantity && (todo as any).quantity) {
              setCompareQuantity((todo as any).quantity.toString());
            }

            const existing = (todo as any).recipe as Recipe | undefined;
            if (existing) {
              const safeIngredients = Array.isArray(existing.ingredients)
                ? existing.ingredients.map((ing: any, idx: number) => ({
                  id: ing?.id ?? `ing_${idx}`,
                  name: ing?.name ?? '',
                  amount: typeof ing?.amount === 'number' ? ing.amount : null,
                  unit: ing?.unit ?? '適量',
                }))
                : [];
              setRecipe({
                ingredients: safeIngredients,
                steps: Array.isArray(existing.steps) ? existing.steps : [],
              });
            } else {
              setRecipe({
                ingredients: [{ id: 'ing_0', name: '', amount: null, unit: '適量' }],
                steps: [''],
              });
            }

            const existingImageUrl = ((todo as any).imageUrl as string | undefined) ?? null;
            setImageUrl(existingImageUrl);
            setPreviousImageUrl(existingImageUrl);
            // 初期表示時は未アップロード画像もプレビューもなし
            setPendingUpload(null);
            setPreviewUrl(null);
            setIsImageRemoved(false);

            const refs = Array.isArray((todo as any).referenceUrls)
              ? (todo as any).referenceUrls.filter((s: any) => typeof s === 'string')
              : [];
            setReferenceUrls(refs); // ✅ ここで state へ反映
          }
        }
      } catch (e) {
        console.error('初期データの取得に失敗:', e);
      } finally {
        setInitialLoad(false);
        setTimeout(updateHints, 0);
      }
    };
    fetchTodoData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, todoId, updateHints]);

  const resizeTextarea = useCallback(() => {
    const el = memoRef.current;
    if (!el) return;

    const maxHeightPx =
      (typeof window !== 'undefined' ? window.innerHeight : 0) * (MAX_TEXTAREA_VH / 100);

    el.style.height = 'auto';
    el.style.maxHeight = `${maxHeightPx}px`;
    (el.style as any).webkitOverflowScrolling = 'touch';

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

  // ── 画像選択→圧縮のみ（アップロードは保存時に実施） ──────────────────────────
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
      } catch { /* noop */ }
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

  // ── 保存処理 ────────────────────────────────────────────
  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setIsSaving(true);
    const committedIngredients = recipeEditorRef.current?.commitAllAmounts();

    const numericPrice = parseFloat(price);
    const numericQuantity = parseFloat(quantity);
    const numericComparePrice = parseFloat(comparePrice);
    const numericCompareQuantity = parseFloat(compareQuantity);

    const appliedPrice = numericComparePrice > 0 ? numericComparePrice : numericPrice;
    // 入力が正しいときだけ数量を採用（未入力/NaN/0以下はnull）
    const rawQuantity =
      numericComparePrice > 0
        ? numericCompareQuantity
        : numericQuantity;
    const validQuantity =
      Number.isFinite(rawQuantity) && rawQuantity > 0 ? rawQuantity : null;
    // 単位は数量があるときだけ採用（なければnull）
    const appliedUnit = validQuantity ? unit : null;

    const safeCompareQuantity = numericCompareQuantity > 0 ? numericCompareQuantity : 1;
    const safeQuantity = numericQuantity > 0 ? numericQuantity : 1;
    const currentUnitPriceCalced =
      numericPrice > 0 && safeQuantity > 0 ? numericPrice / safeQuantity : null;
    const compareUnitPriceCalced =
      numericComparePrice > 0 ? numericComparePrice / safeCompareQuantity : null;
    const unitPriceDiffCalced =
      compareUnitPriceCalced !== null && currentUnitPriceCalced !== null
        ? compareUnitPriceCalced - currentUnitPriceCalced
        : null;
    const totalDifferenceCalced =
      unitPriceDiffCalced !== null ? unitPriceDiffCalced * safeCompareQuantity : null;

    try {
      // ▼ 保存直前に、必要なら Storage へアップロードして imageUrl を確定する
      let nextImageUrl: string | null = imageUrl;

      if (!isImageRemoved && pendingUpload) {
        const ext = pendingUpload.mime === 'image/webp' ? 'webp' : 'jpg';
        const storagePath = `task_todos/${taskId}/${todoId}/${Date.now()}.${ext}`;
        const fileRef = ref(storage, storagePath);
        await uploadBytes(fileRef, pendingUpload.blob, {
          contentType: pendingUpload.mime,
          customMetadata: {
            ownerUid: user.uid,
            taskId,
            todoId,
          },
        });
        nextImageUrl = await getDownloadURL(fileRef);
      }

      // ▼ Firestore 更新 payload
      const payload: Record<string, any> = {
        memo,
        price: Number.isFinite(appliedPrice) && appliedPrice! > 0 ? appliedPrice : null,
        quantity: validQuantity,
        unit: appliedUnit,
        referenceUrls: referenceUrls
          .filter((u) => typeof u === 'string' && u.trim() !== ''),
      };

      // ✅ 画像はカテゴリに依存させない
      // - 削除予約: null（サーバ側でキー削除）
      // - 新規/差し替えあり: URL を保存
      // - それ以外: 送らない（＝変更なし）
      if (isImageRemoved) {
        payload.imageUrl = null;
      } else if (nextImageUrl) {
        payload.imageUrl = nextImageUrl;
      }

      // 料理のときだけレシピを保存（これは従来通りでOK）
      if (category === '料理') {
        const finalIngredients = committedIngredients ?? recipe.ingredients;
        payload.recipe = {
          ingredients: finalIngredients
            .filter((i) => i.name.trim() !== '')
            .map((i) => ({
              id: i.id,
              name: i.name.trim(),
              amount: typeof i.amount === 'number' ? i.amount : null,
              unit: i.unit || '適量',
            })),
          steps: recipe.steps.map((s) => s.trim()).filter((s) => s !== ''),
        } as Recipe;
      }

      // ① Firestore 更新
      await updateTodoInTask(taskId, todoId, payload);

      // ② Storage クリーンアップ
      try {
        const urlsToDelete: string[] = [];

        // 差し替え: 前回URLがあり、今回URLと異なる → 前回を削除
        if (!isImageRemoved && previousImageUrl && previousImageUrl !== nextImageUrl) {
          urlsToDelete.push(previousImageUrl);
        }

        // 明示削除: 削除予約かつ前回URLがある → 前回を削除
        if (isImageRemoved && previousImageUrl) {
          urlsToDelete.push(previousImageUrl);
        }

        await Promise.all(
          urlsToDelete.map(async (url) => {
            try {
              // downloadURL から参照を生成して削除
              const storageRef = ref(storage, url); // https://～ の downloadURL でOK
              await deleteObject(storageRef);
            } catch (e) {
              console.warn('Storage 画像削除に失敗:', url, e);
            }
          })
        );

        // 次回比較用に「前回値」を更新
        setPreviousImageUrl(isImageRemoved ? null : (nextImageUrl ?? null));
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

      // 後片付け（ローカルプレビューの解放など）
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setPendingUpload(null);
      setIsImageRemoved(false);

      setImageUrl(nextImageUrl ?? null);

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
    if (!isOpen) return;
    if (initialLoad) return;
    if (previewInitRef.current) return;

    // ✅ メモがある場合は優先してプレビュー開始
    if (hasMemo) {
      setIsPreview(true);
    } else if (hasContent) {
      // メモ以外（画像・レシピ・買い物・参考URL）があればプレビュー開始
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

  // 🆕 画像のプレロード（中身だけフェードインさせる）
  useEffect(() => {
    if (!displaySrc) {
      setImgReady(false);
      return;
    }
    setImgReady(false);
    const img = new Image();
    img.onload = () => setImgReady(true);
    img.onerror = () => setImgReady(true); // エラー時も遷移終了扱い
    img.src = displaySrc;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [displaySrc]);

  if (!mounted || initialLoad) return null;

  // const showPreviewToggle = category === '料理' && hasContent;
  const showPreviewToggle = hasContent;

  return (
    <BaseModal
      isOpen={isOpen}
      isSaving={isSaving}
      saveComplete={saveComplete}
      onClose={onClose}
      // プレビュー時は保存ボタンを出さない（undefinedを渡す）
      onSaveClick={isPreview ? undefined : handleSave}
      saveLabel={isPreview ? undefined : saveLabel}
      // ← ここを false 固定に変更して、アクション領域自体は表示
      hideActions={false}
    >
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 ml-2">{todoText}</h1>

        {showPreviewToggle && (
          <button
            type="button"
            onClick={() => setIsPreview((v) => !v)}
            className="mr-1 inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
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

        {/* 🆕 画像表示エリア：画像がある時だけ枠を出す */}
        {showMediaFrame && (
          <div className="mt-2 relative rounded-lg border border-gray-200 overflow-hidden bg-white">
            {/* 高さ予約用のアスペクト比ボックス（4:3） */}
            <div className="w-full" style={{ aspectRatio: '4 / 3' }} />

            {/* 実画像（ロード完了でフェードイン） */}
            <img
              src={displaySrc}
              alt="挿入画像プレビュー"
              className="absolute inset-0 w-full h-full object-contain transition-opacity duration-200"
              style={{ opacity: imgReady ? 1 : 0 }}
              loading="lazy"
              onLoad={() => setImgReady(true)}
            />

            {/* スケルトン：画像ロード中のみ */}
            {!imgReady && (
              <div className="absolute inset-0 animate-pulse bg-gray-100" />
            )}
          </div>
        )}

      </div>

      {/* textarea（備考） */}
      {showMemo && (
        <div className="relative pr-8">
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
        {/* ラベルは：プレビュー中でもURLが1件以上あるなら表示 */}
        {(!isPreview || referenceUrls.length > 0) && (
          // <label className="block text-sm text-gray-600 mb-1">参考URL</label>
          <h3 className="font-medium">参考URL</h3>
        )}

        {/* 追加項目（入力欄＋追加ボタン）はプレビュー中は非表示 */}
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
            {/* // 参考URL 追加ボタン（修正後）: プレビューボタンと同じ右マージン（mr-1）に統一 */}
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



        {/* 一覧は従来どおり。プレビュー中は削除ボタンだけ非表示 */}
        {referenceUrls.length > 0 && (
          <ul className="mt-2 space-y-1">
            {referenceUrls.map((url) => (
              <li key={url} className="flex items-center justify-between gap-2">
                {/* 左側：URL（長文でも折り返し） */}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline underline-offset-2 break-all flex-1 min-w-0"
                >
                  {url}
                </a>

                {/* 右側：×ボタン（追加ボタンの右端に合わせて mr-1） */}
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
                    <span aria-hidden="true" className="text-lg leading-none">×</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

      </div>
      {/* ▲▲▲ 参考URLここまで ▲▲▲ */}

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
        />
      )}

      {/* 料理カテゴリのレシピエディタ */}
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
