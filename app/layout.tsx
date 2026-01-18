import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PIXEL RACER',
  description: 'A retro 8-bit 3D racing game',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-pixel-body bg-pixel-black text-pixel-white">
        {children}
      </body>
    </html>
  );
}
