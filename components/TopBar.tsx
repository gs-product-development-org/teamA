"use client";
import styles from "./TopBar.module.css";
import "../app/globals.css";

export default function TopBar() {
  return (
    <div className={styles.headerBlock}>
     <header className={`font ${styles.header}`}>MONOGATAN</header>
     <img src="/seicyu_color3.PNG" alt="アイコン" className={styles.icon} />
    </div>
  );
}
