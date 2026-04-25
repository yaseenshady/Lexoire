import React from 'react';
import { useTheme } from '@/hooks/useTheme';
import { motion } from 'framer-motion';

const ThemeSwitcher: React.FC = () => {
  const { themeName, setTheme } = useTheme();

  const themes = [
    { id: 'cyberpunk', label: '⚡ Cyberpunk', colors: 'from-cyan-500 to-purple-600' },
    { id: 'noir', label: '🌙 Noir', colors: 'from-gray-300 to-yellow-400' },
    { id: 'sunburst', label: '☀️ Sunburst', colors: 'from-yellow-400 to-yellow-600' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs uppercase tracking-wider text-white/60">Theme</label>
      <div className="grid grid-cols-3 gap-2">
        {themes.map((t) => (
          <motion.button
            key={t.id}
            onClick={() => setTheme(t.id as any)}
            className={`px-3 py-2 rounded-lg text-xs font-mono transition-all ${
              themeName === t.id
                ? `bg-gradient-to-r ${t.colors} text-black font-bold`
                : 'bg-white/10 text-white/60 hover:bg-white/20'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {t.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default ThemeSwitcher;
