'use client';

export function MarqueeRibbon() {
  const messages = [
    "INDIA'S FASTEST GROWING AI PLATFORM",
    "10,000+ CREATORS TRUST VISICRAFT",
    "GENERATE STUNNING VISUALS IN SECONDS"
  ];

  return (
    <div className="relative bg-gradient-to-r from-[#8b7355] via-[#a08968] to-[#8b7355] py-3 overflow-hidden border-b border-[#c8b4a0]/30">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>
      <div className="relative flex animate-marquee whitespace-nowrap">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center">
            {messages.map((message, idx) => (
              <span key={idx} className="text-white font-light text-sm tracking-widest flex items-center mx-8">
                {message}
                {idx < messages.length - 1 && (
                  <span className="mx-8 text-white/60">•</span>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
