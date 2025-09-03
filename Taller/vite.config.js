import { defineConfig } from 'vite';

export default defineConfig({
  // ...existing code...
  server: {
    // ...existing code...
    open: '/workshop/sandbox/my.html',
    host: true
  },
  preview: {
    open: '/workshop/sandbox/my.html',
    host: true
  }
});