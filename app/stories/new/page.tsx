"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import StoryEnglishView, {
  type StoryWordInfo,
} from "@/components/StoryEnglishView";

// ※他者が作成した和訳コンポーネント用スロット
// import JapaneseStoryView from '@/components/JapaneseStoryView';

interface GeneratedStoryResponse {
  title: string;
  story: string;
  japaneseStory: string;
  words: StoryWordInfo[];
  imageUrl?: string;
}

interface GenerateImageResponse {
  success: boolean;
  image?: {
    url: string;
  };
  error?: string;
}

interface RegisteredWord {
  meaning_id?: number;
  meaningId?: number;
  english?: string;
  word?: string;
  japanese?: string;
  meaning?: string;
}

interface StoredWordsData {
  data?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRegisteredWord(value: unknown): value is RegisteredWord {
  return isRecord(value);
}

function getRegisteredWords(value: unknown): RegisteredWord[] {
  if (Array.isArray(value)) {
    return value.filter(isRegisteredWord);
  }

  if (isRecord(value)) {
    const storedData = value as StoredWordsData;
    return Array.isArray(storedData.data)
      ? storedData.data.filter(isRegisteredWord)
      : [];
  }

  return [];
}

export default function StoryGeneratorPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(false);
  const [isJapaneseVisible, setIsJapaneseVisible] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [imageErrorMessage, setImageErrorMessage] = useState<string>("");
  const [storyData, setStoryData] = useState<GeneratedStoryResponse | null>(
    null,
  );

