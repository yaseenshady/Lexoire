import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeName = 'cyberpunk' | 'noir' | 'sunburst';

interface Theme {
  name: ThemeName;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  glow: string;
}

const themes: Record<ThemeName, Theme> = {
  cyberpunk: {
    name: 'cyberpunk',
    primary: '#00ffff',
    secondary: '#bf00ff',
    accent: '#ff00ff',
    background: '#0a0a0a',
    text: '#ffffff',
    glow: 'rgba(0, 255, 255, 0.5)',
  },
  noir: {
    name: 'noir',
    primary: '#ffffff',
    secondary: '#f0f0f0',
    accent: '#ffff00',
    background: '#000000',
    text: '#ffffff',
    glow: 'rgba(255, 255, 255, 0.4)',
  },
  sunburst: {
    name: 'sunburst',
    primary: '#ffff00',
    secondary: '#ffcc00',
    accent: '#ffffff',
    background: '#000000',
    text: '#ffffff',
    glow: 'rgba(255, 255, 0, 0.6)',
  },
};

interface ThemeContextType {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('lexoire.theme');
    return (saved as ThemeName) || 'cyberpunk';
  });

  const theme = themes[themeName];

  useEffect(() => {
    localStorage.setItem('lexoire.theme', themeName);
    // Apply theme CSS variables
    document.documentElement.style.setProperty('--theme-primary', theme.primary);
    document.documentElement.style.setProperty('--theme-secondary', theme.secondary);
    document.documentElement.style.setProperty('--theme-accent', theme.accent);
    document.documentElement.style.setProperty('--theme-background', theme.background);
    document.documentElement.style.setProperty('--theme-text', theme.text);
    document.documentElement.style.setProperty('--theme-glow', theme.glow);
  }, [themeName, theme]);

  return (
    <ThemeContext.Provider value={{ theme, themeName, setTheme: setThemeName }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
