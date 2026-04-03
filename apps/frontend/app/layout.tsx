import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Opener Bot Admin',
  description: 'Self-hosted Telegram bot operator panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}