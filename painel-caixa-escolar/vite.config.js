import { defineConfig } from 'vite';
import { resolve } from 'path';

const dashboardRoot = resolve(__dirname, 'squads/caixa-escolar/dashboard');

export default defineConfig({
  root: dashboardRoot,
  publicDir: false,

  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(dashboardRoot, 'gdp-contratos.html'),
        login: resolve(dashboardRoot, 'login.html'),
        portal: resolve(dashboardRoot, 'gdp-portal.html'),
        entregador: resolve(dashboardRoot, 'gdp-entregador.html'),
        dashboard: resolve(dashboardRoot, 'gdp-dashboard.html'),
        home: resolve(dashboardRoot, 'dashboard-home.html'),
      }
    }
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
