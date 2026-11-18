import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { localPreviewApi } from './dev/local-preview-api.mjs';

/**
 * The interface font is fetched with the page, not after it: otherwise the browser finds it only once the CSS is in and
 * the text is drawn, so a first visit shows the text in a fallback face and redraws it in Inter a moment later.
 */
function preloadInterfaceFont() {
  return {
    name: 'preload-interface-font',
    transformIndexHtml: {
      order: 'post',
      handler(_html, context) {
        if (!context.bundle || context.filename.endsWith('render.html')) return [];
        const font = Object.keys(context.bundle).find(file => /inter-latin-wght-normal-[\w-]+\.woff2$/.test(file));
        return font ? [{ tag: 'link', attrs: { rel: 'preload', href: `/${font}`, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head-prepend' }] : [];
      },
    },
  };
}

// Five entries: the app, the cloud-only frame renderer used by the Modal worker, the admin page (/admin), the page a phone sends the song from (/phone), and the legal documents (/terms, /privacy, … and /legal).
export default defineConfig({
  plugins: [tailwindcss(), localPreviewApi(), preloadInterfaceFont()],
  // `@/` is the source folder, which is what components installed from 21st.dev expect.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        render: fileURLToPath(new URL('./render.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
        phone: fileURLToPath(new URL('./phone.html', import.meta.url)),
        legal: fileURLToPath(new URL('./legal.html', import.meta.url)),
      },
    },
  },
});
