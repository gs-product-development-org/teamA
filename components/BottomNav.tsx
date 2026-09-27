"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./BottomNav.css";

export default function BottomNav() {
  const pathname = usePathname();

  // 物語生成・登録画面など（/stories配下）ではナビゲーションを非表示にする
  if (pathname.startsWith("/stories")) {
    return null;
  }

  const navItems = [
    {
      label: "Quiz",
      href: "/quiz",
      icon: "/quiz.png",
      activeColor: "var(--color-primary-orange)",
    },
    {
      label: "New",
      href: "/register",
      icon: "/register.png",
      activeColor: "var(--color-primary-purple)",
    },
    {
      label: "List",
      href: "/list",
      icon: "/list.png",
      activeColor: "var(--color-primary-pink)",
    },
  ];

  return (
    <>
      <div className="bottomNavSpacer" aria-hidden="true" />

      <nav className="bottomNav">
        <div className="navContainer">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href === "/list" && pathname.startsWith("/list"));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`navLink ${isActive ? "active" : "inactive"}`}
                style={
                  {
                    "--active-color": item.activeColor,
                  } as React.CSSProperties
                }
              >
                <span
                  className="navIcon"
                  style={{
                    maskImage: `url(${item.icon})`,
                    WebkitMaskImage: `url(${item.icon})`,
                  }}
                  aria-label={item.label}
                />

                <span className="navLabel">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}