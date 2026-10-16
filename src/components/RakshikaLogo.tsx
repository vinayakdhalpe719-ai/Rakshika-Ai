import React from 'react';

interface RakshikaLogoProps {
  variant?: 'emblem' | 'full' | 'horizontal';
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
}

/**
 * Rakshika AI Official Logo Component
 * Matches the uploaded brand emblem:
 * - Woman silhouette facing right with layered flowing neon-purple/magenta hair
 * - Protective security shield badge with glowing border
 * - Supporting cupped hands in gradient
 * - 5 satellite feature nodes (Location GPS, SOS call, CCTV surveillance, Guardian community, Shield check)
 * - Modern typography with star sparkle
 */
export default function RakshikaLogo({
  variant = 'horizontal',
  className = '',
  size = 'md',
  showTagline = true,
}: RakshikaLogoProps) {
  // Dimension presets
  const emblemSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9 sm:w-10 sm:h-10',
    lg: 'w-12 h-12 sm:w-14 sm:h-14',
    xl: 'w-20 h-20 sm:w-28 sm:h-28',
  };

  // Dedicated SVG Emblem Graphic
  const EmblemSvg = ({ customClass = '' }: { customClass?: string }) => (
    <svg
      viewBox="0 0 500 420"
      className={`shrink-0 drop-shadow-md select-none ${customClass}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Rakshika AI Logo Emblem"
    >
      <defs>
        <linearGradient id="rk-shield-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="50%" stopColor="#e879f9" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>

        <linearGradient id="rk-shield-fill" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#2a124d" />
          <stop offset="100%" stopColor="#140924" />
        </linearGradient>

        <linearGradient id="rk-hair-main" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7e22ce" />
          <stop offset="50%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>

        <linearGradient id="rk-hair-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#e879f9" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>

        <linearGradient id="rk-hands" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9333ea" />
          <stop offset="50%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>

        <linearGradient id="rk-badge" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>

        <filter id="rk-glow" x="-15%" y="-15%" width="130%" height="130%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Orbit Rings */}
      <g opacity="0.75">
        <path d="M 120,130 A 165,165 0 0,1 380,130" fill="none" stroke="url(#rk-shield-stroke)" strokeWidth="2.5" />
        <path d="M 95,210 A 175,175 0 0,0 170,310" fill="none" stroke="url(#rk-shield-stroke)" strokeWidth="2.5" />
        <path d="M 405,210 A 175,175 0 0,1 330,310" fill="none" stroke="url(#rk-shield-stroke)" strokeWidth="2.5" />
        <circle cx="250" cy="190" r="145" fill="none" stroke="#7e22ce" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="4 6" />
      </g>

      {/* Central Shield */}
      <g filter="url(#rk-glow)">
        <path
          d="M 250,70 L 345,115 L 345,225 Q 345,305 250,345 Q 155,305 155,225 L 155,115 Z"
          fill="url(#rk-shield-fill)"
          stroke="url(#rk-shield-stroke)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M 250,85 L 332,125 L 332,220 Q 332,292 250,328 Q 168,292 168,220 L 168,125 Z"
          fill="none"
          stroke="#9333ea"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />
      </g>

      {/* Woman Silhouette with Flowing Purple/Magenta Hair */}
      <g id="rk-woman">
        <path
          d="M 220,120 C 180,135 160,180 165,225 C 170,265 195,295 240,315 C 215,295 205,265 210,235 C 215,200 240,165 270,140 C 255,125 235,118 220,120 Z"
          fill="#4c1d95"
        />
        <path
          d="M 245,115 C 210,120 180,150 175,190 C 170,230 190,265 220,295 C 200,265 195,230 205,195 C 215,160 245,135 275,125 C 265,118 255,115 245,115 Z"
          fill="url(#rk-hair-main)"
        />
        <path
          d="M 260,120 C 230,130 205,165 200,205 C 195,245 220,280 250,305 C 230,280 220,245 230,210 C 240,175 265,145 285,130 C 275,123 268,120 260,120 Z"
          fill="url(#rk-hair-light)"
        />
        <path
          d="M 275,135 C 255,150 235,180 232,215 C 230,245 245,270 265,290 C 250,268 245,242 250,218 C 255,190 272,165 292,148 Z"
          fill="#f472b6"
          opacity="0.85"
        />

        {/* Crisp Face Profile Facing Right */}
        <path
          d="M 265,128 C 272,130 278,135 282,142 C 285,148 286,155 283,160 C 281,163 283,165 287,168 C 292,172 296,176 302,181 C 297,184 293,185 290,188 C 289,190 292,192 296,195 C 298,197 296,201 292,203 C 288,205 289,208 293,212 C 295,215 293,219 288,222 C 282,225 277,227 274,233 C 271,240 271,250 273,260 C 275,270 282,282 295,295 C 275,285 265,268 262,250 C 258,235 260,222 263,210 C 258,205 255,195 255,185 C 255,165 260,145 265,128 Z"
          fill="#ffffff"
          filter="url(#rk-glow)"
        />

        {/* AI Chip Node by the Face (Matches Official Logo) */}
        <g transform="translate(305, 185)">
          <rect x="-12" y="-12" width="24" height="24" rx="4" fill="#140924" stroke="#c084fc" strokeWidth="1.5" />
          {/* Chip Pins */}
          <line x1="-12" y1="-6" x2="-15" y2="-6" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="-12" y1="0" x2="-15" y2="0" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="-12" y1="6" x2="-15" y2="6" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="12" y1="-6" x2="15" y2="-6" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="12" y1="0" x2="15" y2="0" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="12" y1="6" x2="15" y2="6" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="-6" y1="-12" x2="-6" y2="-15" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="0" y1="-12" x2="0" y2="-15" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="6" y1="-12" x2="6" y2="-15" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="-6" y1="12" x2="-6" y2="15" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="0" y1="12" x2="0" y2="15" stroke="#e879f9" strokeWidth="1.2" />
          <line x1="6" y1="12" x2="6" y2="15" stroke="#e879f9" strokeWidth="1.2" />
          <text x="0" y="3.5" fill="#f43f5e" fontFamily="system-ui, sans-serif" fontSize="8" fontWeight="900" textAnchor="middle">AI</text>
        </g>
      </g>

      {/* Cradling Supporting Hands */}
      <g filter="url(#rk-glow)">
        <path
          d="M 140,230 C 142,275 160,310 195,335 C 215,348 235,355 245,358 C 225,350 200,332 180,310 C 158,285 148,255 145,230 Z"
          fill="url(#rk-hands)"
        />
        <path
          d="M 165,255 C 168,285 185,315 215,335 C 230,344 242,348 248,350 C 232,344 212,330 195,312 C 178,290 170,268 168,255 Z"
          fill="#f472b6"
          opacity="0.9"
        />

        <path
          d="M 360,230 C 358,275 340,310 305,335 C 285,348 265,355 255,358 C 275,350 300,332 320,310 C 342,285 352,255 355,230 Z"
          fill="url(#rk-hands)"
        />
        <path
          d="M 335,255 C 332,285 315,315 285,335 C 270,344 258,348 252,350 C 268,344 288,330 305,312 C 322,290 330,268 332,255 Z"
          fill="#f472b6"
          opacity="0.9"
        />
      </g>

      {/* Orbit Badges */}
      {/* 1. Top Pin with Radio Waves */}
      <g transform="translate(250, 55)">
        <path d="M -18,-24 A 22,22 0 0,1 18,-24" fill="none" stroke="#e879f9" strokeWidth="2" strokeLinecap="round" />
        <path d="M -11,-17 A 13,13 0 0,1 11,-17" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" />
        <path d="M 0,-7 C -8,-7 -14,0 -14,7 C -14,14 0,26 0,26 C 0,26 14,14 14,7 C 14,0 8,-7 0,-7 Z" fill="url(#rk-badge)" stroke="#ffffff" strokeWidth="1.5" />
        <circle cx="0" cy="7" r="3.5" fill="#ffffff" />
      </g>

      {/* 2. SOS Button (Top-Left) */}
      <g transform="translate(145, 115)">
        <circle cx="0" cy="0" r="26" fill="#e11d48" stroke="#ffffff" strokeWidth="2" filter="url(#rk-glow)" />
        {/* Beacon rays */}
        <line x1="-12" y1="-14" x2="-8" y2="-10" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="0" y1="-18" x2="0" y2="-13" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="12" y1="-14" x2="8" y2="-10" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <text x="0" y="4" fill="#ffffff" fontFamily="system-ui, sans-serif" fontSize="10" fontWeight="900" textAnchor="middle" letterSpacing="0.5">SOS</text>
      </g>

      {/* 3. Mid-Left Pin */}
      <g transform="translate(115, 195)">
        <circle cx="0" cy="0" r="24" fill="#140924" stroke="url(#rk-badge)" strokeWidth="2.5" filter="url(#rk-glow)" />
        <path d="M 0,-8 C -5,-8 -9,-4 -9,1 C -9,6 0,15 0,15 C 0,15 9,6 9,1 C 9,-4 5,-8 0,-8 Z" fill="url(#rk-badge)" stroke="#ffffff" strokeWidth="1" />
        <circle cx="0" cy="1" r="2.5" fill="#ffffff" />
      </g>

      {/* 4. Shield Check (Bottom-Left) */}
      <g transform="translate(125, 275)">
        <circle cx="0" cy="0" r="24" fill="#140924" stroke="url(#rk-badge)" strokeWidth="2.5" filter="url(#rk-glow)" />
        <path d="M 0,-10 L 10,-6 L 10,2 Q 10,9 0,12 Q -10,9 -10,2 L -10,-6 Z" fill="url(#rk-badge)" stroke="#ffffff" strokeWidth="1" />
        <path d="M -4,1 L -1,4 L 5,-3" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* 5. Guardian Community (Top-Right) */}
      <g transform="translate(355, 115)">
        <circle cx="0" cy="0" r="26" fill="#140924" stroke="url(#rk-badge)" strokeWidth="2.5" filter="url(#rk-glow)" />
        <circle cx="0" cy="-6" r="4.5" fill="#ffffff" />
        <path d="M -8,8 C -8,3 -3,2 0,2 C 3,2 8,3 8,8 Z" fill="#ffffff" />
        <circle cx="-9" cy="-3" r="3" fill="#c084fc" />
        <path d="M -14,8 C -14,5 -11,4 -9,4 C -7,4 -6,5 -6,8 Z" fill="#c084fc" />
        <circle cx="9" cy="-3" r="3" fill="#c084fc" />
        <path d="M 6,8 C 6,5 7,4 9,4 C 11,4 14,5 14,8 Z" fill="#c084fc" />
      </g>

      {/* 6. CCTV Camera (Mid-Right) */}
      <g transform="translate(385, 195)">
        <circle cx="0" cy="0" r="24" fill="#140924" stroke="url(#rk-badge)" strokeWidth="2.5" filter="url(#rk-glow)" />
        <path d="M -10,-5 L 7,-10 L 12,-2 L -5,3 Z" fill="#ffffff" />
        <path d="M 7,-10 L 12,-2 L 12,2 L 7,0 Z" fill="#c084fc" />
        <rect x="-8" y="3" width="5" height="6" fill="#ffffff" />
        <path d="M -8,9 L 0,9" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="2" cy="-2" r="1.5" fill="#ec4899" />
      </g>

      {/* 7. Audio Waveform Node (Bottom-Right) */}
      <g transform="translate(375, 275)">
        <circle cx="0" cy="0" r="24" fill="#140924" stroke="url(#rk-badge)" strokeWidth="2.5" filter="url(#rk-glow)" />
        <line x1="-10" y1="-4" x2="-10" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <line x1="-5" y1="-9" x2="-5" y2="9" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <line x1="0" y1="-13" x2="0" y2="13" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="5" y1="-9" x2="5" y2="9" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <line x1="10" y1="-4" x2="10" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );

  // Variant 1: Pure Emblem Icon
  if (variant === 'emblem') {
    return (
      <div className={`relative inline-flex items-center justify-center ${className}`}>
        <EmblemSvg customClass={emblemSizes[size]} />
      </div>
    );
  }

  // Variant 2: Full Stacked Logo (Matches image.png with Safety · Support · Always)
  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        <EmblemSvg customClass="w-32 h-32 sm:w-44 sm:h-44" />
        <div className="mt-2.5 flex items-center justify-center gap-2">
          <span className="text-2xl sm:text-3xl font-black tracking-wider text-white uppercase font-sans">
            RAKSHIK<span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-pink-500">A</span>
          </span>
          <span className="text-2xl sm:text-3xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-rose-500 to-fuchsia-500 relative flex items-center">
            AI
            <span className="text-pink-400 text-xs sm:text-sm absolute -top-1.5 -right-3 animate-pulse">✦</span>
          </span>
        </div>
        {showTagline && (
          <div className="mt-2 flex items-center justify-center gap-2 text-[0.68rem] sm:text-xs font-bold tracking-widest uppercase">
            <span className="h-px w-6 sm:w-10 bg-gradient-to-r from-transparent to-pink-500/60" />
            <span className="text-purple-200">Safety</span>
            <span className="text-pink-400">·</span>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-pink-500/20 text-pink-400 border border-pink-500/30 text-[0.6rem]">♥</span>
            <span className="text-purple-200">Support</span>
            <span className="text-pink-400">·</span>
            <span className="text-purple-200">Always</span>
            <span className="h-px w-6 sm:w-10 bg-gradient-to-l from-transparent to-pink-500/60" />
          </div>
        )}
      </div>
    );
  }

  // Variant 3: Horizontal Navbar/Header Logo (Emblem + RAKSHIKA AI text inline)
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <div className="relative">
        <EmblemSvg customClass={emblemSizes[size]} />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className="text-lg sm:text-xl font-black tracking-tight text-white uppercase font-sans">
            RAKSHIK<span className="text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-pink-500">A</span>
          </span>
          <span className="bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-600 text-white text-[0.62rem] sm:text-[0.68rem] font-black px-1.5 py-0.5 rounded tracking-widest leading-none shadow-sm shadow-pink-900/50">
            AI
          </span>
        </div>
        {showTagline && (
          <div className="flex items-center gap-1.5 text-[0.55rem] sm:text-[0.62rem] font-bold tracking-wider uppercase leading-tight mt-1 hidden sm:flex text-purple-200/80">
            <span>Safety</span>
            <span className="text-pink-400">·</span>
            <span className="text-pink-400 text-[0.55rem]">♥</span>
            <span>Support</span>
            <span className="text-pink-400">·</span>
            <span>Always</span>
          </div>
        )}
      </div>
    </div>
  );
}
