try {
  const saved = localStorage.getItem('theme') || 'system';
  const isDark =
    saved === 'dark' ||
    (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (isDark) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    if (meta) meta.setAttribute('content', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
    if (meta) meta.setAttribute('content', 'light');
  }
} catch {}
