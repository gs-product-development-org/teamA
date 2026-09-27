"use client";

import type { StoryDetailWord } from "@/app/api/stories/[id]/route";
import "./storyJapaneseView.css";

type Props = {
  japaneseStory: string;
  words: StoryDetailWord[];
};

export default function StoryJapaneseViews({
  japaneseStory,
  words,
}: Props) {
  return (
    <div className="japaneseView">
      <div className="japaneseStoryBox">
  <p className="japaneseStory">{japaneseStory}</p>
      </div>

      {words && words.length > 0 && (
        <div className="japaneseWordSection">
          <div className="wordGrid">
            {words.map((word) => (
              <div key={word.meaningId} className="japaneseWordItem">
                <span className="wordEnglish">{word.english}</span>
                <span className="wordDivider">:</span>
                <span className="wordJapanese">{word.japanese}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}