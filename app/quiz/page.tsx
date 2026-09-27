"use client";

import { useState } from "react";
import "../globals.css";
import styles from "./page.module.css";

type QuizWord = {
  meaningId: number;
  wordId: number;
  word: string;
  meaning: string;
  surfaces: string[];
};

type QuizStory = {
  storyId: number;
  title: string;
  story: string;
  japaneseStory: string;
  imageUrl: string | null;
  words: QuizWord[];
};

type QuizResponseData = {
  totalStories: number;
  stories: QuizStory[];
};

type RandomQuizResponse = {
  success: boolean;
  data?: QuizResponseData;
  error?: string;
};

type StoryPart =
  | { type: "text"; value: string }
  | {
    type: "blank";
    id: string;
    value: string;
    word: QuizWord;
  };

type BlankResult = {
  id: string;
  answer: string;
  isCorrect: boolean;
  word: QuizWord;
};

type StoryResult = {
  storyId: number;
  blanks: BlankResult[];
};

const QUIZ_API_URL = "/api/quiz/random";
const USER_ID = 1;
const QUIZ_LIMIT = 3;
const MAX_ANSWER_LENGTH = 45;
const ENGLISH_ANSWER_PATTERN = /^[a-zA-Z\s\-\u2010-\u2015\u2212'’‘`′]+$/;

/**
 * 正規表現の特殊文字をエスケープする関数
 * @param value エスケープする文字列
 * @returns エスケープされた文字列
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/**
 * 物語の文章を解析し、テキスト部分と空欄部分に分割する関数
 * @param story 解析する物語データ
 * @returns 分割された物語のパーツの配列
 */
function buildStoryParts(story: QuizStory): StoryPart[] {
  const surfaceMap = new Map<string, QuizWord>();

  story.words.forEach((word) => {
    const surfaces = word.surfaces.length > 0 ? word.surfaces : [word.word];
    surfaces.forEach((surface) => {
      surfaceMap.set(normalizeAnswer(surface), word);
    });
  });

  const surfaces = Array.from(surfaceMap.keys()).sort(
    (first, second) => second.length - first.length,
  );

  if (surfaces.length === 0) {
    return [{ type: "text", value: story.story }];
  }

  const matcher = new RegExp(`(?:(?<=\\s|^|[^a-zA-Z0-9'’\\-]))(${surfaces.map(escapeRegExp).join("|")})(?=(?:\\s|$|[^a-zA-Z0-9'’\\-]))`, "gi");
  const parts: StoryPart[] = [];
  let lastIndex = 0;
  let blankNumber = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(story.story)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: story.story.slice(lastIndex, match.index),
      });
    }

    const matchedSurface = normalizeAnswer(match[0]);
    const word = surfaceMap.get(matchedSurface);
    if (!word) {
      parts.push({ type: "text", value: match[0] });
    } else {
      parts.push({
        type: "blank",
        id: `${story.storyId}-${blankNumber}`,
        value: match[0],
        word,
      });
      blankNumber += 1;
    }

    lastIndex = matcher.lastIndex;
  }

  if (lastIndex < story.story.length) {
    parts.push({ type: "text", value: story.story.slice(lastIndex) });
  }

  return parts;
}

/**
 * 空欄の答えを正規化する関数
 * @param value 正規化する文字列
 * @returns 正規化された文字列
 */

