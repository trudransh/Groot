import { personaConfig } from '@/config/persona.config';
import '@livekit/components-styles';
import clsx from 'clsx';
import { Metadata } from 'next';
import { inter } from './fonts/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: personaConfig.appName,
  description: personaConfig.description,
  icons: {
    icon: [
      { url: personaConfig.favicon.svg, type: 'image/svg+xml' },
      { url: personaConfig.favicon.ico, type: 'image/x-icon' },
    ],
    shortcut: { url: personaConfig.favicon.ico },
    apple: personaConfig.favicon.apple,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className={clsx('h-full', inter.variable)}>{children}</body>
    </html>
  );
}
