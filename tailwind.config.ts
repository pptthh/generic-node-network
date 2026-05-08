import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'gnn-bg': '#0f172a',
        'gnn-card': '#1e293b',
        'gnn-border': '#334155',
        'gnn-accent': '#38bdf8',
        'gnn-green': '#34d399',
        'gnn-red': '#f87171',
        'gnn-yellow': '#fbbf24',
      },
    },
  },
  plugins: [],
};

export default config;
