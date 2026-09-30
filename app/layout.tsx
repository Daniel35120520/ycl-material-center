import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "材料研發中心｜by YCL 開發",
  description: "膠類配方、製程數據與 SPC 品質管制平台。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
