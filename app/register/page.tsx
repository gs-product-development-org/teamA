'use client';

// このページでは、入力・クリック・画面遷移などブラウザ上の操作を扱うため、
// Client Component として実行します。
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
// これは子コンポを読んでいる。
import WordInputRow, { type WordItem } from '@/components/WordInputRow';
import CameraOcrModal from '@/components/CameraOcrModal';

// 登録時に使用する仮のユーザーIDです。
// プログラム全体で使う固定値のため、大文字とアンダースコアで命名しています。
const DEFAULT_USER_ID = 1;

// 入力可能な最大文字数です（仕様：45文字）
const MAX_WORD_LENGTH = 45;

// 追加可能な最大単語数です（仕様：5個）
const MAX_WORDS = 5;

// モックやバックエンドから返される「未登録」を示す固定メッセージです。
const NOT_FOUND_TEXT = '辞書に登録されていません';

const GENRE_OPTIONS = [
  '日常',
  'ファンタジー',
  'SF',
  'ミステリー',
  '冒険',
] as const;

export default function WordRegisterPage() {
  // router は、登録完了後に別のページへ移動するための機能です。
  const router = useRouter();

  // words が、この画面で入力している単語一覧の本体です。
  // useState を使うと、setWords で値を更新したときに画面も自動で再表示されます。
  // 最初は空の入力行を1行だけ用意します。
  const [words, setWords] = useState<WordItem[]>([
    { id: '1', english: '', japanese: '', japaneseOptions: [] },
  ]);

  const [genre, setGenre] = useState<string>('');

  // 画面上に表示するエラーメッセージを管理する状態です。
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 通信中かどうかを管理する状態です（二重送信防止と再試行制御）。
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // カメラ（OCR）モーダルの表示フラグです。
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);

  // カメラで検出・選択された単語を単語入力欄（words）に反映します（上限5個）。
  const handleApplyCameraWords = (selectedWords: string[]): void => {
    if (selectedWords.length === 0) return;
    if (errorMessage) setErrorMessage('');

    const newWords: WordItem[] = selectedWords.slice(0, MAX_WORDS).map((wordStr, index) => ({
      id: `${Date.now()}_${index}`,
      english: wordStr,
      japanese: '',
      japaneseOptions: [],
    }));

    setWords(newWords);
  };

  // 英語入力が変更されたときに、対象の行だけを更新します。
  const handleEnglishChange = (id: string, value: string): void => {//ここ、Void方と等しいならって言うTSの書き方。★★★★★★★
    // 文字を入力し直したときは、既存のエラーメッセージをクリアします。
    if (errorMessage) setErrorMessage('');

    // setWords に関数を渡すと、更新直前の最新の配列を prevWords として受け取れます。
    setWords((prevWords) =>
      // map は配列の各要素を順番に確認し、新しい配列を作ります。
      prevWords.map((word) =>
        word.id === id
          // ID が一致する行だけ、スプレッド構文 (...) でコピーして値を差し替えます。
          // 英語を変更したら、以前の翻訳候補は古くなるため消します。
          ? { ...word, english: value, japanese: '', japaneseOptions: [] }
          // ID が違う行は、そのまま残します。
          : word
      )
    );
  };

  // 日本語の候補が選択されたときに、対象の行の japanese だけを更新します。
  const handleJapaneseChange = (id: string, value: string): void => {
    if (errorMessage) setErrorMessage('');
    setWords((prevWords) =>
      prevWords.map((word) =>
        word.id === id ? { ...word, japanese: value } : word
      )
    );
  };

  // 「行を追加する」ボタンが押されたときの処理です。
  const handleAddRow = (): void => {
    if (isLoading) return;
    if (words.length >= MAX_WORDS) {
      setErrorMessage(`You can only add up to ${MAX_WORDS} words.`);
      return;
    }
    if (errorMessage) setErrorMessage('');//一旦エラーを消して。

    // Date.now() は現在時刻を数字で返します。
    // 文字列に変換して、既存の行と重ならないIDとして使います。
    const newId = Date.now().toString();
    setWords((prevWords) => [
      // 既存の行を残したまま、末尾に新しい空行を追加します。
      ...prevWords,
      { id: newId, english: '', japanese: '', japaneseOptions: [] },
    ]);
  };

  // 行の削除ボタンが押されたときの処理です。
  const handleRemoveRow = (id: string): void => {
    // 入力行が1行だけのときは、空の画面にならないよう削除しません。
    if (words.length <= 1) return;
    if (errorMessage) setErrorMessage('');

    // filter は、条件に合う要素だけを残した新しい配列を作ります。
    // ここでは、削除対象のIDと異なる行だけを残しています。
    setWords((prevWords) => prevWords.filter((word) => word.id !== id));
  };

  // 入力された英単語のバリデーション（入力チェック）を行います。
  const validateEnglishInputs = (): boolean => {
    // 5個上限チェック：最大5個を超えている場合は弾きます
    if (words.length > MAX_WORDS) {
      setErrorMessage(`You can only register up to ${MAX_WORDS} words.`);
      return false;
    }

    // 空文字チェック：1行でも空の行があれば弾きます
    const hasEmpty = words.some((w) => w.english.trim() === '');
    if (hasEmpty) {
      setErrorMessage('Please enter an English word in every row.');
      return false;
    }

    // 45文字制限チェック：45時の理由は最長の英単語。Pneumonoultramicroscopicsilicovolcanoconiosis
    const isOverLength = words.some((w) => w.english.trim().length > MAX_WORD_LENGTH);
    if (isOverLength) {
      setErrorMessage(`English words must be ${MAX_WORD_LENGTH} characters or less.`);
      return false;
    }

    // 日本語混入チェック（半角英字・スペース・ハイフン・アポストロフィのみ許容）
    // ひらがな・カタカナ・漢字・全角文字が含まれている場合は false になります。
    const englishPattern = /^[a-zA-Z\s\-']+$/;
    const hasInvalidChar = words.some((w) => !englishPattern.test(w.english.trim()));
    if (hasInvalidChar) {
      setErrorMessage('Please enter only English letters in the English field.');
      return false;
    }

    return true;
  };

  // 「翻訳を取得」ボタンの処理です。本番API（POST /api/words/translate）と通信します。
  const handleFetchTranslations = async (): Promise<void> => {
    // 送信前にバリデーションを実施
    if (!validateEnglishInputs()) return;

    setErrorMessage('');
    setIsLoading(true);

    // 入力されている英単語の配列を作成します。
    // 小文字に統一し、前後の空白を除去し、API用のデータ形式へ整えます。
    const englishWordList = words.map((w) => w.english.trim().toLowerCase());

    // 本番API仕様書に合わせたリクエストボディ { words: string[] }
    const requestBody = {
      words: englishWordList,
    };

    try {
      // 本番AI翻訳APIへPOSTリクエストを送信
      const response = await fetch('/api/words/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? 'AI rate limit reached. Please wait a moment and try again.'
            : data.error || 'Failed to fetch translation candidates.',
        );
      }

      // レスポンス受け取り { translations: [{ english: "...", options: [...] }] }
      // APIから返ってきた候補を、画面の各入力行（words）に反映します。
      const hasNotFound = data.translations?.some(
        (item: { options: string[] }) =>
          item.options?.length === 1 && item.options[0] === NOT_FOUND_TEXT
      );

      setWords((prevWords) =>
        prevWords.map((word) => {
          // 入力された英語と一致する候補結果を探します。
          const matched = data.translations?.find(
            (item: { english: string; options: string[] }) =>
              item.english.toLowerCase() === word.english.trim().toLowerCase()
          );

          let options = matched ? matched.options : [];
          let nextJapanese = '';

          if (options.length === 1 && options[0] === NOT_FOUND_TEXT) {
            // NOT_FOUND_TEXT だけが届いた場合は候補に入れず空にします
            options = [];
            nextJapanese = '';
          } else if (word.japanese && options.includes(word.japanese)) {
            // 以前の選択がまだ使えるならそれを維持
            nextJapanese = word.japanese;
          } else {
            // どちらでもなければ空文字にする
            nextJapanese = '';
          }

          return {
            ...word,
            japaneseOptions: options,
            japanese: nextJapanese,
          };
        })
      );

      if (hasNotFound) {
        setErrorMessage('Word not found. It may be uncommon or misspelled.');
      }
    } catch (error: unknown) {
      console.error(error);
      // 失敗時はユーザーに通知し、そのまま再試行できるようにします。
      const message = error instanceof Error ? error.message : '';
      setErrorMessage(message || 'Failed to fetch translations. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // 「この単語で登録する」ボタンの処理です。本番API（POST /api/words）にデータを送信します。
  const handleRegisterSubmit = async (): Promise<void> => {
    if (!genre) {
      setErrorMessage('Please select a story genre.');
      return;
    }

    // 日本語訳が未選択の行がないかチェック（プルダウンを選んでいない行を防止）
    const isMissingJapanese = words.some((w) => w.japanese.trim() === '');
    if (isMissingJapanese) {
      setErrorMessage('Please select Japanese translations for all words.');
      return;
    }

    // 「辞書に登録されていません」となった単語を除外（削る）します。
    const validWords = words.filter(
      (w) => w.japanese.trim() !== NOT_FOUND_TEXT
    );

    // 有効な単語が1つも残らなかった場合は登録できないようにブロックします。
    if (validWords.length === 0) {
      setErrorMessage('No words available to register (all words are unregistered).');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);

    // RegisterWordsRequest の型定義に準拠したデータ構造を作成
    // WordInput[] の形式に整形
    const formattedWords = validWords.map(({ english, japanese }) => ({
      english: english.trim(),
      japanese: japanese.trim(),
    }));

    // RegisterWordsRequest { userId: number; words: WordInput[] } を構築
    // 一つ上のブロックで作った配列と、IDを会わせて、JSONにして送っている★★★★★★★★
    const registerPayload = {
      userId: DEFAULT_USER_ID,
      words: formattedWords,
    };

    try {
      // 本番の単語登録API（POST /api/words）に送信
      const response = await fetch('/api/words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registerPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register words.');
      }

      // 今回の登録結果だけを保存し、物語生成では過去の登録単語を使わないようにします。
      const savedWords = Array.isArray(data.data) ? data.data : [];
      if (savedWords.length === 0) {
        throw new Error('Failed to retrieve registered word data.');
      }
      sessionStorage.setItem('latestRegisteredWords', JSON.stringify(savedWords));
      sessionStorage.setItem('latestStoryGenre', genre);

      // 登録成功時は、登録された単語の meaning_id をクエリに持たせて物語生成画面（/stories/new）へ遷移します。
      const meaningIds = savedWords
        .map((item: { meaning_id: number }) => item.meaning_id)
        .join(',');
      router.push(meaningIds ? `/stories/new?meaningIds=${meaningIds}` : '/stories/new');
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : '';
      setErrorMessage(message || 'An error occurred during registration. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // 画面下部に表示するボタンの状態を決めるための判定です。
  // すべての行で翻訳候補が生成されているかを判定します。
  // 1行でも japaneseOptions が空の行（編集された行や新規追加行）があれば false になり、「翻訳を取得」ボタンに戻ります。
  const isAllOptionsGenerated =
    words.length > 0 && words.every((w) => w.japaneseOptions.length > 0);

  // 英語が1つでも入力されていれば、翻訳取得ボタンを押せるようにします。
  const hasEnglishInput = words.some((w) => w.english.trim() !== '');
  // すべての行で日本語訳が選択されていれば、登録ボタンを押せるようにします。
  const isAllJapaneseSelected =
    words.length > 0 && words.every((w) => w.japanese.trim() !== '');

  return (
    // main はページ全体。背景色は設定仕様の stone-50 (#fafaf9) を適用しています。
    <main className="min-h-screen bg-stone-50 py-8 px-4 text-stone-800 flex justify-center items-start">
      {/* 
        対象画面サイズ: 393 × 852 px (iPhone標準) に最適化。
        w-full max-w-[393px] でモバイル幅に固定し、デスクトップでもスマホ画面サイズで綺麗に中央表示されます。
        背景は bg-white、ボーダーは stone-200 (#e7e5e4) です。
      */}
      <div className="w-full max-w-[393px] bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
        <h1 className="text-lg font-bold text-center mb-6 text-stone-800">
          単語を登録する
        </h1>

        <label className="block mb-5 text-sm font-bold text-stone-700">
          物語のジャンル
          <select
            value={genre}
            onChange={(event) => {
              setGenre(event.target.value);
              if (errorMessage) setErrorMessage('');
            }}
            disabled={isLoading}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 font-normal text-stone-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-stone-100"
          >
            <option value="">ジャンルを選択してください</option>
            {GENRE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {/* カメラ撮影・OCR読み込みボタン */}
        <button
          type="button"
          disabled={isLoading}
          onClick={() => setIsCameraModalOpen(true)}
          className="w-full py-2.5 mb-4 bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:bg-stone-100 disabled:text-stone-400 disabled:border-stone-200"
        >
          <span className="text-base leading-none">📷</span>
          <span>写真から単語を読み込む</span>
        </button>

        {/* 単語入力行：words の数だけ WordInputRow を画面に並べます。 */}
        <div className="mb-4 max-h-[360px] overflow-y-auto pr-1">
          {words.map((item, index) => (
            <WordInputRow
              // React が各行を区別できるよう、行ごとに一意な key を渡します。
              key={item.id}
              item={item}
              index={index}
              // 2行以上あるときだけ削除ボタンを表示します。
              canDelete={words.length > 1}
              // 子コンポーネントで起きた変更を、親の関数で処理します。
              onEnglishChange={handleEnglishChange}
              onJapaneseChange={handleJapaneseChange}
              onRemoveRow={handleRemoveRow}
            />
          ))}
        </div>

        {/* 行追加ボタン：通信中、または最大個数（5個）到達時は行を追加できないようにします。 */}
        <button
          type="button"
          disabled={isLoading || words.length >= MAX_WORDS}
          onClick={handleAddRow}
          className={`w-full py-2.5 mb-5 border-2 border-dashed rounded-xl font-bold flex items-center justify-center gap-1.5 text-sm transition-colors ${
            isLoading || words.length >= MAX_WORDS
              ? 'border-stone-200 text-stone-300 bg-stone-50 cursor-not-allowed'
              : 'border-stone-300 text-stone-600 hover:bg-stone-50 hover:border-stone-400 cursor-pointer'
          }`}
        >
          <span className="text-base leading-none">＋</span>
          <span>行を追加する{words.length >= MAX_WORDS ? '（最大5個）' : ''}</span>
        </button>

        {/* 
          エラーメッセージの表示エリア
          色覚や視認性に配慮し、背景を薄い赤、文字をはっきりした濃い赤（rose-700）で表示します。
        */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 leading-relaxed">
            {errorMessage}
          </div>
        )}

        {/*
          すべての行の翻訳候補が揃っていない場合は「翻訳を取得」を表示します。
          全行の候補が揃った後は「この単語で登録する」に切り替えます。
          メインカラーは sky-600 (#0284c7) / sky-700 (#0369a1) を適用しています。
        */}
        {!isAllOptionsGenerated ? (
          <button
            type="button"
            // 英語が未入力、または通信中の場合はボタンを押せないようにします。
            disabled={!hasEnglishInput || isLoading}
            onClick={handleFetchTranslations}
            className={`w-full py-3 font-bold rounded-xl text-sm transition-colors ${hasEnglishInput && !isLoading
              ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm cursor-pointer'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
          >
            {isLoading ? '翻訳を取得中...' : '翻訳を取得'}
          </button>
        ) : (
          <button
            type="button"
            // 全行の日本語訳が選択されていなければ、登録処理を実行できません。
            disabled={!isAllJapaneseSelected || isLoading}
            onClick={handleRegisterSubmit}
            className={`w-full py-3 font-bold rounded-xl text-sm transition-colors ${isAllJapaneseSelected && !isLoading
              ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm cursor-pointer'
              : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
          >
            {isLoading ? '登録中...' : 'この単語で登録する'}
          </button>
        )}
      </div>

      {/* カメラ（OCR）単語抽出モーダル */}
      <CameraOcrModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onApplyWords={handleApplyCameraWords}
      />
    </main>
  );
}
