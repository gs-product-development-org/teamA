"use client";

import React, { useState, useRef, useEffect } from "react";
import { createWorker } from "tesseract.js";
import "./CameraOcrModel.css";

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
  const [cameraError, setCameraError] = useState<string>("");
  const [ocrError, setOcrError] = useState<string>("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // カメラの起動処理
  const startCamera = async () => {
    setCameraError("");

    try {
      const mediaStream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn("カメラの起動に失敗しました:", err);

      setCameraError(
        "カメラにアクセスできませんでした。下の「写真を選択・アップロード」をお試しください。"
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

  // 写真を撮影
  const handleCapture = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    stopCamera();
    setCapturedImage(dataUrl);
    analyzeImageClientSide(dataUrl);
  };

  // ファイルから画像を選択
  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    e.target.value = "";

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

  // OCR解析
  const analyzeImageClientSide = async (
    dataUrl: string
  ) => {
    setIsAnalyzing(true);
    setOcrProgress(0);
    setOcrError("");
    setDetectedWords([]);
    setSelectedWords([]);

    try {
      const worker = await createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress(
              Math.round((m.progress || 0) * 100)
            );
          }
        },
      });

      const { data } = await worker.recognize(dataUrl);

      await worker.terminate();

      const fullText = data.text || "";

      const matches =
        fullText.match(/\b[a-zA-Z]{2,45}\b/g) || [];

      const cleanedWords = Array.from(
        new Set(
          matches.map((word) => word.toLowerCase())
        )
      );

      setDetectedWords(cleanedWords);

      setSelectedWords(cleanedWords.slice(0, 5));
    } catch (err: unknown) {
      console.error(
        "クライアントサイドOCRエラー:",
        err
      );

      const message =
        err instanceof Error ? err.message : "";

      setOcrError(
        message ||
          "画像からの文字読み取りに失敗しました。"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 単語選択
  const toggleWordSelection = (word: string) => {
    if (selectedWords.includes(word)) {
      setSelectedWords((prev) =>
        prev.filter((w) => w !== word)
      );
    } else {
      if (selectedWords.length >= 5) {
        return;
      }

      setSelectedWords((prev) => [...prev, word]);
    }
  };

  // 再撮影
  const handleRetake = () => {
    setCapturedImage(null);
    setDetectedWords([]);
    setSelectedWords([]);
    setOcrError("");
    setOcrProgress(0);
  };

  // 確定
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
    <div className="ocrModalOverlay">
      <div className="ocrModal">
        {/* ヘッダー */}
        <div className="ocrModalHeader">
          <h2 className="ocrModalTitle">
            <img className="cameraIcon" src="cameraBlack.png" alt="" />
            Scan Words from Photo
          </h2>

          <button
            type="button"
            onClick={handleModalClose}
            className="ocrCloseButton"
          >
            ✕
          </button>
        </div>

        {/* カメラ撮影画面 */}
        {!capturedImage ? (
          <div className="cameraSection">
            {cameraError ? (
              <div className="cameraError">
                {cameraError}
              </div>
            ) : (
              <div className="cameraPreview">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="cameraVideo"
                />

                <div className="cameraGuide">
                  <span className="cameraGuideText">
                    Fit the words inside the frame
                  </span>
                </div>
              </div>
            )}

            {/* 撮影ボタン */}
            {!cameraError && (
              <button
                type="button"
                onClick={handleCapture}
                className="captureButton"
              >
                <img className="cameraIcon" src="cameraWhite.png" alt="" />
                Take Photo
              </button>
            )}

            {/* ファイル選択 */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="fileInput"
            />

            <button
              type="button"
              onClick={() =>
                fileInputRef.current?.click()
              }
              className="fileSelectButton"
            >
              Choose Photo from Library or Files
            </button>
          </div>
        ) : (
          /* 解析中・検出結果選択画面 */
          <div className="previewContainer">
            {/* プレビュー画像（アスペクト比を維持して縦潰れ・横伸びを防止） */}
            <div className="previewImageWrapper">
              <img
                src={capturedImage}
                alt="Photo Preview"
                className="previewImage"
              />
            </div>

            {/* 画像のすぐ下に横長の再撮影ボタンを配置 */}
            <button
              type="button"
              onClick={handleRetake}
              className="retakeButton"
            >
              <img className="cameraIcon" src="retry.png" alt="" />
              <span>Retake Photo</span>
            </button>

            {/* 解析中ローディング（進捗％表示付き） */}
            {isAnalyzing && (
              <div className="ocrLoading">
                <div className="loadingSpinner" />

                <p className="loadingText">
                  Reading words in the browser...
                  ({ocrProgress}%)
                </p>
              </div>
            )}

            {/* OCRエラー */}
            {ocrError && !isAnalyzing && (
              <div className="ocrError">
                {ocrError}
              </div>
            )}

            {/* 検出単語 */}
            {!isAnalyzing && !ocrError && (
              <div className="detectedSection">
                <div className="detectedHeader">
                  <span className="detectedTitle">
                    Detected Words
                    <br />
                    (Select words to add)
                  </span>

                  <span className="selectedCount">
                    Selected<br /> {selectedWords.length} / 5
                  </span>
                </div>

                {detectedWords.length === 0 ? (
                  <div className="noWords">
                    No English words were detected.
                    <br />
                    Please refocus the image and retake the photo.
                  </div>
                ) : (
                  <div className="wordList">
                    {detectedWords.map((word) => {
                      const isSelected =
                        selectedWords.includes(word);

                      const isMaxReached =
                        selectedWords.length >= 5 &&
                        !isSelected;

                      return (
                        <button
                          key={word}
                          type="button"
                          disabled={isMaxReached}
                          onClick={() =>
                            toggleWordSelection(word)
                          }
                          className={`wordButton ${
                            isSelected
                              ? "wordButtonSelected"
                              : isMaxReached
                              ? "wordButtonDisabled"
                              : "wordButtonDefault"
                          }`}
                        >
                          {isSelected ? "✓ " : ""}
                          {word}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ボタン */}
            <div className="modalActions">
              <button
                type="button"
                onClick={handleModalClose}
                className="cancelButton"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  isAnalyzing ||
                  selectedWords.length === 0
                }
                onClick={handleApply}
                className={`applyButton ${
                  !isAnalyzing &&
                  selectedWords.length > 0
                    ? "applyButtonActive"
                    : "applyButtonDisabled"
                }`}
              >
               Add to Input (
                {selectedWords.length}
                {selectedWords.length === 1 ? "Word" : "Words"}
              )
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}