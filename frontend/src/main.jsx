
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// Register Service Worker for Web Push notifications
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');

            console.log(
                'Push Service Worker registered:',
                registration.scope
            );
        } catch (error) {
            console.error(
                'Service Worker registration failed:',
                error
            );
        }
    });
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
