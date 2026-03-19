import type { Metadata } from "next";
import { Noto_Serif, Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

const robotoMono = Roboto_Mono({ subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'latin', 'latin-ext', 'vietnamese'], weight: ['100', '200', '300', '400', '500', '600', '700'], variable: '--font-roboto-mono' });

const roboto = Roboto({ subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'latin', 'latin-ext', 'math', 'symbols', 'vietnamese'], weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'], variable: '--font-roboto' });

const notoSerif = Noto_Serif({ subsets: ['latin'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: "Mini Agent",
  description: "Realtime agent workspace built with Next.js and assistant-ui",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-roboto", "font-roboto-mono", roboto.variable, robotoMono.variable)}>
      <body className={`${notoSerif.variable} antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
