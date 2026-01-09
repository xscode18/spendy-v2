import type { ReactNode } from "react";

export const metadata = {
  title: "Sendy",
  description: "Sendy party board game",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
