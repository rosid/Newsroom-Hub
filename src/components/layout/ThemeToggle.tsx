'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    document.cookie = `newsroom_theme=${next ? 'dark' : 'light'}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-icon"
      title={dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
      aria-label="Ganti tema"
    >
      <Icon name={dark ? 'sun' : 'moon'} size={16} />
    </button>
  );
}
