'use client';

import React from 'react';
import type { StoryDetailWord } from "@/app/api/stories/[id]/route";
import "./DetailStoryEnglishView.css";
import "../app/globals.css";

interface DetailStoryEnglishViewProps {
  title: string;
  imageUrl?: string | null;
  story: string;
  words?: StoryDetailWord[];
}

export default function DetailStoryEnglishView({
  title,
  imageUrl,
  story,
  words = [],
}: DetailStoryEnglishViewProps) {

  // 返り値: 本文中の学習対象語をハイライトしたReactノードの配列
  const renderHighlightedStory = () => {
    const allSurfaces = Array.from(
      new Map(
        words
          .flatMap((wordInfo) => wordInfo.surfaces || [])
          .map((surface) => surface.trim())
          .filter(Boolean)
          .map((surface) => [
            surface.toLocaleLowerCase(),
            surface,
          ] as const),
      ).values(),
    );

    if (allSurfaces.length === 0) {
      return story;
    }

    const sortedSurfaces = [...allSurfaces].sort(
      (a, b) => b.length - a.length
    );

    const escapedTerms = sortedSurfaces.map((s) =>
      s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );

    const regex = new RegExp(
      `(?<![A-Za-z])(?:${escapedTerms.join("|")})(?![A-Za-z])`,
      "gi",
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
    <div className="storyView">

      {/* 物語タイトル */}
      <h1 className="storyTitleCard">

        {title || "無題の物語"}
      </h1>

      <div className="storyCard">

        {imageUrl && (
          <img
            className="storyImage"
            src={imageUrl}
            alt="物語のイメージ画像"
          />
        )}

        {/* ハイライト付き英文本文 */}
        <div className="storyTextBox">
          <p className="storyText">
            {renderHighlightedStory()}
          </p>
        </div>
      </div>
    </div>
  );
}