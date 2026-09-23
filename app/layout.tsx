import type React from 'react'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const _geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const _geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'Compute Basis Terminal — Ornn × Kalshi',
  description:
    'Annualized basis between Ornn GPU compute forward marks and spot, alongside Kalshi compute price contracts.',
}

export const viewport: Viewport = {
  themeColor: '#26241f',
  initialScale: 1,
  width: 'device-width',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${_geistSans.variable} ${_geistMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
