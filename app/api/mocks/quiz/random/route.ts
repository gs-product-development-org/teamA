import { NextResponse } from "next/server";

export interface QuizWord {
  meaningId: number;
  wordId: number;
  word: string;
  meaning: string;
  surfaces: string[];
}

export interface QuizStory {
  storyId: number;
  title: string;
  story: string;
  japaneseStory: string;
  imageUrl: string | null;
  words: QuizWord[];
}

export interface QuizResponseData {
  totalStories: number;
  stories: QuizStory[];
}

export interface RandomQuizResponse {
  success: boolean;
  data?: QuizResponseData;
  error?: string;
}

const stories: QuizStory[] = [
  {
    storyId: 12,
    title: "騎士とドラゴンの城",
    story:
      "A brave knight drew his shiny sword. He walked into the dark castle. Suddenly, a huge dragon appeared in front of him.",
    japaneseStory:
      "勇敢な騎士は光り輝く剣を抜きました。彼は暗い城へと足を踏み入れました。突然、巨大なドラゴンが彼の目の前に現れました。",
    imageUrl: null,
    words: [
      {
        meaningId: 8,
        wordId: 6,
        word: "sword",
        meaning: "剣",
        surfaces: ["sword"],
      },
      {
        meaningId: 9,
        wordId: 7,
        word: "castle",
        meaning: "城",
        surfaces: ["castle"],
      },
      {
        meaningId: 10,
        wordId: 8,
        word: "dragon",
        meaning: "ドラゴン",
        surfaces: ["dragon"],
      },
    ],
  },
  {
    storyId: 15,
    title: "公園での朝のルーティン",
    story:
      "Every morning, I run through the green park and greet my neighbor.",
    japaneseStory:
      "毎朝、私は緑豊かな公園を走り、近所の人に挨拶をします。",
    imageUrl: null,
    words: [
      {
        meaningId: 14,
        wordId: 11,
        word: "park",
        meaning: "公園",
        surfaces: ["park"],
      },
      {
        meaningId: 15,
        wordId: 12,
        word: "greet",
        meaning: "挨拶する",
        surfaces: ["greet"],
      },
    ],
  },
  {
    storyId: 18,
    title: "不思議な図書館の秘密",
    story:
      "In the silent library, she discovered an ancient book.",
    japaneseStory:
      "静かな図書館で、彼女は一冊の古い本を見つけました。",
    imageUrl: null,
    words: [
      {
        meaningId: 21,
        wordId: 16,
        word: "library",
        meaning: "図書館",
        surfaces: ["library"],
      },
      {
        meaningId: 22,
        wordId: 17,
        word: "discover",
        meaning: "発見する",
        surfaces: ["discovered"],
      },
      {
        meaningId: 23,
        wordId: 18,
        word: "ancient",
        meaning: "古代の",
        surfaces: ["ancient"],
      },
    ],
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const requestedLimit = Number(searchParams.get("limit") || 3);

  if (!userId) {
    return NextResponse.json(
      { success: false, error: "ユーザーID（userId）が指定されていません" },
      { status: 400 },
    );
  }

  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.floor(requestedLimit)
    : 3;
  const selectedStories = stories.slice(0, limit);

  return NextResponse.json({
    success: true,
    data: {
      totalStories: selectedStories.length,
      stories: selectedStories,
    },
  } satisfies RandomQuizResponse);
}
