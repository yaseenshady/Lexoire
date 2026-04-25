import { useEffect } from 'react';

interface HotkeyOptions {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: () => void;
}

export const useHotkey = ({ key, ctrl, shift, alt, callback }: HotkeyOptions) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const matchesModifiers =
        (!ctrl || event.ctrlKey || event.metaKey) &&
        (!shift || event.shiftKey) &&
        (!alt || event.altKey);

      if (matchesModifiers && event.key.toLowerCase() === key.toLowerCase()) {
        event.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, ctrl, shift, alt, callback]);
};
