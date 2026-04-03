import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Telegram Bot Admin Panel',
  description: 'Self-hosted Telegram bot operator panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
