import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemeMint — AI Meme Token Generator",
  description: "Generate creative meme token names, symbols, and marketing copy with AI. Powered by $THRYX (CA: 0xc07E889e1816De2708BF718683e52150C20F3BA3).",
  metadataBase: new URL("https://mint.thryx.mom"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "MemeMint — AI Meme Token Generator",
    description: "Generate creative meme token concepts with AI. Powered by $THRYX.",
    url: "https://mint.thryx.mom",
    siteName: "MemeMint",
    images: [{ url: "/thryx-logo.png", width: 512, height: 512 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MemeMint — AI Meme Token Generator",
    description: "AI meme token generator. Powered by $THRYX. CA: 0xc07E889e1816De2708BF718683e52150C20F3BA3",
    images: ["/thryx-logo.png"],
    creator: "@THRYXAGI",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-[#0a0a0f] text-gray-200 min-h-screen antialiased" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        <nav className="fixed top-0 w-full z-50 bg-[#0a0a0f]/80 backdrop-blur-md border-b border-gray-800/50">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <img src="/thryx-logo.png" alt="MemeMint" className="w-7 h-7" />
              <span className="font-semibold text-white">MemeMint</span>
            </a>
            <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
              <a href="/trending" className="hover:text-white transition">Trending</a>
              <a href="https://thryx.mom" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">THRYX Hub</a>
              <a href="https://scanner.thryx.mom" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">BaseScan AI</a>
              <a href="https://signals.thryx.mom" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">Signals</a>
              <a href="https://mysocial.mom" target="_blank" rel="noopener noreferrer" className="hover:text-white transition">MySocial</a>
            </div>
            <a href="https://thryx.mom/swap" target="_blank" rel="noopener noreferrer" className="text-sm bg-[#22d3ee] text-[#0a0a0f] font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition">Buy $THRYX</a>
          </div>
        </nav>
        <main className="pt-16">{children}</main>
        <footer className="border-t border-white/10 mt-auto py-8 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-4">
              <a href="https://thryx.mom" className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent hover:opacity-80">
                ⚡ THRYX Ecosystem
              </a>
            </div>
            <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-400">
              <a href="https://thryx.mom/swap" className="hover:text-white transition-colors">Swap</a>
              <a href="https://thryx.mom/staking" className="hover:text-white transition-colors">Staking</a>
              <a href="https://thryx.mom/predict" className="hover:text-white transition-colors">Predictions</a>
              <a href="https://thryx.mom/lottery" className="hover:text-white transition-colors">Lottery</a>
              <span className="text-white/20">|</span>
              <a href="https://scanner.thryx.mom" className="hover:text-white transition-colors">AI Scanner</a>
              <a href="https://signals.thryx.mom" className="hover:text-white transition-colors">Signals</a>
              <a href="https://mint.thryx.mom" className="hover:text-white transition-colors">MemeMint</a>
              <a href="https://portfolio.thryx.mom" className="hover:text-white transition-colors">Portfolio</a>
              <a href="https://sniper.thryx.mom" className="hover:text-white transition-colors">Sniper</a>
              <a href="https://api.thryx.mom" className="hover:text-white transition-colors">API</a>
              <a href="https://mysocial.mom" className="hover:text-white transition-colors">MySocial</a>
            </div>
            <div className="flex justify-center gap-4 mt-4 text-xs text-gray-500">
              <a href="https://x.com/THRYXAGI" target="_blank" className="hover:text-white transition-colors">Twitter</a>
              <a href="https://dexscreener.com/base/0x5a86f04dbd3e6b532e4397eb605a4c23136dc913e0a60b65547842d2ce7876e8" target="_blank" className="hover:text-white transition-colors">DexScreener</a>
              <span>Powered by $THRYX on Base</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
