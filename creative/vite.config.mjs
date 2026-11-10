import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { localPreviewApi } from './dev/local-preview-api.mjs';

// Three entries: the app, the cloud-only frame renderer used by the Modal worker, and the admin page (/admin).
export default defineConfig({
  plugins: [tailwindcss(), localPreviewApi()],
  // `@/` is the source folder, which is what components installed from 21st.dev expect.
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        render: fileURLToPath(new URL('./render.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
});
