/**
 * test/test-all-apis.mjs
 * スト単（StoTan）全 API 統合・セキュリティ自動テストスイート
 *
 * 実行方法: node test/test-all-apis.mjs
 */

const BASE_URL = "http://localhost:3000";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
    if (detail) console.log(`     └─ ${detail}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (detail) console.error(`     └─ エラー詳細: ${detail}`);
  }
}

async function runAllTests() {
  console.log(
    "===============================================================",
  );
  console.log("🚀 スト単 (StoTan) 全 API 統合・セキュリティ自動テスト");
  console.log(`   ターゲット: ${BASE_URL}`);
  console.log(
    "===============================================================\n",
  );

  const timestamp = Date.now();
  let createdStoryId = null;

  // ==============================================================
  // 1. 単語登録 API (POST /api/words)
  // ==============================================================
  console.log("【1. 単語登録 API (POST /api/words)】");

  // 1-1. 正常系: 正常な単語登録
  try {
    const res = await fetch(`${BASE_URL}/api/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: 1,
        words: [{ english: `testword${timestamp}`, japanese: "テスト意味" }],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true && Array.isArray(data.data),
      "1-1. 正常系: 単語と意味の登録が成功すること (200 OK)",
      `status: ${res.status}, words: ${data.data?.length}`,
    );
  } catch (err) {
    assert(false, "1-1. 正常系: 単語登録", err.message);
  }

  // 1-2. 異常系: 6単語以上（制限オーバー）
  try {
    const tooManyWords = Array.from({ length: 6 }, (_, i) => ({
      english: `word${i}`,
      japanese: `意味${i}`,
    }));
    const res = await fetch(`${BASE_URL}/api/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: 1, words: tooManyWords }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.success === false,
      "1-2. 可用性: 6単語以上の一括登録を拒絶すること (400 Bad Request)",
      `error: ${data.error}`,
    );
  } catch (err) {
    assert(false, "1-2. 異常系: 6単語以上", err.message);
  }

  // 1-3. 異常系: 46文字以上の単語（文字数オーバー）
  try {
    const res = await fetch(`${BASE_URL}/api/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: 1,
        words: [{ english: "a".repeat(46), japanese: "意味" }],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.success === false,
      "1-3. 可用性: 46文字以上の長大単語を拒絶すること (400 Bad Request)",
      `error: ${data.error}`,
    );
  } catch (err) {
    assert(false, "1-3. 異常系: 46文字以上", err.message);
  }

  // ==============================================================
  // 2. 単語・物語一覧取得 API (GET /api/words)
  // ==============================================================
  console.log("\n【2. 単語・物語一覧取得 API (GET /api/words)】");

  // 2-1. 正常系: userId=1
  try {
    const res = await fetch(`${BASE_URL}/api/words?userId=1`);
    const data = await res.json();
    assert(
      res.status === 200 &&
        Array.isArray(data.words) &&
        Array.isArray(data.stories),
      "2-1. 正常系: 単語と物語の一覧を取得できること (200 OK)",
      `単語数: ${data.words?.length}, 物語数: ${data.stories?.length}`,
    );
  } catch (err) {
    assert(false, "2-1. 正常系: 一覧取得", err.message);
  }

  // 2-2. 可用性・フェイルセーフ: userId 省略時にデフォルト1で動作
  try {
    const res = await fetch(`${BASE_URL}/api/words`);
    const data = await res.json();
    assert(
      res.status === 200 && Array.isArray(data.words),
      "2-2. 可用性: userId クエリ省略時にデフォルト1へ安全にフォールバックすること (200 OK)",
      `単語数: ${data.words?.length}`,
    );
  } catch (err) {
    assert(false, "2-2. 可用性: フェイルセーフ", err.message);
  }

  // ==============================================================
  // 3. 単語翻訳 API (POST /api/words/translate)
  // ==============================================================
  console.log("\n【3. 単語翻訳 API (POST /api/words/translate)】");

  // 3-1. 正常系: 実在単語の翻訳候補生成
  try {
    const res = await fetch(`${BASE_URL}/api/words/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: ["apple"] }),
    });
    const data = await res.json();
    const hasApple = data.translations?.some(
      (t) => t.english.toLowerCase() === "apple",
    );
    assert(
      res.status === 200 && hasApple,
      "3-1. 正常系: 実在する英単語の翻訳候補が取得できること (200 OK)",
      `候補: ${JSON.stringify(data.translations?.[0]?.options?.slice(0, 3))}`,
    );
  } catch (err) {
    assert(false, "3-1. 正常系: 単語翻訳", err.message);
  }

  // 3-2. 可用性・DoS対策: 46文字以上の単語の拒絶
  try {
    const res = await fetch(`${BASE_URL}/api/words/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: ["x".repeat(46)] }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.includes("45文字以内"),
      "3-2. 可用性: 46文字以上の長大単語の翻訳を拒絶すること (400 Bad Request)",
      `error: ${data.error}`,
    );
  } catch (err) {
    assert(false, "3-2. 可用性: 翻訳DoS防止", err.message);
  }

  // ==============================================================
  // 4. 物語生成 API (POST /api/stories/generate)
  // ==============================================================
  console.log("\n【4. 物語生成 API (POST /api/stories/generate)】");

  // 4-1. 正常系: 許可ジャンル「日常」でのショートストーリー生成
  try {
    const res = await fetch(`${BASE_URL}/api/stories/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genre: "日常",
        words: [
          { meaningId: 1, word: "walk", meaning: "歩く" },
          { meaningId: 2, word: "park", meaning: "公園" },
        ],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.title && data.story && data.japaneseStory,
      "4-1. 正常系: 指定ジャンルと単語から物語・和訳が生成されること (200 OK)",
      `タイトル: "${data.title}"`,
    );
  } catch (err) {
    assert(false, "4-1. 正常系: 物語生成", err.message);
  }

  // 4-2. 完全性・プロンプトインジェクション対策: 不正ジャンルの拒絶
  try {
    const res = await fetch(`${BASE_URL}/api/stories/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genre: "悪意のあるプロンプトインジェクション自由記述",
        words: [{ meaningId: 1, word: "test", meaning: "テスト" }],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.includes("ジャンル"),
      "4-2. 完全性: ホワイトリスト外の不正ジャンルを確実に遮断すること (400 Bad Request)",
      `error: ${data.error}`,
    );
  } catch (err) {
    assert(false, "4-2. 完全性: 不正ジャンル拒絶", err.message);
  }

  // 4-3. 可用性・DoS対策: 単語文字数オーバーの拒絶
  try {
    const res = await fetch(`${BASE_URL}/api/stories/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        genre: "日常",
        words: [{ meaningId: 1, word: "w".repeat(46), meaning: "テスト" }],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.includes("45文字以内"),
      "4-3. 可用性: 46文字以上の単語での物語生成を拒絶すること (400 Bad Request)",
      `error: ${data.error}`,
    );
  } catch (err) {
    assert(false, "4-3. 可用性: 単語文字数上限", err.message);
  }

  // ==============================================================
  // 5. 物語登録 API (POST /api/stories)
  // ==============================================================
  console.log("\n【5. 物語登録 API (POST /api/stories)】");

  // 5-1. 正常系: 物語の保存
  try {
    const res = await fetch(`${BASE_URL}/api/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: 1,
        title: `テスト物語_${timestamp}`,
        story:
          "This is a comprehensive test story for validation verification.",
        japaneseStory: "これはバリデーション検証のための総合テスト用物語です。",
        words: [],
      }),
    });
    const data = await res.json();
    createdStoryId = data.data?.storyId;
    assert(
      res.status === 200 && data.success === true && createdStoryId,
      "5-1. 正常系: 物語が正常にデータベースへ登録されること (200 OK)",
      `登録された storyId: ${createdStoryId}`,
    );
  } catch (err) {
    assert(false, "5-1. 正常系: 物語登録", err.message);
  }

  // 5-2. 可用性・DB肥大化防止: 101文字以上のタイトル拒絶
  try {
    const res = await fetch(`${BASE_URL}/api/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: 1,
        title: "あ".repeat(101),
        story: "Short story.",
        words: [],
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.includes("100文字以内"),
      "5-2. 可用性: 101文字以上の長大タイトルを拒絶すること (400 Bad Request)",
      `error: ${data.error}`,
    );
  } catch (err) {
    assert(false, "5-2. 可用性: タイトル上限", err.message);
  }

  // ==============================================================
  // 6. 物語詳細取得 API (GET /api/stories/[id])
  // ==============================================================
  console.log("\n【6. 物語詳細取得 API (GET /api/stories/[id])】");

  // 6-1. 正常系: 登録した物語の詳細取得
  if (createdStoryId) {
    try {
      const res = await fetch(`${BASE_URL}/api/stories/${createdStoryId}`);
      const data = await res.json();
      assert(
        res.status === 200 && data.storyId === createdStoryId && data.title,
        "6-1. 正常系: 物語IDから本文・和訳・詳細を取得できること (200 OK)",
        `タイトル: "${data.title}"`,
      );
    } catch (err) {
      assert(false, "6-1. 正常系: 物語詳細取得", err.message);
    }
  }

  // 6-2. 異常系: 存在しない物語ID
  try {
    const res = await fetch(`${BASE_URL}/api/stories/9999999`);
    assert(
      res.status === 404,
      "6-2. 異常系: 存在しない物語IDで 404 Not Found が返ること",
      `status: ${res.status}`,
    );
  } catch (err) {
    assert(false, "6-2. 異常系: 存在しない物語", err.message);
  }

  // ==============================================================
  // 7. ランダム物語クイズ取得 API (GET /api/quiz/random)
  // ==============================================================
  console.log("\n【7. ランダム物語クイズ取得 API (GET /api/quiz/random)】");

  // 7-1. 正常系: 3話ランダム取得
  try {
    const res = await fetch(`${BASE_URL}/api/quiz/random?userId=1&limit=3`);
    const data = await res.json();
    assert(
      res.status === 200 &&
        data.success === true &&
        data.data?.stories?.length > 0,
      "7-1. 正常系: ランダムに物語クイズデータを取得できること (200 OK)",
      `取得物語数: ${data.data?.stories?.length} 話`,
    );
  } catch (err) {
    assert(false, "7-1. 正常系: クイズ取得", err.message);
  }

  // 7-2. 異常系: userId 未指定
  try {
    const res = await fetch(`${BASE_URL}/api/quiz/random`);
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.includes("userId"),
      "7-2. 異常系: userId 未指定時に 400 Bad Request を返却すること",
      `error: ${data.error}`,
    );
  } catch (err) {
    assert(false, "7-2. 異常系: userId 未指定", err.message);
  }

  // ==============================================================
  // 総括サマリー
  // ==============================================================
  console.log(
    "\n===============================================================",
  );
  console.log("📊 テスト結果サマリー");
  console.log(
    "===============================================================",
  );
  console.log(`  総テスト数 : ${totalTests}`);
  console.log(`  合格 (PASS): ${passedTests}`);
  console.log(`  失敗 (FAIL): ${failedTests}`);
  console.log(
    "===============================================================",
  );

  if (failedTests === 0) {
    console.log("🎉 すべてのテストケースが正常に PASS しました！");
  } else {
    console.error(`⚠️ ${failedTests} 件のテストが失敗しました。`);
  }
}

runAllTests().catch(console.error);
