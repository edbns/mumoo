import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Two entries: the app, and the cloud-only frame renderer used by the Modal worker.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        render: fileURLToPath(new URL('./render.html', import.meta.url)),
      },
    },
  },
});
