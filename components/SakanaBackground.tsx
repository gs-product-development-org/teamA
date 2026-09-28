"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface SakanaBackgroundProps {
  className?: string;
  speed?: number;
  opacity?: number;
}

export default function SakanaBackground({
  className = "",
  speed = 0.008,
  opacity = 0.85,
}: SakanaBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId: number;
    let isDisposed = false;

    // 1. シーン作成
    const scene = new THREE.Scene();

    // 2. カメラ作成
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 4);

    // 3. レンダラー作成 (背景透過)
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // 4. ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight1.position.set(5, 8, 5);
    scene.add(dirLight1);

    // const dirLight2 = new THREE.DirectionalLight(0x00ccec, 1.2); // ほんのり水色
    // dirLight2.position.set(-5, -3, -3);
    // scene.add(dirLight2);

    // const pointLight = new THREE.PointLight(0xfe07da, 1.5, 10); // アクセントピンク
    // pointLight.position.set(0, 3, 2);
    // scene.add(pointLight);

    // 5. モデルのロード
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const loader = new GLTFLoader();
    loader.load(
      "/sakana-silk.glb",
      (gltf) => {
        if (isDisposed) return;

        const model = gltf.scene;

        // モデルの自動センタリング＆スケール正規化
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const targetScale = maxDim > 0 ? 2.2 / maxDim : 1;

        model.position.x = -center.x * targetScale;
        model.position.y = -center.y * targetScale;
        model.position.z = -center.z * targetScale;
        model.scale.setScalar(targetScale);

        // マテリアル透明度調整（必要に応じて透過）
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((mat) => {
                mat.transparent = true;
                mat.opacity = opacity;
                mat.depthWrite = true;
              });
            } else if (mesh.material) {
              mesh.material.transparent = true;
              mesh.material.opacity = opacity;
              mesh.material.depthWrite = true;
            }
          }
        });

        modelGroup.add(model);
      },
      undefined,
      (error) => {
        console.error("Error loading /sakana-silk.glb:", error);
      }
    );

    // 6. マウス・パララックス効果
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      const halfWidth = window.innerWidth / 2;
      const halfHeight = window.innerHeight / 2;
      targetRotationY = ((event.clientX - halfWidth) / halfWidth) * 0.3;
      targetRotationX = ((event.clientY - halfHeight) / halfHeight) * 0.2;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // 7. リサイズ処理
    const handleResize = () => {
      if (!container || !renderer) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    // 8. アニメーションループ
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();

      // 自転（回転）
      modelGroup.rotation.y += speed;

      // パララックス（マウス追従の緩やかな補間）
      modelGroup.rotation.x += (targetRotationX - modelGroup.rotation.x) * 0.05;
      modelGroup.rotation.z = Math.sin(elapsedTime * 0.8) * 0.05;

      // 浮遊アニメーション (上下にゆっくり漂う)
      modelGroup.position.y = Math.sin(elapsedTime * 1.2) * 0.12;

      renderer.render(scene, camera);
    };

    animate();

    // 9. クリーンアップ
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });

      renderer.dispose();
    };
  }, [speed, opacity]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`fixed inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}
      style={{ touchAction: "none" }}
    />
  );
}
