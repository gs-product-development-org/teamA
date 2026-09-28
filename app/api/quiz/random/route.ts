import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * クイズ対象の各単語情報の型定義
 */
export interface QuizWord {
  meaningId: number;
  wordId: number;
  word: string;
  meaning: string;
  surfaces: string[];
}

/**
 * クイズ対象の物語1件の型定義
 */
export interface QuizStory {
  storyId: number;
  title: string;
  story: string;
  japaneseStory: string;
  imageUrl: string | null;
  words: QuizWord[];
}

/**
 * クイズAPIのレスポンスデータ全体の型定義
 */
export interface QuizResponseData {
  totalStories: number;
  stories: QuizStory[];
}

/**
 * クイズAPIの全体のレスポンス型定義
 */
export interface RandomQuizResponse {
  success: boolean;
  data?: QuizResponseData;
  error?: string;
}

/**
 * 配列をランダムにシャッフルする（Fisher-Yates アルゴリズム）
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * GET /api/quiz/random?userId={userId}&limit=3
 * ユーザーが作成した物語からランダムに指定件数（デフォルト3件）を取得し、
 * 各物語の全設定単語を含む穴埋めクイズ用データを返却する
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get("userId");
    const limitParam = searchParams.get("limit");

    // 1. バリデーション: userId は必須
    if (!userIdParam) {
      return NextResponse.json(
        { success: false, error: "ユーザーID（userId）が指定されていません" },
        { status: 400 },
      );
    }

    const userId = Number(userIdParam);
    if (isNaN(userId) || userId <= 0) {
      return NextResponse.json(
        { success: false, error: "ユーザーID（userId）が指定されていません" },
        { status: 400 },
      );
    }

    // 取得件数（デフォルト 3 件）
    const parsedLimit = limitParam ? Number(limitParam) : 3;
    const limit = isNaN(parsedLimit) || parsedLimit <= 0 ? 3 : parsedLimit;

    // 2. Supabase クライアント初期化
    const supabase = await createClient();

    // 3. stories テーブルからユーザーの物語一覧を取得
    const { data: userStories, error: storiesError } = await supabase
      .from("stories")
      .select("story_id, title, story, japanese_story, image_url, created_at")
      .eq("user_id", userId);

    if (storiesError) {
      console.error("stories 取得エラー:", storiesError);
      return NextResponse.json(
        { success: false, error: "クイズデータの取得に失敗しました" },
        { status: 500 },
      );
    }

    // 物語が 0 件の場合は 404 を返却
    if (!userStories || userStories.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "クイズを出題できる物語が登録されていません",
        },
        { status: 404 },
      );
    }

    // 4. 物語をランダムにシャッフルし、最大 limit 件選定
    const shuffledStories = shuffleArray(userStories);
    const selectedStories = shuffledStories.slice(0, limit);
    const selectedStoryIds = selectedStories.map((s) => s.story_id);

    // 5. 選出された物語に関連する単語と活用形（surfaces）を meaning_story テーブルから取得
    const { data: relationsData, error: relationsError } = await supabase
      .from("meaning_story")
      .select(
        `
        story_id,
        meaning_id,
        surfaces,
        meanings (
          meaning_id,
          meaning,
          words (
            word_id,
            word
          )
        )
      `,
      )
      .in("story_id", selectedStoryIds);

    if (relationsError) {
      console.error("meaning_story 取得エラー:", relationsError);
      return NextResponse.json(
        { success: false, error: "クイズデータの取得に失敗しました" },
        { status: 500 },
      );
    }

    // 6. 単語データを story_id ごとにマッピング
    const wordsByStoryId = new Map<number, QuizWord[]>();
    for (const item of (relationsData || []) as any[]) {
      const meaningObj = Array.isArray(item.meanings)
        ? item.meanings[0]
        : item.meanings;
      const wordObj = meaningObj
        ? Array.isArray(meaningObj.words)
          ? meaningObj.words[0]
          : meaningObj.words
        : null;

      const wordItem: QuizWord = {
        meaningId: item.meaning_id,
        wordId: wordObj?.word_id ?? 0,
        word: wordObj?.word ?? "",
        meaning: meaningObj?.meaning ?? "",
        surfaces: Array.isArray(item.surfaces) ? item.surfaces : [],
      };

      if (!wordsByStoryId.has(item.story_id)) {
        wordsByStoryId.set(item.story_id, []);
      }
      wordsByStoryId.get(item.story_id)!.push(wordItem);
    }

    // 7. 出題順（シャッフル順）を保ったまま物語リストを構築
    const resultStories: QuizStory[] = selectedStories.map((story) => ({
      storyId: story.story_id,
      title: story.title ?? "",
      story: story.story ?? "",
      japaneseStory: story.japanese_story ?? "",
      imageUrl: story.image_url ?? null,
      words: wordsByStoryId.get(story.story_id) || [],
    }));

    const responseData: QuizResponseData = {
      totalStories: resultStories.length,
      stories: resultStories,
    };

    return NextResponse.json(
      {
        success: true,
        data: responseData,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("クイズAPI予期せぬエラー:", error);
    return NextResponse.json(
      { success: false, error: "クイズデータの取得に失敗しました" },
      { status: 500 },
    );
  }
}
