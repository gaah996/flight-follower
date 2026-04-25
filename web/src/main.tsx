import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './index.css';

// HeroUI v3 needs no wrapping provider for theme or styling — components read
// CSS variables directly, and the `.dark` class on <html> (set by the FOUC
// script in index.html and toggled by the theme store) drives both Tailwind's
// dark: variants and HeroUI's themed components.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
