"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import StoryEnglishView, {
  type StoryWordInfo,
} from "@/components/StoryEnglishView";

import styles from "./page.module.css";
import Link from "next/link";

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
  const [isBackModalOpen, setIsBackModalOpen] = useState<boolean>(false);
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
    <div className="container">

      <div className={styles.navigation}>
     <Link
        href="/register"
        className={`${styles.returnButtonLink} ${
          isLoading ? styles.disabledReturnButton : ""
        }`}
        aria-disabled={isLoading}
        onClick={(e) => {
          if (isLoading) {
            e.preventDefault();
            return;
          }

          e.preventDefault();
          setIsBackModalOpen(true);
        }}
      >
        <img
          src="/return.png"
          alt="Back button"
          className={styles.returnImage}
        />
      </Link>

        <button
          type="button"
          onClick={saveStoryAndNavigate}
          disabled={isSaving || isLoading || !storyData}
          className={styles.saveButton}
        >
          {isSaving ? "Saving..." : "Save Story"}
        </button>
      </div>

     {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loading}>
            <div className={styles.loadingImages}>
               <img
                src="/youcyu01_color.png"
                alt=""
                className={styles.loadingImageRotate}
              />
            </div>

            <p className={styles.loadingTitle}>
              Generating story...
            </p>

            <p className={styles.loadingText}>
              AI is writing a story using the words you just registered.
            </p>
          </div>
        </div>
      )}

      {!isLoading && errorMessage && (
        <div className={styles.error}>
          <p className={styles.errorTitle}>
            Generation Error
          </p>

          <p className={styles.errorMessage}>
            {errorMessage}
          </p>

          <button
            type="button"
            onClick={generateStory}
            className={styles.retryButton}
          >
            Try Again
          </button>
        </div>
      )}

      {!isLoading && storyData && (
        <>
          <StoryEnglishView
            title={storyData.title}
            story={storyData.story}
            words={storyData.words}
            imageUrl={storyData.imageUrl}
            onRegenerateStory={generateStory}
            onRegenerateImage={() => void generateImage(storyData)}
            isImageLoading={isImageLoading}
            isStoryLoading={isLoading}
          />

          {imageErrorMessage && (
            <p className={styles.imageError}>
              {imageErrorMessage}
            </p>
          )}

          <section className={styles.translationSection}>
            <button
              type="button"
              onClick={() => setIsJapaneseVisible((visible) => !visible)}
              aria-expanded={isJapaneseVisible}
              className={styles.translationButton}
            >
              <span>View Japanese Translation</span>

              <span
                aria-hidden="true"
                className={styles.translationIcon}
              >
                {isJapaneseVisible ? "−" : "+"}
              </span>
            </button>

            {isJapaneseVisible && (
              <p className={styles.translationText}>
                {storyData.japaneseStory}
              </p>
            )}
          </section>
        </>
      )}
      {isBackModalOpen && (
      <div className={styles.modalOverlay}>
        <div className={styles.modal}>
          <h2 className={styles.modalTitle}>
            Leave this page?
          </h2>

          <p className={styles.modalText}>
            The generated story will not be saved.
          </p>

          <div className={styles.modalActions}>
            <button
              type="button"
              onClick={() => setIsBackModalOpen(false)}
              className={styles.modalCancelButton}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => router.push("/register")}
              className={styles.modalLeaveButton}
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
    
  );
}
