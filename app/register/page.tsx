"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import WordInputRow, { type WordItem } from "@/components/WordInputRow";
import CameraOcrModal from "@/components/CameraOcrModal";

import styles from "./page.module.css";
import "../globals.css";

const DEFAULT_USER_ID = 1;
const MAX_WORD_LENGTH = 45;
const MAX_WORDS = 5;
const NOT_FOUND_TEXT = "辞書に登録されていません";

const GENRE_OPTIONS = [
  "日常",
  "ファンタジー",
  "SF",
  "ミステリー",
  "冒険",
] as const;

export default function WordRegisterPage() {
  const router = useRouter();

  const [words, setWords] = useState<WordItem[]>([
    {
      id: "1",
      english: "",
      japanese: "",
      japaneseOptions: [],
    },
  ]);

  const [genre, setGenre] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCameraModalOpen, setIsCameraModalOpen] =
    useState<boolean>(false);

  const handleApplyCameraWords = (selectedWords: string[]): void => {
    if (selectedWords.length === 0) return;

    if (errorMessage) {
      setErrorMessage("");
    }

    const newWords: WordItem[] = selectedWords
      .slice(0, MAX_WORDS)
      .map((wordStr, index) => ({
        id: `${Date.now()}_${index}`,
        english: wordStr,
        japanese: "",
        japaneseOptions: [],
      }));

    setWords(newWords);
  };

  const handleEnglishChange = (
    id: string,
    value: string
  ): void => {
    if (errorMessage) {
      setErrorMessage("");
    }

    setWords((prevWords) =>
      prevWords.map((word) =>
        word.id === id
          ? {
              ...word,
              english: value,
              japanese: "",
              japaneseOptions: [],
            }
          : word
      )
    );
  };

  const handleJapaneseChange = (
    id: string,
    value: string
  ): void => {
    if (errorMessage) {
      setErrorMessage("");
    }

    setWords((prevWords) =>
      prevWords.map((word) =>
        word.id === id
          ? { ...word, japanese: value }
          : word
      )
    );
  };

  const handleAddRow = (): void => {
    if (isLoading) return;

    if (words.length >= MAX_WORDS) {
      setErrorMessage(
        `単語は最大${MAX_WORDS}個までしか追加できません。`
      );
      return;
    }

    if (errorMessage) {
      setErrorMessage("");
    }

    const newId = Date.now().toString();

    setWords((prevWords) => [
      ...prevWords,
      {
        id: newId,
        english: "",
        japanese: "",
        japaneseOptions: [],
      },
    ]);
  };

  const handleRemoveRow = (id: string): void => {
    if (words.length <= 1) return;

    if (errorMessage) {
      setErrorMessage("");
    }

    setWords((prevWords) =>
      prevWords.filter((word) => word.id !== id)
    );
  };

  const validateEnglishInputs = (): boolean => {
    if (words.length > MAX_WORDS) {
      setErrorMessage(
        `単語は最大${MAX_WORDS}個までしか登録できません。`
      );
      return false;
    }

    const hasEmpty = words.some(
      (word) => word.english.trim() === ""
    );

    if (hasEmpty) {
      setErrorMessage(
        "すべての行に英単語を入力してください。"
      );
      return false;
    }

    const isOverLength = words.some(
      (word) =>
        word.english.trim().length > MAX_WORD_LENGTH
    );

    if (isOverLength) {
      setErrorMessage(
        `英単語は${MAX_WORD_LENGTH}文字以内で入力してください。`
      );
      return false;
    }

    const englishPattern = /^[a-zA-Z\s\-']+$/;

    const hasInvalidChar = words.some(
      (word) =>
        !englishPattern.test(word.english.trim())
    );

    if (hasInvalidChar) {
      setErrorMessage(
        "英語欄には半角英字のみを入力してください（日本語は含められません）。"
      );
      return false;
    }

    return true;
  };

  const handleFetchTranslations = async (): Promise<void> => {
    if (!validateEnglishInputs()) return;

    setErrorMessage("");
    setIsLoading(true);

    const englishWordList = words.map((word) =>
      word.english.trim().toLowerCase()
    );

    const requestBody = {
      words: englishWordList,
    };

    try {
      const response = await fetch("/api/words/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "AIの利用制限に達しました。しばらく時間を置いてから再度お試しください"
            : data.error || "翻訳候補の取得に失敗しました"
        );
      }

      const hasNotFound = data.translations?.some(
        (item: { options: string[] }) =>
          item.options?.length === 1 &&
          item.options[0] === NOT_FOUND_TEXT
      );

      setWords((prevWords) =>
        prevWords.map((word) => {
          const matched = data.translations?.find(
            (item: {
              english: string;
              options: string[];
            }) =>
              item.english.toLowerCase() ===
              word.english.trim().toLowerCase()
          );

          let options = matched ? matched.options : [];
          let nextJapanese = "";

          if (
            options.length === 1 &&
            options[0] === NOT_FOUND_TEXT
          ) {
            options = [];
            nextJapanese = "";
          } else if (
            word.japanese &&
            options.includes(word.japanese)
          ) {
            nextJapanese = word.japanese;
          }

          return {
            ...word,
            japaneseOptions: options,
            japanese: nextJapanese,
          };
        })
      );

      if (hasNotFound) {
        setErrorMessage(
          "単語が見つかりませんでした。一般的でないか、スペルミスの可能性があります。"
        );
      }
    } catch (error: unknown) {
      console.error(error);

      const message =
        error instanceof Error ? error.message : "";

      setErrorMessage(
        message ||
          "翻訳の取得に失敗しました。もう一度「翻訳を取得」を押して再試行してください。"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (): Promise<void> => {
    if (!genre) {
      setErrorMessage(
        "物語のジャンルを選択してください。"
      );
      return;
    }

    const isMissingJapanese = words.some(
      (word) => word.japanese.trim() === ""
    );

    if (isMissingJapanese) {
      setErrorMessage(
        "すべての単語の日本語訳を選択してください。"
      );
      return;
    }

    const validWords = words.filter(
      (word) =>
        word.japanese.trim() !== NOT_FOUND_TEXT
    );

    if (validWords.length === 0) {
      setErrorMessage(
        "登録できる単語がありません（すべての単語が辞書未登録です）。"
      );
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    const formattedWords = validWords.map(
      ({ english, japanese }) => ({
        english: english.trim(),
        japanese: japanese.trim(),
      })
    );

    const registerPayload = {
      userId: DEFAULT_USER_ID,
      words: formattedWords,
    };

    try {
      const response = await fetch("/api/words", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registerPayload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "単語の登録に失敗しました"
        );
      }

      const savedWords = Array.isArray(data.data)
        ? data.data
        : [];

      if (savedWords.length === 0) {
        throw new Error(
          "登録された単語データを取得できませんでした"
        );
      }

      sessionStorage.setItem(
        "latestRegisteredWords",
        JSON.stringify(savedWords)
      );

      sessionStorage.setItem(
        "latestStoryGenre",
        genre
      );

      const meaningIds = savedWords
        .map(
          (item: { meaning_id: number }) =>
            item.meaning_id
        )
        .join(",");

      router.push(
        meaningIds
          ? `/stories/new?meaningIds=${meaningIds}`
          : "/stories/new"
      );
    } catch (error: unknown) {
      console.error(error);

      const message =
        error instanceof Error ? error.message : "";

      setErrorMessage(
        message ||
          "登録処理中にエラーが発生しました。もう一度お試しください。"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const isAllOptionsGenerated =
    words.length > 0 &&
    words.every(
      (word) => word.japaneseOptions.length > 0
    );

  const hasEnglishInput = words.some(
    (word) => word.english.trim() !== ""
  );

  const isAllJapaneseSelected =
    words.length > 0 &&
    words.every(
      (word) => word.japanese.trim() !== ""
    );

  return (
    <main>
      <div className="container">
        <div className={styles.registerHeader}>
          <div>
            <p className={styles.headerSub}>
              English Story
            </p>

            <h1 className={styles.headerTitle}>
              Create Story
            </h1>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={() =>
              setIsCameraModalOpen(true)
            }
            className={styles.cameraButton}
          >
              <div className={`radius ${styles.cameraIcon}`}>
                <img src="/camera.png" alt="camera" />
              </div>
          </button>
        </div>
        
        <div className={`radius ${styles.inputCard}`}>
          <div className={styles.genreLabel}>
            {/* 物語のジャンル */}
            <select
              value={genre}
              onChange={(event) => {
                setGenre(event.target.value);

                if (errorMessage) {
                  setErrorMessage("");
                }
              }}
              disabled={isLoading}
              className={`radius ${styles.genreSelect} ${
                genre === "" ? styles.activeBorder : ""
              }`}
            >
              <option value="">
                Select Genre
              </option>

              {GENRE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.wordInputList}>
            {words.map((item, index) => (
              <WordInputRow
                key={item.id}
                item={item}
                index={index}
                canDelete={words.length > 1}
                genreSelected={genre !== ""}
                onEnglishChange={handleEnglishChange}
                onJapaneseChange={handleJapaneseChange}
                onRemoveRow={handleRemoveRow}
              />
            ))}
          </div>

          <button
            type="button"
            disabled={
              isLoading ||
              words.length >= MAX_WORDS
            }
            onClick={handleAddRow}
            className={styles.addButton}
          >
            <span className={styles.plusIcon}>
              ＋
            </span>

            <span>
              Add New Word
              {words.length >= MAX_WORDS &&
                "（Max 5）"}
            </span>
          </button>
        </div>
        

        {errorMessage && (
          <div className={styles.errorMessage}>
            {errorMessage}
          </div>
        )}

        {!isAllOptionsGenerated ? (
          <button
            type="button"
            disabled={
              !hasEnglishInput || isLoading
            }
            onClick={handleFetchTranslations}
            className={`${styles.submitButton} ${
              hasEnglishInput && !isLoading
                ? styles.submitButtonActive
                : styles.submitButtonDisabled
            }`}
          >
            {isLoading
              ? "Getting translations..."
              : "Get Translations"}
          </button>
        ) : (
          <button
            type="button"
            disabled={
              !isAllJapaneseSelected ||
              isLoading
            }
            onClick={handleRegisterSubmit}
            className={`${styles.submitButton} ${
              isAllJapaneseSelected && !isLoading
                ? styles.submitButtonActive
                : styles.submitButtonDisabled
            }`}
          >
            {isLoading
              ? "Registering..."
              : "Register These Words"}
          </button>
        )}
      </div>

      <CameraOcrModal
        isOpen={isCameraModalOpen}
        onClose={() =>
          setIsCameraModalOpen(false)
        }
        onApplyWords={handleApplyCameraWords}
      />
    </main>
  );
}