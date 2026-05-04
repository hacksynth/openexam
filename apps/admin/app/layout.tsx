import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenExam 管理端",
  description: "OpenExam 管理控制台"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
