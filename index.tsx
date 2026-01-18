
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LoginPage } from './components/LoginPage';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const Root = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return <App />;
};

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode can sometimes double-invoke effects which interferes with complex CV initialization
  // We disable it here for smoother OpenCV/MediaPipe handling in this specific demo context
  <Root />
);
