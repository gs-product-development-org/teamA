"use client";
import Link from "next/link";
import styles from "./TopBar.module.css";
import "../app/globals.css";

export default function TopBar() {
  return (
    <div className={styles.headerBlock}>
      <Link href="/" className={styles.headerContainer}>
        <img
          src="/monogatan-silk.png"
          alt="アイコン"
          className={styles.icon}
        />
        <header className={`font ${styles.header}`}>MONOGATAN</header>
      </Link>
    </div>
  );
}
