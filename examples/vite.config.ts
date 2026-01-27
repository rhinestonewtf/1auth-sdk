import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@rhinestone/1auth': path.resolve(__dirname, '../src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        signMessage: path.resolve(__dirname, 'sign-message.html'),
        signTypedData: path.resolve(__dirname, 'sign-typed-data.html'),
      },
    },
  },
});
