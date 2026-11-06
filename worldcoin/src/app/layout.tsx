export const metadata = { title: 'Claim your reward' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ font: '16px system-ui', maxWidth: 640, margin: 'auto', padding: 16 }}>{children}</body>
    </html>
  )
}
