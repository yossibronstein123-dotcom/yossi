import React from 'react';
import { GameProvider } from './context/GameContext';
import { GameCanvas } from './components/GameCanvas';
import { Overlay } from './components/UI/Overlay';

const App: React.FC = () => {
  return (
    <GameProvider>
      <div className="w-full h-screen bg-gray-900 text-white overflow-hidden relative">
        <GameCanvas />
        <Overlay />
      </div>
    </GameProvider>
  );
};

export default App;