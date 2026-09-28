// lib/validations/story.ts

// 物語で選択可能なジャンル一覧（ホワイトリスト：完全一致のみ許可）
export const ALLOWED_GENRES = [
  "日常",
  "ファンタジー",
  "SF",
  "ミステリー",
  "冒険",
] as const;

export type AllowedGenre = (typeof ALLOWED_GENRES)[number];

// 物語テキストの最大文字数
export const MAX_STORY_TITLE_LENGTH = 100;
export const MAX_STORY_CONTENT_LENGTH = 1000;
export const MAX_STORY_JAPANESE_LENGTH = 1000;

/**
 * 物語ジャンルのバリデーションチェック（プロンプトインジェクション対策）
 * 任意項目のため、未指定（undefined, null, 空文字）は許可。
 * 指定された場合は ALLOWED_GENRES のいずれかに完全一致するかを検証。
 */
export function validateGenre(genre?: unknown): {
  isValid: boolean;
  error?: string;
} {
  if (genre === undefined || genre === null || genre === "") {
    return { isValid: true };
  }

  if (typeof genre !== "string") {
    return { isValid: false, error: "ジャンルは文字列で指定してください" };
  }

  const trimmed = genre.trim();
  if (trimmed === "") {
    return { isValid: true };
  }

  if (!ALLOWED_GENRES.includes(trimmed as AllowedGenre)) {
    return {
      isValid: false,
      error: `指定されたジャンル「${trimmed}」は無効です。利用可能なジャンル: ${ALLOWED_GENRES.join(", ")}`,
    };
  }

  return { isValid: true };
}

/**
 * 物語登録時の入力値バリデーションチェック（DB肥大化・DoS対策）
 */
export function validateStoryInput(data: {
  title: unknown;
  story: unknown;
  japaneseStory?: unknown;
}): { isValid: boolean; error?: string } {
  // タイトル必須チェック
  if (typeof data.title !== "string" || data.title.trim() === "") {
    return { isValid: false, error: "物語のタイトルを入力してください" };
  }

  const trimmedTitle = data.title.trim();
  if (trimmedTitle.length > MAX_STORY_TITLE_LENGTH) {
    return {
      isValid: false,
      error: `タイトルは${MAX_STORY_TITLE_LENGTH}文字以内で入力してください（現在: ${trimmedTitle.length}文字）`,
    };
  }

  // 英文本文必須チェック
  if (typeof data.story !== "string" || data.story.trim() === "") {
    return { isValid: false, error: "物語の英文本文を入力してください" };
  }

  const trimmedStory = data.story.trim();
  if (trimmedStory.length > MAX_STORY_CONTENT_LENGTH) {
    return {
      isValid: false,
      error: `物語本文は${MAX_STORY_CONTENT_LENGTH}文字以内で入力してください（現在: ${trimmedStory.length}文字）`,
    };
  }

  // 和訳本文文字数チェック（任意）
  if (data.japaneseStory !== undefined && data.japaneseStory !== null) {
    if (typeof data.japaneseStory !== "string") {
      return { isValid: false, error: "和訳本文は文字列で指定してください" };
    }
    const trimmedJapanese = data.japaneseStory.trim();
    if (trimmedJapanese.length > MAX_STORY_JAPANESE_LENGTH) {
      return {
        isValid: false,
        error: `和訳本文は${MAX_STORY_JAPANESE_LENGTH}文字以内で入力してください（現在: ${trimmedJapanese.length}文字）`,
      };
    }
  }

  return { isValid: true };
}
