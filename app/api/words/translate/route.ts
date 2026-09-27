import { NextResponse } from "next/server";
import { generateJson, isRateLimitError } from "@/lib/ai/groq";
import {
  assertTextsAreSafe,
  ModerationFlaggedError,
} from "@/lib/ai/moderation";
import { MAX_WORD_LENGTH } from "@/lib/validations/word";

const NOT_FOUND_TEXT = "辞書に登録されていません";

/**
 * Datamuse API (https://api.datamuse.com/words) を使用して単語が存在するか確認する関数
 * @param word 英単語
 * @returns 存在すれば true、存在しなければ false
 */
async function checkWordExistsInDictionary(word: string): Promise<boolean> {
  try {
    const trimmedWord = word.trim().toLowerCase();
    const response = await fetch(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(trimmedWord)}&max=1`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      return true; // 通信エラー等の場合はフォールバックとして true
    }

    const data: { word: string }[] = await response.json();

    // 検索結果に完全一致する英単語が含まれているか確認
    if (Array.isArray(data) && data.length > 0) {
      return data.some((item) => item.word.toLowerCase() === trimmedWord);
    }

    return false;
  } catch (error) {
    console.warn(`Datamuse API 確認エラー (${word}):`, error);
    return true; // ネットワークエラーなどの場合はフォールバックとして true
  }
}

/**
 * リクエストボディの型定義
 */
export interface TranslateRequest {
  words: string[];
}

/**
 * 各単語の翻訳結果の型定義
 */
export interface TranslationOption {
  english: string;
  options: string[];
}

/**
 * レスポンスボディの型定義
 */
export interface TranslateResponse {
  translations: TranslationOption[];
}

const TRANSLATE_SYSTEM_PROMPT = `
あなたは日本の高校の英語授業で使われる英和辞典アシスタントです。
性的・暴力的・差別的な意味やスラング・俗語的な意味は絶対に含めないでください。該当する単語であっても、教科書に載るような一般的・健全な意味のみを挙げてください。
`.trim();

// Groq の Structured Outputs (json_schema, strict) 用のスキーマ定義
const translateSchema = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      description: "各単語の翻訳結果のリスト",
      items: {
        type: "object",
        properties: {
          english: {
            type: "string",
            description: "入力された元の英単語",
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: `その英単語の、高校の教科書レベルで健全な日本語の意味（よく使われる順に2〜10個程度）。性的・暴力的・差別的・スラング的な意味は含めないこと。単語が不明な場合は"${NOT_FOUND_TEXT}"のみを返すこと。`,
          },
        },
        required: ["english", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};

/**
 * Groq API を呼び出して英単語の日本語訳候補を生成する処理
 * 返り値: { translations: [ { english: "spring", options: ["春", "バネ", "跳ぶ"] } ] }
 */
async function generateTranslations(
  words: string[],
): Promise<TranslateResponse> {
  const wordListText = words
    .map((word, index) => `${index + 1}. ${word}`)
    .join("\n");

  const prompt = `
以下の「英単語のリスト」に含まれる各単語について、日本人英語学習者が単語帳に登録する際に役立つ代表的な日本語の意味（訳候補）を、よく使われる順に3〜5個挙げてください。
品詞（動詞、名詞など）によって意味が大きく異なる場合は、代表的な品詞の意味をバランスよく含めてください。
単語が不明または一般的でない場合は"${NOT_FOUND_TEXT}"のみを返してください。
また、UIのプルダウンで選択しやすいように、簡潔な日本語表現（例: 「走る」「経営する」など）にしてください。
性的・暴力的・差別的な意味やスラング・俗語的な意味は挙げないでください。

【英単語リスト】
${wordListText}
  `.trim();

  const result = await generateJson<TranslateResponse>({
    systemPrompt: TRANSLATE_SYSTEM_PROMPT,
    userPrompt: prompt,
    temperature: 0.3, // 辞書的な意味なので低めの温度でブレを防ぐ
    schemaName: "translations",
    schema: translateSchema,
  });

  // Groqが生成したテキストをユーザーに返す前にモデレーションチェックする
  const allOptions = result.translations.flatMap((t) => t.options);
  await assertTextsAreSafe(allOptions);

  return result;
}

/**
 * POST ハンドラー (API Endpoint: POST /api/words/translate)
 * フロントエンドから送信された英単語リストを受け取り、
 * Datamuse 辞書APIで単語の実在チェックを行った後、実在する単語のみ Groq で意味候補を生成して返す
 *
 * Request: JSON { "words": ["spring", "run", "apple"] }
 * Response: JSON { "translations": [ { "english": "spring", "options": ["春", "バネ", "温泉"] } ] }
 */
export async function POST(request: Request) {
  try {
    const body: Partial<TranslateRequest> = await request.json();

    // 1. リクエストボディの基本チェック（words 配列が存在するか）
    if (!body || !Array.isArray(body.words) || body.words.length === 0) {
      return NextResponse.json(
        { error: "翻訳する単語の配列（words）が指定されていません" },
        { status: 400 },
      );
    }
    if (body.words.length > 5) {
      return NextResponse.json(
        { error: "一度に翻訳できる単語は最大5個までです" },
        { status: 400 },
      );
    }

    // 2. 空白の除去と空文字の除外、および文字数上限チェック
    const cleanedWords = body.words
      .map((w) => (typeof w === "string" ? w.trim() : ""))
      .filter((w) => w.length > 0);

    if (cleanedWords.length === 0) {
      return NextResponse.json(
        { error: "有効な英単語が指定されていません" },
        { status: 400 },
      );
    }

    // 各単語の文字数上限チェック（外部API乱用・DoS防止）
    for (const word of cleanedWords) {
      if (word.length > MAX_WORD_LENGTH) {
        return NextResponse.json(
          {
            error: `英単語は${MAX_WORD_LENGTH}文字以内で入力してください（現在: ${word.length}文字）`,
          },
          { status: 400 },
        );
      }
    }

    // 3. Datamuse 辞書APIで全単語の実在チェックを並行実行
    const checkResults = await Promise.all(
      cleanedWords.map(async (word) => {
        const exists = await checkWordExistsInDictionary(word);
        return { word, exists };
      }),
    );

    const validWords = checkResults.filter((r) => r.exists).map((r) => r.word);
    const notFoundSet = new Set(
      checkResults.filter((r) => !r.exists).map((r) => r.word.toLowerCase()),
    );

    // 4. 実在する単語があれば Groq API で翻訳候補を生成
    let groqResults: TranslationOption[] = [];
    if (validWords.length > 0) {
      const groqResponse = await generateTranslations(validWords);
      groqResults = groqResponse.translations || [];
    }

    // 5. 元の単語順序を保持したままレスポンスを作成
    const finalTranslations: TranslationOption[] = cleanedWords.map((word) => {
      const lowerWord = word.toLowerCase();
      if (notFoundSet.has(lowerWord)) {
        return {
          english: word,
          options: [NOT_FOUND_TEXT],
        };
      }

      // Groq の結果から検索
      const matched = groqResults.find(
        (item) => item.english.toLowerCase() === lowerWord,
      );

      return {
        english: word,
        options: matched ? matched.options : [NOT_FOUND_TEXT],
      };
    });

    // 6. 成功レスポンス（200 OK）
    return NextResponse.json({ translations: finalTranslations });
  } catch (error: any) {
    console.error("POST /api/words/translate エラー:", error);

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
      { error: "英単語の意味候補の取得に失敗しました" },
      { status: 500 },
    );
  }
}
