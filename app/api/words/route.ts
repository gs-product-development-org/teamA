import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateWordInput } from "@/lib/validations/word";

/**
 * フロントエンドから送信される単語情報の型定義
 */
export interface WordInput {
  english: string;
  japanese: string;
}

/**
 * フロントエンドから送信される単語登録リクエストの型定義
 */
export interface RegisterWordsRequest {
  userId: number;
  words: WordInput[];
}

/**
 * DBに登録された単語情報の型定義
 */
export interface SavedWord {
  meaning_id: number;
  word_id: number;
  english: string;
  japanese: string;
}

/**
 * 一覧取得で返すストーリーの型定義
 */
export interface StoryItem {
  id: number;
  title: string;
  content: string;
  imageUrl?: string | null;
}

/**
 * 一覧取得で返す単語の型定義
 */
export interface WordListItem {
  id: number;
  meaning_id: number;
  word_id: number;
  english: string;
  japanese: string;
}

/**
 * 一覧取得のレスポンスボディの型定義
 */
export interface WordsListResponse {
  stories: StoryItem[];
  words: WordListItem[];
}

/**
 * POST ハンドラー (API Endpoint: POST /api/words)
 * フロントエンドから送信された単語情報を受け取り、Supabase の words, meanings, user_meaning テーブルに登録する
 *
 * Request: JSON { "userId": 1, "words": [ { "english": "spring", "japanese": "春" } ] }
 * Response: JSON { "success": true, "data": [ { "meaning_id": 1, ... } ] }
 */
//POST /api/wordsでアクセスしてきたときに実行される関数
export async function POST(request: Request) {
  try {
    const body: Partial<RegisterWordsRequest> = await request.json();

    // 1. リクエストボディの基本チェック(userId, words 配列の存在確認)
    if (!body || !body.userId) {
      return NextResponse.json(
        {
          success: false,
          error: "ユーザーID（userId）が指定されていません",
        },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.words) || body.words.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "登録する単語の配列（words）が指定されていません",
        },
        { status: 400 },
      );
    }
    if (body.words.length > 5) {
      return NextResponse.json(
        {
          success: false,
          error: "一度に登録できる単語は最大5個までです",
        },
        { status: 400 },
      );
    }

    const userId = body.userId;

    // 2. 各単語のバリデーションチェック（空文字、45文字上限）
    for (const item of body.words) {
      const validation = validateWordInput(item.english, item.japanese);
      if (!validation.isValid) {
        return NextResponse.json(
          {
            success: false,
            error: validation.error || "入力内容に不備があります",
          },
          { status: 400 },
        );
      }
    }

    // 3. Supabase への接続
    const supabase = await createClient();
    //今回登録できた単語の情報を格納する配列
    const savedWords: SavedWord[] = [];

    // 4. 単語ごとに words, meanings, user_meaning へ順次登録
    for (const item of body.words) {
      const trimmedEnglish = item.english.trim();
      const trimmedJapanese = item.japanese.trim();

      // --- ① words テーブル（英単語そのもの：既存があれば再利用） ---
      let wordId: number;

      //supabaseが返してきたdataとerrorを分割代入している
      const { data: existingWord, error: wordSelectError } = await supabase
        .from("words") //wordsテーブルからデータを取得
        .select("word_id") //word_idカラムを取得
        .eq("word", trimmedEnglish) //wordカラムがtrimmedEnglishと一致する行を取得
        .maybeSingle(); //一致する行がなければnullを返す

      //もしエラーが発生した場合
      if (wordSelectError) {
        return NextResponse.json(
          { success: false, error: "単語データの確認に失敗しました" },
          { status: 500 },
        );
      }
      //もし既存の単語が存在する場合
      if (existingWord) {
        // 既存の word_id を再利用
        wordId = existingWord.word_id;
      } else {
        // 存在しない場合は新規作成
        const { data: newWord, error: wordInsertError } = await supabase
          .from("words")
          .insert({ word: trimmedEnglish })
          .select("word_id")
          .single();

        if (wordInsertError || !newWord) {
          return NextResponse.json(
            { success: false, error: "単語の登録に失敗しました" },
            { status: 500 },
          );
        }
        wordId = newWord.word_id;
      }

      // --- ② meanings テーブル（日本語の意味：同じ word_id に同じ意味があれば再利用） ---
      let meaningId: number;

      const { data: existingMeaning, error: meaningSelectError } =
        await supabase
          .from("meanings")
          .select("meaning_id")
          .eq("word_id", wordId)
          .eq("meaning", trimmedJapanese)
          .maybeSingle();

      //もしエラーが発生した場合
      if (meaningSelectError) {
        return NextResponse.json(
          { success: false, error: "意味データの確認に失敗しました" },
          { status: 500 },
        );
      }
      //もし既存の意味が存在する場合
      if (existingMeaning) {
        // 既存の meaning_id を再利用
        meaningId = existingMeaning.meaning_id;
      } else {
        // 新規作成（同じ word_id に同じ意味がない場合のみ）
        const { data: newMeaning, error: meaningInsertError } = await supabase
          .from("meanings")
          .insert({
            word_id: wordId,
            meaning: trimmedJapanese,
          })
          .select("meaning_id")
          .single();

        if (meaningInsertError || !newMeaning) {
          return NextResponse.json(
            { success: false, error: "意味の登録に失敗しました" },
            { status: 500 },
          );
        }
        meaningId = newMeaning.meaning_id;
      }

      // --- ③ user_meaning テーブル（ユーザー単語帳への紐付け：重複防止） ---
      const { data: existingUserMeaning, error: userMeaningSelectError } =
        await supabase
          .from("user_meaning")
          .select("meaning_id")
          .eq("user_id", userId)
          .eq("meaning_id", meaningId)
          .maybeSingle();

      //もしエラーが発生した場合
      if (userMeaningSelectError) {
        return NextResponse.json(
          { success: false, error: "ユーザー単語帳の確認に失敗しました" },
          { status: 500 },
        );
      }
      //もし既存のユーザー単語帳に意味が存在しない場合
      if (!existingUserMeaning) {
        const { error: userMeaningInsertError } = await supabase
          .from("user_meaning")
          .insert({
            user_id: userId,
            meaning_id: meaningId,
          });

        if (userMeaningInsertError) {
          return NextResponse.json(
            { success: false, error: "ユーザー単語帳への登録に失敗しました" },
            { status: 500 },
          );
        }
      }

      // 保存された単語の情報をリストに追加
      savedWords.push({
        meaning_id: meaningId,
        word_id: wordId,
        english: trimmedEnglish,
        japanese: trimmedJapanese,
      });
    }

    // 成功レスポンス（200 OK）
    return NextResponse.json({
      success: true,
      data: savedWords,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "単語の登録処理中に予期せぬエラーが発生しました",
      },
      { status: 500 },
    );
  }
}

