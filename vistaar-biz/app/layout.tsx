import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vistaar-Biz | Growth Command Centre",
  description: "AI-powered business growth platform"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
