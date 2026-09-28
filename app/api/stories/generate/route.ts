import { NextResponse } from "next/server";
import { generateJson, isRateLimitError } from "@/lib/ai/groq";
import {
  assertTextsAreSafe,
  ModerationFlaggedError,
} from "@/lib/ai/moderation";
import { validateGenre } from "@/lib/validations/story";
import { MAX_WORD_LENGTH, MAX_MEANING_LENGTH } from "@/lib/validations/word";

/**
 * フロントエンドから送信される単語情報の型定義
 */
export interface StoryWordInput {
  meaningId: number;
  word: string;
  meaning: string;
}

/**
 * リクエストボディの型定義
 */
export interface GenerateStoryRequest {
  genre?: string;
  words: StoryWordInput[];
}

/**
 * 物語中で使用された各単語の情報の型定義
 */
export interface GeneratedStoryWord {
  meaningId: number;
  word: string;
  surfaces: string[];
}

/**
 * 物語生成APIのレスポンスボディの型定義(その単語が物語中でどのように使用されたかを含む)
 */
export interface GenerateStoryResponse {
  title: string;
  story: string;
  japaneseStory: string;
  words: GeneratedStoryWord[];
}

const STORY_SYSTEM_PROMPT = "あなたは英語学習者向けのストーリーテラーです。";

