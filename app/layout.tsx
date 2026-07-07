import type { Metadata } from 'next'
import './globals.css'
import ElectreauBg from '@/components/ElectreauBg'
import AuthProvider from '@/components/AuthProvider'
import Shell from '@/components/Shell'

export const metadata: Metadata = {
  title: 'Portail Electreau',
  description: 'Portail entreprise Electreau — bons d\'intervention, gestion de stock',
}

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