  const generateImage = useCallback(async (story: GeneratedStoryResponse) => {
    setIsImageLoading(true);
    setImageErrorMessage("");

    try {
      const imageRes = await fetch("/api/stories/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: story.title, story: story.story }),
      });
      const imageJson: GenerateImageResponse = await imageRes
        .json()
        .catch(() => ({}));

      if (!imageRes.ok || !imageJson.success || !imageJson.image?.url) {
        throw new Error(
          imageRes.status === 429
            ? "AI rate limit reached. Please wait a moment and try again."
            : imageJson.error || "Failed to generate image.",
        );
      }

      const updatedStory = { ...story, imageUrl: imageJson.image.url };
      setStoryData(updatedStory);
      sessionStorage.setItem(
        "generatedStoryData",
        JSON.stringify(updatedStory),
      );
    } catch (error: unknown) {
      console.error("画像生成エラー:", error);
      setImageErrorMessage(
        error instanceof Error ? error.message : "Failed to generate image.",
      );
    } finally {
      setIsImageLoading(false);
    }
  }, []);

  // 物語生成処理（再生成ボタンからも呼び出せるよう関数化）
  const generateStory = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    setStoryData(null);

    try {
      // 1. 直前に登録した単語セットを取得
      const savedData = sessionStorage.getItem("latestRegisteredWords");
      if (!savedData) {
        throw new Error(
          "Registered word data not found. Please start over from the word registration page.",
        );
      }

      const registeredWords = getRegisteredWords(JSON.parse(savedData));

      if (registeredWords.length === 0) {
        throw new Error("Registered word list is empty.");
      }

      const genre = sessionStorage.getItem("latestStoryGenre");
      if (!genre) {
        throw new Error("Story genre not found. Please start over from the word registration page.");
      }

      // 返り値: 物語生成APIが受け取る単語情報の配列
      const requestPayload = {
        genre,
        words: registeredWords.map((w) => ({
          meaningId: Number(w.meaning_id || w.meaningId),
          word: String(w.english || w.word || "").trim(),
          meaning: String(w.japanese || w.meaning || "").trim(),
        })),
      };

      if (
        requestPayload.words.some(
          (word) =>
            !Number.isFinite(word.meaningId) || !word.word || !word.meaning,
        )
      ) {
        throw new Error("Invalid format for registered word data.");
      }

      // 3. 物語生成API（POST /api/stories/generate）を実行
      const genRes = await fetch("/api/stories/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      const genJson = await genRes.json().catch(() => ({}));

      if (!genRes.ok) {
        throw new Error(
          genRes.status === 429
            ? "AI rate limit reached. Please wait a moment and try again."
            : genRes.status >= 500
              ? "Story generation server error. Please try again later."
              : genJson.error ||
                `Failed to generate story (Status: ${genRes.status})`,
        );
      }

      const generatedStory: GeneratedStoryResponse = genJson;
      setStoryData(generatedStory);
      sessionStorage.setItem(
        "generatedStoryData",
        JSON.stringify(generatedStory),
      );
      setIsJapaneseVisible(false);
      void generateImage(generatedStory);
    } catch (error: unknown) {
      console.error("物語生成エラー:", error);
      const message = error instanceof Error ? error.message : "";
      setErrorMessage(message || "An error occurred while generating the story.");
    } finally {
      setIsLoading(false);
    }
  }, [generateImage]);

  // 返り値: 物語をDBへ保存して一覧画面へ遷移するPromise
  const saveStoryAndNavigate = async (): Promise<void> => {
    if (!storyData || isSaving) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      const saveRes = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: 1,
          title: storyData.title,
          story: storyData.story,
          japaneseStory: storyData.japaneseStory,
          imageUrl: storyData.imageUrl,
          words: storyData.words.map((word) => ({
            meaningId: word.meaningId,
            surfaces: word.surfaces || [],
          })),
        }),
      });

      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok) {
        throw new Error(
          saveJson.error ||
            `Failed to save story (Status: ${saveRes.status})`,
        );
      }

      router.push("/list");
    } catch (error: unknown) {
      console.error("物語登録エラー:", error);
      const message = error instanceof Error ? error.message : "";
      setErrorMessage(message || "An error occurred while saving the story.");
    } finally {
      setIsSaving(false);
    }
  };

  // 初回マウント時に自動生成を実行
  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void generateStory();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [generateStory]);

  return (
    <main className="min-h-screen bg-stone-50 py-8 px-4 flex justify-center items-start text-stone-800">
      <div className="w-full max-w-[393px]">
        {/* ナビゲーションバー：一覧画面・保存アクション */}
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="text-xs font-medium text-stone-500 hover:text-stone-800 transition"
          >
            ← 単語登録へ
          </button>

          {/* 物語保存ボタン */}
          <button
            type="button"
            onClick={saveStoryAndNavigate}
            disabled={isSaving || isLoading || !storyData}
            className="text-xs font-bold text-white bg-stone-800 hover:bg-stone-900 disabled:opacity-40 disabled:cursor-not-allowed px-3.5 py-1.5 rounded-lg shadow-sm transition"
          >
            {isSaving ? "保存中..." : "物語を保存"}
          </button>
        </div>

        {/* 生成中ローディング */}
        {isLoading && (
          <div className="bg-white rounded-2xl p-8 text-center border border-stone-200 shadow-sm">
            <div className="animate-spin h-8 w-8 border-3 border-sky-600 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-sm font-bold text-stone-700">物語を生成中...</p>
            <p className="text-xs text-stone-400 mt-1">
              さっき登録した単語を使ってAIが執筆しています
            </p>
          </div>
        )}

        {/* エラー表示と再試行ボタン */}
        {!isLoading && errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl mb-4 text-xs">
            <div className="flex items-center gap-2 mb-2">
              <img
                src="/seicyu_sad.PNG"
                alt="エラー"
                className="w-8 h-8 object-contain flex-shrink-0"
              />
              <p className="font-bold text-sm">Generation Error</p>
            </div>
            <p className="mb-3">{errorMessage}</p>
            <button
              type="button"
              onClick={generateStory}
              className="bg-rose-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-rose-700 transition"
            >
              もう一度試す
            </button>
          </div>
        )}

        {/* 物語のメイン表示 */}
        {!isLoading && storyData && (
          <>
            {/* あなたが担当するハイライト対応の英文共通部品 */}
            <StoryEnglishView
              title={storyData.title}
              story={storyData.story}
              words={storyData.words}
              imageUrl={storyData.imageUrl}
            />

            {imageErrorMessage && (
              <div className="mb-4 flex items-center gap-2 text-xs text-rose-600">
                <img
                  src="/seicyu_sad.PNG"
                  alt="エラー"
                  className="w-5 h-5 object-contain flex-shrink-0"
                />
                <p>{imageErrorMessage}</p>
              </div>
            )}

            <section className="mb-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
              <button
                type="button"
                onClick={() => setIsJapaneseVisible((visible) => !visible)}
                aria-expanded={isJapaneseVisible}
                className="w-full flex items-center justify-between gap-3 p-4 text-left text-sm font-bold text-stone-700"
              >
                <span>和訳を見る</span>
                <span
                  aria-hidden="true"
                  className="text-sky-600 text-lg leading-none"
                >
                  {isJapaneseVisible ? "−" : "+"}
                </span>
              </button>
              {isJapaneseVisible && (
                <p className="border-t border-stone-100 p-4 text-sm leading-relaxed text-stone-600 whitespace-pre-wrap">
                  {storyData.japaneseStory}
                </p>
              )}
            </section>

            {/* アクションボタン（再生成 ＆ 一覧へ戻る） */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => void generateImage(storyData)}
                disabled={isLoading || isImageLoading}
                className="w-full py-2.5 bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 font-bold rounded-xl text-sm transition shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <span>🖼️</span>
                <span>{isImageLoading ? '画像生成中...' : '画像を再生成する'}</span>
              </button>

              {/* 物語再生成ボタン */}
              <button
                type="button"
                onClick={generateStory}
                disabled={isImageLoading || isLoading}
                className="w-full py-2.5 bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 font-bold rounded-xl text-sm transition shadow-sm flex items-center justify-center gap-1.5"
              >
                <span>🔄</span>
                <span>別の物語を再生成する</span>
              </button>

              {/* 誤操作防止のために間隔を広げた一覧へ戻るボタン */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => router.push("/list")}
                  className="w-full py-2.5 bg-white border border-stone-300 hover:border-stone-400 hover:bg-stone-50 text-stone-700 font-bold rounded-xl text-sm transition shadow-xs text-center cursor-pointer"
                >
                  保存せずに一覧画面に戻る
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
