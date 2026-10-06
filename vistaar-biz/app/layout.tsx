import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vistaar-Biz — A smarter way to grow your business",
  description: "Strategy, AI, execution and expert support in one connected business growth platform. Understand where you stand, prioritise what matters, and turn insight into action.",
  applicationName: "Vistaar-Biz",
  openGraph: {
    title: "Vistaar-Biz — A smarter way to grow your business",
    description: "One connected growth system: understand, prioritise, execute and improve.",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