/**
 * GET ハンドラー (API Endpoint: GET /api/words)
 * ログイン中のユーザーが登録した単語一覧（および物語一覧）を取得します。
 * user_meaning から自分の行を取得し、meanings → words を JOIN して英語と日本語のペアに整形します。
 *
 * Query: ?userId=1 (省略時はデフォルト 1)
 * Response: JSON { "stories": [...], "words": [ { "id": 1, "english": "fish", "japanese": "魚" } ] }
 */
//GET /api/wordsでアクセスしてきたときに実行される関数
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // クエリパラメータから userId を取得（省略時や不正な値の場合は安全にデフォルト 1 へフォールバック）
    const parsedUserId = Number(searchParams.get("userId"));
    const userId = isNaN(parsedUserId) || parsedUserId <= 0 ? 1 : parsedUserId;
    //Supabase へ接続
    const supabase = await createClient();

    // 1. user_meaning から自分の単語一覧を取得（meanings, words と JOIN）
    const { data: userMeaningsData, error: userMeaningsError } = await supabase
      .from("user_meaning")
      .select(
        `
        meaning_id,
        created_at,
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
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (userMeaningsError) {
      return NextResponse.json(
        { error: "単語一覧の取得に失敗しました" },
        { status: 500 },
      );
    }

    // 取得したデータをフロントエンドの形式 { id, english, japanese } に整形
    const words: WordListItem[] = (userMeaningsData || [])
      //取ってきた単語を一つずつ取り出す
      .map((item: any) => {
        // meanings 配列の最初の要素を取得（存在しない場合は null）
        const meaningObj = Array.isArray(item.meanings)
          ? item.meanings[0] // meanings 配列の最初の要素を取得
          : item.meanings; // meanings が配列でない場合はそのまま使用
        // words 配列の最初の要素を取得（存在しない場合は null）
        const wordObj = meaningObj
          ? Array.isArray(meaningObj.words)
            ? meaningObj.words[0] // words 配列の最初の要素を取得
            : meaningObj.words /// words が配列でない場合はそのまま使用
          : null;

        return {
          id: item.meaning_id,
          meaning_id: item.meaning_id,
          word_id: wordObj?.word_id ?? 0,
          english: wordObj?.word ?? "",
          japanese: meaningObj?.meaning ?? "",
        };
      })
      //もし英語または日本語が空文字の場合は除外する
      .filter((w) => w.english && w.japanese);

    // 2. stories テーブルからユーザーの物語一覧を取得
    const { data: storiesData, error: storiesError } = await supabase
      .from("stories")
      .select("story_id, title, story, image_url")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const stories: StoryItem[] = (storiesData || []).map((s: any) => ({
      id: s.story_id,
      title: s.title || "無題の物語",
      content: s.story || "",
      imageUrl: s.image_url ?? null,
    }));

    // フロントエンドの MocksResponse と完全に同じ形式で返却
    const responseData: WordsListResponse = {
      stories,
      words,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    return NextResponse.json(
      { error: "一覧データの取得処理中に予期せぬエラーが発生しました" },
      { status: 500 },
    );
  }
}
