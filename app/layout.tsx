import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Liang Nü Zhuang | A Little More You",
  description: "Explore women's dresses, product photos and individual size guides at Liang Nü Zhuang. Availability requests for customers in the United States, priced in USD.",
  robots: { index: false, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
