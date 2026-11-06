import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@digital-go-jp/design-tokens/dist/tokens-simple.css';
import './styles.css';
const root = document.getElementById('root');
if (root) ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
