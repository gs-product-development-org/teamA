"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { StoryDetailResponse } from "@/app/api/stories/[id]/route";
import styles from "./page.module.css";
import StoryJapaneseViews from "@/components/storyJapaneseView";
import DetailStoryEnglishView from "@/components/DetailStoryEnglishView";
import Loading from "@/components/Loading";
import Link from "next/link";

export default function StoryDetailPages() {
  const params = useParams();
  const id = params.id;

  const [story, setStory] = useState<StoryDetailResponse | null>(null);
  const [isJapaneseVisible, setIsJapaneseVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function getData() {
      try {
        const response = await fetch(`/api/stories/${id}`);
        if (!response.ok) {
          throw new Error("データの取得に失敗しました");
        }
        const data: StoryDetailResponse = await response.json();
        setStory(data);
      } catch (error) {
        alert("データの取得に失敗しました");
      } finally {
        setIsLoading(false);
      }
    }

    getData();
  }, [id]);

  return (
    <div className="container">
      {isLoading ? (
        <Loading />
      ) : story ? (
        <div className={styles.detailContainer}>
          {/* 戻るボタン（public/return.png） */}
          <div className={styles.navHeader}>
            <Link href="/list" className={styles.returnButtonLink}>
              <img src="/return.png" alt="戻るボタン" className={styles.returnImage} />
            </Link>
          </div>

          <div className={styles.storyFolderArea}>
            <div className={styles.storyFolderContent}>
              <DetailStoryEnglishView
                title={story.title}
                imageUrl={story.imageUrl}
                story={story.story}
                words={story.words}
              />

              {/* 和訳切り替えボタン */}
              <div className={styles.boxCenter}>
                <button
                  type="button"
                  className={styles.japaneseToggle}
                  onClick={() => setIsJapaneseVisible(!isJapaneseVisible)}
                >
                  {isJapaneseVisible ? "Hide Japanese translation ▲" : "View Japanese translation ▼"}
                </button>
              </div>

              {/* 和訳表示エリア */}
              {isJapaneseVisible && (
                <div>
                  <StoryJapaneseViews
                    japaneseStory={story.japaneseStory}
                    words={story.words}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}