function normalizeAnswer(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’‘`′]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

function getAcceptedAnswers(word: QuizWord): string[] {
  return Array.from(new Set([word.word, ...word.surfaces]));
}

function getResultMessage(totalCorrect: number, totalQuestions: number): string {
  if (totalQuestions === 0) return "Great Job!";
  const percentage = (totalCorrect / totalQuestions) * 100;
  if (percentage === 100) {
    return "Perfect!";
  }
  if (percentage >= 80) {
    return "Great Job!";
  }
  if (percentage >= 50) {
    return "Good Effort!";
  }
  return "Keep Practicing!";
}

function getAnswerValidationError(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return "";
  }

  if (trimmedValue.length > MAX_ANSWER_LENGTH) {
    return `Answer must be within ${MAX_ANSWER_LENGTH} characters.`;
  }

  if (!ENGLISH_ANSWER_PATTERN.test(trimmedValue)) {
    return "Please enter your answer in English letters only.";
  }

  return "";
}

function isCorrectAnswer(answer: string, word: QuizWord): boolean {
  const normalizedAnswer = normalizeAnswer(answer);
  return getAcceptedAnswers(word).some(
    (correctAnswer) => normalizeAnswer(correctAnswer) === normalizedAnswer,
  );
}

export default function QuizPage() {
  const [quizData, setQuizData] = useState<QuizResponseData | null>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [storyResults, setStoryResults] = useState<StoryResult[]>([]);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showHint, setShowHint] = useState(false);

  const currentStory = quizData?.stories[currentStoryIndex];
  const currentParts = currentStory ? buildStoryParts(currentStory) : [];
  const currentBlanks = currentParts.filter(
    (part): part is Extract<StoryPart, { type: "blank" }> =>
      part.type === "blank",
  );
  const totalQuestions = storyResults.reduce(
    (total, result) => total + result.blanks.length,
    0,
  );
  const totalCorrect = storyResults.reduce(
    (total, result) =>
      total + result.blanks.filter((blank) => blank.isCorrect).length,
    0,
  );
  async function handleStartQuiz(): Promise<void> {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `${QUIZ_API_URL}?userId=${USER_ID}&limit=${QUIZ_LIMIT}`,
      );
      const data: RandomQuizResponse = await response.json().catch(() => ({}));

      if (!response.ok || !data.success || !data.data?.stories.length) {
        throw new Error(data.error || "Failed to load quiz data.");
      }

      setQuizData(data.data);
      setCurrentStoryIndex(0);
      setAnswers({});
      setStoryResults([]);
      setIsAnswered(false);
      setIsFinished(false);
      setShowHint(false);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to load quiz data.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleAnswerChange(id: string, value: string): void {
    setAnswers((previousAnswers) => ({
      ...previousAnswers,
      [id]: value,
    }));
  }

  function handleSubmitStory(): void {
    if (!currentStory || isAnswered) return;

    for (const blank of currentBlanks) {
      const validationError = getAnswerValidationError(answers[blank.id] || "");
      if (validationError) {
        setErrorMessage(validationError);
        return;
      }
    }

    const blanks = currentBlanks.map((blank) => ({
      id: blank.id,
      answer: answers[blank.id] || "",
      isCorrect: isCorrectAnswer(answers[blank.id] || "", blank.word),
      word: blank.word,
    }));

    setStoryResults((previousResults) => [
      ...previousResults.filter((result) => result.storyId !== currentStory.storyId),
      { storyId: currentStory.storyId, blanks },
    ]);
    setErrorMessage("");
    setIsAnswered(true);
  }

  function handleNextStory(): void {
    if (!quizData || !isAnswered) return;

    if (currentStoryIndex >= quizData.stories.length - 1) {
      setIsFinished(true);
      return;
    }

    setCurrentStoryIndex((previousIndex) => previousIndex + 1);
    setAnswers({});
    setIsAnswered(false);
    setShowHint(false);
    setErrorMessage("");
  }




  // この関数は、現在の物語の内容をレンダリングするために使用されます。
  // 物語の各パーツ（テキストや空欄）を順番に処理し、適切なコンポーネントを返します。
  function renderStoryContent(
    story: QuizStory,
    resultBlanks: BlankResult[] = [],
  ): React.ReactNode {
    const storyParts = buildStoryParts(story);

    return storyParts.map((part, index) => {
      if (part.type === "text") {
        return <span key={index}>{part.value}</span>;
      }

      const result = resultBlanks.find((blank) => blank.id === part.id);
      const answer = result ? result.answer : answers[part.id] || "";

      return (
        <span
          key={part.id}
          className={`inline-flex flex-col align-middle mx-1 ${result
              ? result.isCorrect
                ? styles.correctBlank
                : styles.wrongBlank
              : ""
            }`}
        >
          <input
            aria-label={`Answer for ${part.word.meaning}`}
            className={`${styles.blankInput} ${result
                ? result.isCorrect
                  ? styles.blankInputCorrect
                  : styles.blankInputWrong
                : ""
              }`}
            disabled={Boolean(result) || isAnswered}
            maxLength={MAX_ANSWER_LENGTH}
            value={answer}
            onChange={(event) => handleAnswerChange(part.id, event.target.value)}
            placeholder="Type..."
          />
          {result && (
            <span
              className={`${styles.feedback} ${result.isCorrect ? styles.feedbackCorrect : styles.feedbackWrong
                }`}
            >
              {result.isCorrect
                ? "Correct!"
                : `Answer: ${getAcceptedAnswers(result.word).join(" / ")}`}
            </span>
          )}
        </span>
      );
    });
  }

  return (
    <div className="container">
      <div className={styles.page}>
        {!quizData && (
          <header className="mb-6">
            <p className={styles.headerSub}>
              English Story Quiz
            </p>
            <h1 className={styles.headerTitle}>Story Quiz</h1>
          </header>
        )}

        {!quizData && !isLoading && (
          <section className={styles.folderArea}>
            <div className={styles.folderInner}>
              <h2 className="text-xl font-extrabold text-slate-900">
                Learn with Saved Stories
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 font-medium">
                Fill in the blanks in the story to test your vocabulary.
              </p>
              <button
                type="button"
                onClick={handleStartQuiz}
                className={`${styles.primaryButton} mt-6`}
              >
                Start Quiz
              </button>
              {errorMessage && (
                <div className={styles.errorBox}>
                  {errorMessage}
                </div>
              )}
            </div>
          </section>
        )}

        {isLoading && (
          <div className={styles.loadingBox}>
            <div className={styles.loadingInner}>
              Preparing quiz...
            </div>
          </div>
        )}

        {quizData && !isFinished && currentStory && (
          <section className={styles.folderArea}>
            <div className={styles.folderInner}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold" style={{ color: "var(--color-primary-orange)" }}>
                    Story {currentStoryIndex + 1} of {quizData.totalStories}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    {currentStory.title}
                  </h2>
                </div>
                <p className="text-xs font-bold text-slate-500">
                  Score: {totalCorrect} / {totalQuestions}
                </p>
              </div>

              <div className="mt-4">
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressBar}
                    style={{
                      width: `${((currentStoryIndex + 1) / quizData.totalStories) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {currentStory.imageUrl && (
                <img
                  src={currentStory.imageUrl}
                  alt="Story Illustration"
                  className="mt-5 max-h-52 w-full rounded-xl object-cover border border-slate-100 shadow-sm"
                />
              )}

              <div className={styles.storyBox}>
                {renderStoryContent(
                  currentStory,
                  storyResults.find(
                    (result) => result.storyId === currentStory.storyId,
                  )?.blanks,
                )}
              </div>

              <div className={styles.sectionBlock}>
                <p className={styles.sectionLabel}>Japanese Translation</p>
                <p className={styles.sectionText}>{currentStory.japaneseStory}</p>
              </div>

              {currentStory.words.length > 0 && (
                <div className={styles.sectionBlock}>
                  <button
                    type="button"
                    onClick={() => setShowHint((prev) => !prev)}
                    className={styles.hintToggleButton}
                  >
                    <span>Hint</span>
                    <span>{showHint ? "Hide ▲" : "Show ▼"}</span>
                  </button>
                  {showHint && (
                    <p className={styles.sectionText}>
                      Word Meanings: {currentStory.words.map((word) => word.meaning).join(" / ")}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={isAnswered ? handleNextStory : handleSubmitStory}
                className={`${styles.primaryButton} mt-6`}
              >
                {isAnswered
                  ? currentStoryIndex === quizData.stories.length - 1
                    ? "View Results"
                    : "Next Story"
                  : "Submit Answer"}
              </button>
              {errorMessage && (
                <div className={styles.errorBox}>
                  {errorMessage}
                </div>
              )}
            </div>
          </section>
        )}

        {isFinished && (
          <section className={styles.folderArea}>
            <div className={`${styles.folderInner} text-center`}>
              <p className={styles.resultBadge}>QUIZ COMPLETE</p>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-900">
                {getResultMessage(totalCorrect, totalQuestions)}
              </h2>
              <p className={styles.scoreText}>
                {totalCorrect} / {totalQuestions}
              </p>
              <p className="mt-1 text-sm font-bold text-slate-600">Correct Answers</p>

              <button
                type="button"
                onClick={() => {
                  setQuizData(null);
                  setIsFinished(false);
                  setStoryResults([]);
                  setAnswers({});
                  setIsAnswered(false);
                  setShowHint(false);
                }}
                className={`${styles.secondaryButton} mt-6`}
              >
                Try Again
              </button>

              <div className="mt-6 space-y-6 border-t border-slate-200 pt-6 text-left">
                <h3 className="text-base font-extrabold text-slate-900">
                  Detailed Results
                </h3>
                {quizData?.stories.map((story, index) => {
                  const result = storyResults.find(
                    (storyResult) => storyResult.storyId === story.storyId,
                  );

                  return (
                    <article
                      key={story.storyId}
                      className={styles.storyResultCard}
                    >
                      <p className="text-xs font-bold" style={{ color: "var(--color-primary-orange)" }}>
                        Story {index + 1}: {story.title}
                      </p>
                      <div className={styles.storyBox}>
                        {renderStoryContent(story, result?.blanks)}
                      </div>
                      <div className={styles.sectionBlock}>
                        <p className={styles.sectionLabel}>Japanese Translation</p>
                        <p className={styles.sectionText}>
                          {story.japaneseStory}
                        </p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
