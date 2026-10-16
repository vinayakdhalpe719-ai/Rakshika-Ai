import React, { useState, useRef, useEffect } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { SUPPORTED_LANGUAGES, LanguageCode } from '../translations';

interface LanguageSelectorProps {
  currentLanguage: LanguageCode;
  onLanguageChange: (lang: LanguageCode) => void;
  variant?: 'compact' | 'expanded' | 'badge';
  className?: string;
  theme?: 'rose' | 'emerald';
}

export default function LanguageSelector({
  currentLanguage,
  onLanguageChange,
  variant = 'compact',
  className = '',
  theme = 'rose'
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedLangObj = SUPPORTED_LANGUAGES.find(l => l.code === currentLanguage) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeAccent = theme === 'emerald' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-gradient-to-r from-fuchsia-500/20 to-pink-500/20 text-pink-300 border-pink-500/40 font-semibold';
  const hoverAccent = theme === 'emerald' ? 'hover:border-emerald-500/40 hover:bg-emerald-950/30' : 'hover:border-pink-500/50 hover:bg-purple-950/50';

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        id="language-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-purple-500/30 bg-[#140b33]/90 text-sm font-medium text-purple-100 transition-all cursor-pointer shadow-sm shadow-purple-950 ${hoverAccent}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Globe className={`w-4 h-4 ${theme === 'emerald' ? 'text-emerald-400' : 'text-pink-400'}`} />
        <span className="text-sm">{selectedLangObj.flag}</span>
        <span className="font-medium text-xs sm:text-sm">{selectedLangObj.nativeName}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-purple-300 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#130b2e] border border-purple-500/30 shadow-2xl shadow-purple-950/80 z-50 p-1.5 focus:outline-none backdrop-blur-xl">
          <div className="px-3 py-2 border-b border-purple-500/20 mb-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/80">Select Language / भाषा निवडा</p>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = lang.code === currentLanguage;
              return (
                <button
                  key={lang.code}
                  type="button"
                  id={`lang-opt-${lang.code}`}
                  onClick={() => {
                    onLanguageChange(lang.code);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm transition-colors cursor-pointer ${
                    isSelected
                      ? `${activeAccent} border`
                      : 'text-purple-200 hover:bg-purple-900/40 hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{lang.flag}</span>
                    <div className="flex flex-col">
                      <span className="font-medium leading-tight">{lang.nativeName}</span>
                      <span className="text-[10px] text-purple-400/60">{lang.name}</span>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-pink-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
