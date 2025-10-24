import './App.css';
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import StartPage from './Componets/StartPage';
import ChatManager from './Componets/ChatManager';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/chat" element={<ChatManager />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
