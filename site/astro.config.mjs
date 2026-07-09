// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/ai-jam-sessions',
  integrations: [
    starlight({
      title: 'AI Jam Sessions',
      description: 'AI Jam Sessions handbook',
      favicon: '/favicon.svg',
      head: [
        // Open Graph / social card. og-card.png is generated via Claude Design
        // (see Stage-D asset prompts); the tags are in place so a link preview
        // renders as soon as the image lands in site/public/.
        { tag: 'meta', attrs: { property: 'og:title', content: 'AI Jam Sessions' } },
        { tag: 'meta', attrs: { property: 'og:description', content: 'An MCP server that teaches AI to play piano and guitar — and sing. 120 songs, 6 engines, a browser cockpit, and a public tool-use dataset.' } },
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://mcp-tool-shop-org.github.io/ai-jam-sessions/og-card.png' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      ],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mcp-tool-shop-org/ai-jam-sessions' },
      ],
      sidebar: [
        {
          label: 'Handbook',
          autogenerate: { directory: 'handbook' },
        },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
      disable404Route: true,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