// Groq の Structured Outputs (json_schema, strict) 用のスキーマ定義
const storySchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "物語の魅力的な日本語タイトル（例: 「朝の公園ルーティン」）",
    },
    story: {
      type: "string",
      description:
        "指定された単語をすべて使用した、自然な英語のショートストーリー（高校生レベルの読みやすい英文、3〜5文程度）",
    },
    japaneseStory: {
      type: "string",
      description: "英文ストーリーの自然な日本語訳",
    },
    words: {
      type: "array",
      description:
        "各入力単語が物語の中で実際にどのような形（活用形など）で使用されたかのリスト",
      items: {
        type: "object",
        properties: {
          meaningId: {
            type: "integer",
            description: "入力された単語の meaningId",
          },
          word: {
            type: "string",
            description: "元の英単語",
          },
          surfaces: {
            type: "array",
            items: { type: "string" },
            description:
              "物語の中で実際に使用された形（例: run なら ran や running など、使用されたすべての形）",
          },
        },
        required: ["meaningId", "word", "surfaces"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "story", "japaneseStory", "words"],
  additionalProperties: false,
};

/**
 * Groq API を呼び出してショートストーリーを生成する処理
 * 返り値: { title, story, japaneseStory, words: [{ meaningId, word, surfaces }] }
 */
async function generateStory(
  words: StoryWordInput[],
  genre?: string,
): Promise<GenerateStoryResponse> {
  const wordListText = words
    .map(
      (item, index) =>
        `${index + 1}. [ID: ${item.meaningId}] ${item.word}（意味: ${item.meaning}）`,
    )
    .join("\n");

  const genreInstruction =
    genre && genre.trim().length > 0
      ? `【世界観・ジャンル指定】\nこの物語は「${genre.trim()}」のジャンル・世界観や雰囲気に合わせて作成してください。\n`
      : "";

  const prompt = `
以下の「単語リスト」に含まれるすべての単語を使用して、高校生（英語コミュニケーションⅡレベル）が楽しく読める、自然な英語のショートストーリーを作成してください。

${genreInstruction}
【要件】
1. タイトルは親しみやすい【日本語】にしてください（例: 「朝の公園ルーティン」）。
2. ストーリーは短編（3〜5文程度、30語程度）で、高校2年生が理解しやすい自然な英文にしてください。
3. 文脈に合わせて単語の活用形（過去形、進行形、複数形など）を自由に変えて構いません。指定された意味に沿った文脈で使用してください。
4. 各単語について、英文本文中で実際にどのような形で使用されたか（活用形など）を "surfaces" 配列にすべて記録してください。元の meaningId と単語スペルを保持してください。
5. 全文の自然な日本語訳（japaneseStory）も作成してください。

【単語リスト】
${wordListText}
  `.trim();

  const result = await generateJson<GenerateStoryResponse>({
    systemPrompt: STORY_SYSTEM_PROMPT,
    userPrompt: prompt,
    temperature: 0.5, // ストーリーの創造性を出すため0.5に設定
    schemaName: "story",
    schema: storySchema,
  });

  // Groqが生成したテキストをユーザーに返す前にモデレーションチェックする
  await assertTextsAreSafe([result.title, result.story, result.japaneseStory]);

  return result;
}

/**
 * POST ハンドラー (API Endpoint: POST /api/stories/generate)
 * フロントエンドから送信された単語リストを受け取り、Groq でショートストーリーを生成して返す
 *
 * Request: JSON { "genre": "ファンタジー", "words": [ { "meaningId": 1, "word": "run", "meaning": "走る" }, ... ] }
 * Response: JSON { "title": "朝の公園ルーティン", "story": "...", "japaneseStory": "...", "words": [...] }
 */
export async function POST(request: Request) {
  try {
    //フロントエンドから送信されたリクエストボディを取得
    const body: Partial<GenerateStoryRequest> = await request.json();

    // 1. リクエストボディの基本チェック（words 配列が存在するか）
    if (!body || !Array.isArray(body.words) || body.words.length === 0) {
      return NextResponse.json(
        { error: "単語の配列（words）が指定されていません" },
        { status: 400 },
      );
    }
    if (body.words.length > 5) {
      return NextResponse.json(
        { error: "一度に物語を生成できる単語は最大5個までです" },
        { status: 400 },
      );
    }

    // 2. 各単語のバリデーションチェック（meaningId, word, meaning の存在確認と文字数上限）
    const validWords: StoryWordInput[] = [];
    for (const item of body.words) {
      if (
        typeof item.meaningId !== "number" ||
        typeof item.word !== "string" ||
        item.word.trim() === "" ||
        typeof item.meaning !== "string" ||
        item.meaning.trim() === ""
      ) {
        return NextResponse.json(
          {
            error:
              "単語のデータ形式が不正です（meaningId, word, meaning は必須です）",
          },
          { status: 400 },
        );
      }

      const trimmedWord = item.word.trim();
      const trimmedMeaning = item.meaning.trim();

      if (trimmedWord.length > MAX_WORD_LENGTH) {
        return NextResponse.json(
          {
            error: `英単語は${MAX_WORD_LENGTH}文字以内で入力してください（現在: ${trimmedWord.length}文字）`,
          },
          { status: 400 },
        );
      }

      if (trimmedMeaning.length > MAX_MEANING_LENGTH) {
        return NextResponse.json(
          {
            error: `意味は${MAX_MEANING_LENGTH}文字以内で入力してください（現在: ${trimmedMeaning.length}文字）`,
          },
          { status: 400 },
        );
      }

      validWords.push({
        meaningId: item.meaningId,
        word: trimmedWord,
        meaning: trimmedMeaning,
      });
    }

    // 3. ジャンル指定のバリデーション（完全性・プロンプトインジェクション対策）
    const genreValidation = validateGenre(body.genre);
    if (!genreValidation.isValid) {
      return NextResponse.json(
        { error: genreValidation.error || "指定されたジャンルが無効です" },
        { status: 400 },
      );
    }

    const genre =
      typeof body.genre === "string" && body.genre.trim().length > 0
        ? body.genre.trim()
        : undefined;

    // 4. Groq による物語生成処理
    const result = await generateStory(validWords, genre);

    // 5. 成功レスポンス（200 OK）
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("物語生成エラー:", error);

    // モデレーションで不適切と判定された場合
    if (error instanceof ModerationFlaggedError) {
      return NextResponse.json(
        { error: "生成された内容が不適切と判定されました。再度お試しください" },
        { status: 422 },
      );
    }

    // Groq API の利用制限（429 Too Many Requests）を検知
    if (isRateLimitError(error)) {
      return NextResponse.json(
        {
          error:
            "AIの利用制限に達しました。しばらく時間を置いてから再度お試しください",
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "物語の生成に失敗しました" },
      { status: 500 },
    );
  }
}
