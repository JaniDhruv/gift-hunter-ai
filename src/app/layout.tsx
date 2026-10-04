import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gift Hunter Agent | Thoughtful gift discovery",
  description: "Find personal gift ideas and verified shopping picks with Gift Hunter Agent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
