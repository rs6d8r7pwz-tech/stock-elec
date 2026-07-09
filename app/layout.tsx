import type { Metadata, Viewport } from 'next'
import './globals.css'
import ElectreauBg from '@/components/ElectreauBg'
import AuthProvider from '@/components/AuthProvider'
import Shell from '@/components/Shell'

export const metadata: Metadata = {
  title: 'Portail Electreau',
  description: 'Portail entreprise Electreau — bons d\'intervention, gestion de stock',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/icon-180.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#16294a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <ElectreauBg />
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  )
}
