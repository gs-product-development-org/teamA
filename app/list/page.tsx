"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { WordsListResponse } from "@/app/api/words/route";
import "../globals.css";
import styles from "./page.module.css";
import Loading from "@/components/Loading";

type Tab = "story" | "word";

type GroupedWord = {
  word_id: number;
  english: string;
  meanings:Meaning[];
};

type Meaning={
  meaning_id:number;
  meaning:string;
}

type Story={
  id:number;
  title:string;
  content:string;
  imageUrl?: string | null;
};

export default function Tabs() {
  //検索キーワード
  const [searchWord, setSearchWord] = useState("");
  // 現在表示しているタブ
  const [activeTab, setActiveTab] = useState<Tab>("story");
  //単語データ
  const [words,setWords]=useState<GroupedWord[]>([]);
  //物語データ
  const [stories,setStories]=useState<Story[]>([]);
  //ローディング
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function getData() {
      try{
        const response = await fetch("/api/words?userId=1");

        if (!response.ok) {
          throw new Error("データの取得に失敗しました");
        }

        const data: WordsListResponse = await response.json();


        //同じ英単語の意味を配列に保持
        const groupedWords = data.words.reduce<GroupedWord[]>((result, word) => {
          const existingWord = result.find(
            (item) => item.word_id === word.word_id
          );

          if (existingWord) {
            existingWord.meanings.push({ meaning_id: word.meaning_id, meaning: word.japanese, });
          } else {
            result.push({
              word_id: word.word_id,
              english: word.english, 
              meanings: [ { meaning_id: word.meaning_id, meaning: word.japanese, }, ], });
          }

          return result;
        }, []);

        setWords(groupedWords);
        //物語データの取得
        setStories(data.stories);
      } catch (error) {
        alert("予期しないエラーが発生しました");
      } finally {
        // ローディング終了
        setIsLoading(false);
      }
    }
    getData();
  }, []);

  const filteredStories = stories.filter(
    (story) =>
      story.title.includes(searchWord) ||
      story.content.includes(searchWord)
  );

  const filteredWords = words.filter(
    (word) =>
      word.english.includes(searchWord) ||
      word.meanings.some((meaning) =>
        meaning.meaning.includes(searchWord)
      )
  );
  
  return (
    <div className="container">
      {/* <Link href="/register">
        <p>物語登録画面へ</p>
      </Link> */}
      <div className={styles.boxCenter}>
        <input
          className={styles.searchInput}
          type="text"
          value={searchWord}
          onChange={(e) => setSearchWord(e.target.value)}
          placeholder="Search..."
        />
      </div>
      {/* 重なりファイルフォルダー風タブ切り替え */}
      <div className={styles.tabsContainer}>
        <button
          type="button"
          className={`${styles.storyTab} ${
            activeTab === "story" ? styles.active : styles.inactive
          }`}
          onClick={() => setActiveTab("story")}
        >
          <span>Stories</span>
        </button>

        <button
          type="button"
          className={`${styles.wordTab} ${
            activeTab === "word" ? styles.active : styles.inactive
          }`}
          onClick={() => setActiveTab("word")}
        >
          <span>Words</span>
        </button>
      </div>

      <div>
        {activeTab === "story" && (
          <div className={styles.storyArea}>
            <div className={styles.story}>
              {isLoading ? (
                <Loading />
              ) : (
                filteredStories.map((story) => (
                  <div key={story.id} className={styles.storyContainer}>
                    <Link href={`/list/${story.id}`}>
                      <div className={styles.storyTitle}>
                        <h3 className={styles.title}>{story.title}</h3>  
                        <span className={styles.titleLink}>▶</span>
                      </div>
                      <div className={styles.storyDetail}>
                        {story.imageUrl && (
                          <img
                            className={styles.storyImage}
                            src={story.imageUrl}
                            alt="物語のイメージ画像"
                          />
                        )} 
                        <p className={styles.storyText}>{story.content}</p>
                      </div>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "word" && (
          <div className={styles.wordArea}>
            <div className={styles.wordList}>
              {isLoading ? (
                <Loading />
              ) : filteredWords.length === 0 ? (
                <div className={styles.emptyWordMessage}>単語が見つかりませんでした</div>
              ) : (
                filteredWords.map((word) => (
                  <div key={word.word_id} className={styles.wordCard}>
                    <div className={styles.wordEnglish}>
                      <span className={styles.wordDot}>•</span>
                      <span className={styles.englishText}>{word.english}</span>
                    </div>
                    <div className={styles.meaningsContainer}>
                      {word.meanings.map((meaning) => (
                        <span key={meaning.meaning_id} className={styles.meaningTag}>
                          {meaning.meaning}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
