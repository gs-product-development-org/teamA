'use client';

import React from 'react';

import "./StoryEnglishView.css";

export interface StoryWordInfo {
  meaningId: number;
  word: string;
  surfaces: string[];
}

interface StoryEnglishViewProps {
  title: string;
  story: string;
  words: StoryWordInfo[];
  imageUrl?: string;

  onRegenerateStory?: () => void;
  onRegenerateImage?: () => void;

  isImageLoading?: boolean;
  isStoryLoading?: boolean;
}

export default function StoryEnglishView({
  title,
  story,
  words = [],
  imageUrl,
  onRegenerateStory,
  onRegenerateImage,
  isImageLoading,
  isStoryLoading,
}: StoryEnglishViewProps) {

  // 返り値: 本文中の学習対象語をハイライトしたReactノードの配列
  const renderHighlightedStory = () => {
    const allSurfaces = Array.from(
      new Map(
        words
          .flatMap((wordInfo) => wordInfo.surfaces || [])
          .map((surface) => surface.trim())
          .filter(Boolean)
          .map((surface) => [surface.toLocaleLowerCase(), surface] as const),
      ).values(),
    );

    if (allSurfaces.length === 0) {
      return story;
    }

    const sortedSurfaces = [...allSurfaces].sort(
      (a, b) => b.length - a.length
    );

    const escapedTerms = sortedSurfaces.map((s) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );

    const regex = new RegExp(
      `(?<![A-Za-z])(?:${escapedTerms.join('|')})(?![A-Za-z])`,
      'gi',
    );

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    for (const match of story.matchAll(regex)) {
      const matchedText = match[0];
      const matchIndex = match.index ?? 0;

      if (matchIndex > lastIndex) {
        parts.push(story.slice(lastIndex, matchIndex));
      }

      parts.push(
        <mark
          key={`${matchIndex}-${matchedText}`}
          className="highlight"
        >
          {matchedText}
        </mark>,
      );

      lastIndex = matchIndex + matchedText.length;
    }

    if (lastIndex < story.length) {
      parts.push(story.slice(lastIndex));
    }

    return parts;
  };

  return (
    <div className="storyContainer">

        {/* 物語タイトル */}
        <div className="titleBox">
          <h2 className="title">
            {title || "無題の物語"}
          </h2>
        </div>

       <div className="storyContents">

  {imageUrl && (
    <div className="imageContainer">

      <button
        type="button"
        onClick={onRegenerateImage}
        disabled={isImageLoading || isStoryLoading}
        className="regenerateImageButton"
      >
        <img
        src="/returnPurple.png"
        alt=""
        className="retryIcon"
      />
        {isImageLoading ? "Generating..." : "Regenerate"}
      </button>

      <img
        src={imageUrl}
        alt={title || "物語の画像"}
        className="storyImage"
      />

    </div>
  )}

  <div className="storyTextContainer">

    <button
      type="button"
      onClick={onRegenerateStory}
      disabled={isStoryLoading || isImageLoading}
      className="regenerateStoryButton"
    >
      <img
        src="/returnPurple.png"
        alt=""
        className="retryIcon"
      />
      Regenerate
    </button>

    <p className="storyText">
      {renderHighlightedStory()}
    </p>

  </div>

        {/* 登場単語のタグ一覧 */}
        {words.length > 0 && (
          <div className="wordList">
            <span className="wordLabel">対象単語:</span>

            {words.map((item) => (
              <span
                key={item.meaningId}
                className="wordTag"
              >
                {item.word}

                {item.surfaces?.[0] &&
                  item.surfaces[0].toLowerCase() !==
                    item.word.toLowerCase() && (
                    <span className="surface">
                      ({item.surfaces[0]})
                    </span>
                  )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}