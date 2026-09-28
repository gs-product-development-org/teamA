'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';

interface CameraOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyWords: (selectedWords: string[]) => void;
}

export default function CameraOcrModal({
  isOpen,
  onClose,
  onApplyWords,
}: CameraOcrModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [detectedWords, setDetectedWords] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState<string>('');
  const [ocrError, setOcrError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // カメラの起動処理
  const startCamera = async () => {
    setCameraError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('カメラの起動に失敗しました:', err);
      setCameraError(
        'Could not access camera. Please try selecting or uploading a photo below.'
      );
    }
  };

  // カメラの停止処理
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  // 全ての状態を初期化（リセット）する処理
  const resetAllStates = () => {
    stopCamera();
    setCapturedImage(null);
    setDetectedWords([]);
    setSelectedWords([]);
    setOcrError('');
    setOcrProgress(0);
    setCameraError('');
    setIsAnalyzing(false);
  };

  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    } else if (!isOpen) {
      resetAllStates();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, capturedImage]);

  if (!isOpen) return null;

  // 写真をシャッター（撮影）する処理
  const handleCapture = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    setCapturedImage(dataUrl);
    analyzeImageClientSide(dataUrl);
  };

  // ファイルから画像を選択したときの処理
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = ''; // 次回同一ファイル選択対応

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        stopCamera();
        setCapturedImage(dataUrl);
        analyzeImageClientSide(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // フロントエンドで完結する Tesseract.js による OCR 解析処理
  const analyzeImageClientSide = async (dataUrl: string) => {
    setIsAnalyzing(true);
    setOcrProgress(0);
    setOcrError('');
    setDetectedWords([]);
    setSelectedWords([]);

    try {
      // フロントエンド上のブラウザ内で Tesseract ワーカーを初期化
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });

      // 画像のテキスト認識を実行
      const { data } = await worker.recognize(dataUrl);
      await worker.terminate();

      const fullText = data.text || '';

      // 正規表現で2文字以上45文字以内の半角英単語を抽出
      const matches = fullText.match(/\b[a-zA-Z]{2,45}\b/g) || [];

      // 小文字化して重複を除外
      const cleanedWords = Array.from(
        new Set(matches.map((w) => w.toLowerCase()))
      );

      setDetectedWords(cleanedWords);

      // 初期状態で最大5個まで自動選択
      setSelectedWords(cleanedWords.slice(0, 5));
    } catch (err: unknown) {
      console.error('クライアントサイドOCRエラー:', err);
      const message = err instanceof Error ? err.message : '';
      setOcrError(message || 'Failed to recognize text from image.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 単語選択のトグル処理（上限5個）
  const toggleWordSelection = (word: string) => {
    if (selectedWords.includes(word)) {
      setSelectedWords((prev) => prev.filter((w) => w !== word));
    } else {
      if (selectedWords.length >= 5) {
        return; // 5個制限
      }
      setSelectedWords((prev) => [...prev, word]);
    }
  };

  // 再撮影
  const handleRetake = () => {
    setCapturedImage(null);
    setDetectedWords([]);
    setSelectedWords([]);
    setOcrError('');
    setOcrProgress(0);
  };

  // 確定して親コンポーネントに選択単語を反映
  const handleApply = () => {
    onApplyWords(selectedWords);
    resetAllStates();
    onClose();
  };

  // モーダル閉じる（✕ボタン・キャンセルボタン）
  const handleModalClose = () => {
    resetAllStates();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-[393px] max-h-[90vh] rounded-2xl p-5 shadow-xl flex flex-col overflow-y-auto border border-stone-200">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-stone-100">
          <h2 className="text-base font-bold text-stone-800 flex items-center gap-2">
            <span>📷</span> Scan Words from Photo
          </h2>
          <button
            type="button"
            onClick={handleModalClose}
            className="text-stone-400 hover:text-stone-600 font-bold text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* カメラ撮影画面 */}
        {!capturedImage ? (
          <div className="flex flex-col items-center">
            {cameraError ? (
              <div className="w-full p-3 mb-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                {cameraError}
              </div>
            ) : (
              <div className="relative w-full aspect-[4/3] bg-stone-900 rounded-xl overflow-hidden mb-4 flex items-center justify-center shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 border-2 border-dashed border-sky-400/60 rounded-xl pointer-events-none flex items-center justify-center">
                  <span className="bg-stone-900/70 text-white text-[10px] px-2 py-1 rounded-md backdrop-blur-xs">
                    Fit words inside the frame
                  </span>
                </div>
              </div>
            )}

            {/* 撮影ボタン */}
            {!cameraError && (
              <button
                type="button"
                onClick={handleCapture}
                className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-sm mb-3 flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <span>📷</span> Take Photo
              </button>
            )}

            {/* ライブラリから画像選択 */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 border border-stone-300 hover:bg-stone-50 text-stone-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              Choose from Library / File
            </button>
          </div>
        ) : (
          /* 解析中・検出結果選択画面 */
          <div className="flex flex-col">
            {/* プレビュー画像（アスペクト比を維持して縦潰れ・横伸びを防止） */}
            <div className="w-full bg-stone-900 rounded-xl overflow-hidden mb-2 border border-stone-200 flex items-center justify-center min-h-[160px] max-h-[220px]">
              <img
                src={capturedImage}
                alt="Captured preview"
                className="w-full h-full max-h-[220px] object-contain"
              />
            </div>

            {/* 画像のすぐ下に横長の再撮影ボタンを配置 */}
            <button
              type="button"
              onClick={handleRetake}
              className="w-full py-2.5 mb-3 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>🔄</span>
              <span>Retake</span>
            </button>

            {/* 解析中ローディング（進捗％表示付き） */}
            {isAnalyzing && (
              <div className="py-8 flex flex-col items-center justify-center text-stone-600 gap-2">
                <div className="w-7 h-7 border-3 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-xs font-bold text-sky-700">
                  Scanning words in browser... ({ocrProgress}%)
                </p>
              </div>
            )}

            {/* OCR エラー表示 */}
            {ocrError && !isAnalyzing && (
              <div className="p-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {ocrError}
              </div>
            )}

            {/* 検出単語リスト */}
            {!isAnalyzing && !ocrError && (
              <div className="flex flex-col mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-stone-700">
                    Detected Words (Tap to select)
                  </span>
                  <span className="text-xs font-bold text-sky-600">
                    Selected: {selectedWords.length} / 5
                  </span>
                </div>

                {detectedWords.length === 0 ? (
                  <div className="p-4 bg-stone-50 rounded-xl text-center text-xs text-stone-500 border border-stone-200">
                    No English words detected.<br />Please refocus and try retaking the photo.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto p-1">
                    {detectedWords.map((word) => {
                      const isSelected = selectedWords.includes(word);
                      const isMaxReached = selectedWords.length >= 5 && !isSelected;

                      return (
                        <button
                          key={word}
                          type="button"
                          disabled={isMaxReached}
                          onClick={() => toggleWordSelection(word)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isSelected
                              ? 'bg-sky-600 border-sky-600 text-white shadow-xs'
                              : isMaxReached
                                ? 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed'
                                : 'bg-white border-stone-300 text-stone-700 hover:border-sky-400 hover:bg-sky-50 cursor-pointer'
                            }`}
                        >
                          {isSelected ? '✓ ' : ''}
                          {word}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 反映・キャンセルボタン */}
            <div className="flex gap-2 mt-auto pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={handleModalClose}
                className="flex-1 py-2.5 border border-stone-300 text-stone-600 font-bold rounded-xl text-xs hover:bg-stone-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isAnalyzing || selectedWords.length === 0}
                onClick={handleApply}
                className={`flex-1 py-2.5 font-bold rounded-xl text-xs transition-colors ${!isAnalyzing && selectedWords.length > 0
                    ? 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm cursor-pointer'
                    : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                  }`}
              >
                Apply Words ({selectedWords.length})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
