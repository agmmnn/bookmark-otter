import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const AI_HOST_PERMISSIONS = [
  'https://generativelanguage.googleapis.com/*',
  'https://api.openai.com/*',
  'https://api.anthropic.com/*',
  'https://api.x.ai/*',
  'https://api.groq.com/*',
  'https://api.deepseek.com/*',
];

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  alias: {
    '@': path.resolve(__dirname, './'),
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './'),
      },
    },
  }),
  manifest: ({ manifestVersion }) => ({
    name: '__MSG_extName__',
    short_name: 'Bookmark Otter',
    description: '__MSG_extDescription__',
    homepage_url: 'https://github.com/agmmnn/bookmark-otter',
    default_locale: 'en',
    permissions: ['bookmarks', 'storage', 'sidePanel', 'tabs', 'scripting'],
    host_permissions: AI_HOST_PERMISSIONS,
    ...(manifestVersion === 3
      ? {
          minimum_chrome_version: '114',
          optional_host_permissions: ['http://*/*', 'https://*/*'],
          content_security_policy: {
            extension_pages: "script-src 'self'; object-src 'self'; frame-ancestors 'none'",
          },
        }
      : { optional_permissions: ['http://*/*', 'https://*/*'] }),
    action: {
      default_title: '__MSG_extName__',
      default_icon: {
        '16': 'icon/16.png',
        '32': 'icon/32.png',
        '48': 'icon/48.png',
        '128': 'icon/128.png',
      },
    },
  }),
});
