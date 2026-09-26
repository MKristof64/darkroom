import React from 'react';
import { createRoot } from 'react-dom/client';
import Game from '../app/page';
import '../app/globals.css';
window.OV_CONFIG = {
 apiOrigin: import.meta.env.VITE_API_ORIGIN || 'https://darkroom.kristof-madarasz159.chatgpt.site',
 basePath: import.meta.env.BASE_URL,
};
createRoot(document.getElementById('root')!).render(<Game />);
