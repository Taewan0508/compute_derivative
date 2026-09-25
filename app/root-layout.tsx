import type React from 'react'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

type LoadedFont = { variable: string }

type LayoutProps = { children: React.ReactNode }

const geistSans: LoadedFont = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono: LoadedFont = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

/**
 * Document metadata for the compute basis terminal.
 *
 * `title` is the browser-tab title. `description` is the summary used in
 * link previews: the annualized basis between Ornn GPU forward marks and spot,
 * shown next to the Kalshi contracts that settle on that index.
 */
export const metadata: Metadata = {
  title: 'Compute Basis Terminal — Ornn × Kalshi',
  description:
    'Annualized basis between Ornn GPU compute forward marks and spot, alongside Kalshi compute price contracts.',
}

/**
 * Viewport settings for the terminal theme.
 *
 * `themeColor` matches the panel background (`#26241f`) so the browser chrome
 * blends into the page. `width` is `device-width` and `initialScale` is `1`,
 * so the layout is not zoomed on first load.
 */
export const viewport: Viewport = {
  themeColor: '#26241f',
  initialScale: 1,
  width: 'device-width',
}

/**
 * Root HTML shell for every route.
 *
 * Registers Geist Sans and Geist Mono as CSS variables and applies them on
 * `body`, with the page background class on `html`.
 *
 * @param props - Layout props supplied by Next.js.
 * @param props.children - The active page tree rendered inside `body`.
 * @returns The root `<html>` document.
 */
export const RootLayout = ({ children }: LayoutProps): React.JSX.Element => {
  return (
    <html lang="en" className="bg-background">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
