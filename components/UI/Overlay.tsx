
import React from 'react';
import { useGame } from '../../context/GameContext';
import { ITEM_ICONS, RECIPES, ItemType, GameEvent, MAX_POT, OWNER_FEE } from '../../types';
import { Terminal, Activity, Coins, Cpu, Hammer, X, Pickaxe, CloudLightning, Home, Tv, DollarSign, Globe, MousePointer2, RotateCw, ArrowDownToLine, Briefcase } from 'lucide-react';

const StatCard = ({ icon: Icon, label, value, subValue, alert, progress }: any) => (
  <div className={`backdrop-blur border p-3 rounded-lg flex items-center gap-3 min-w-[140px] transition-colors ${alert ? 'bg-red-900/50 border-red-500' : 'bg-gray-900/80 border-gray-700'}`}>
    <div className={`p-2 rounded-full ${alert ? 'bg-red-800' : 'bg-gray-800'}`}>
      <Icon size={18} className={alert ? "text-white" : "text-blue-400"} />
    </div>
    <div className="flex-1">
      <p className="text-xs text-gray-400 uppercase font-bold flex justify-between">
        {label}
        {progress !== undefined && <span className="text-[10px]">{Math.round(progress * 100)}%</span>}
      </p>
      <p className="text-lg font-mono font-bold text-white">{value}</p>
      {subValue && <p className={`text-[10px] ${alert ? 'text-red-200' : 'text-green-400'}`}>{subValue}</p>}
      
      {progress !== undefined && (
        <div className="w-full h-1 bg-gray-700 rounded mt-1 overflow-hidden">
          <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress * 100}%` }}></div>
        </div>
      )}
    </div>
  </div>
);

export const Overlay = () => {
  const { 
    inventory, money, globalPot, ownerBalance, miningRigs, miningRate, 
    marketHeadline, marketModifier, logs,
    isMenuOpen, toggleMenu, craft, startBuildMode, buildMode,
    activeEvent, cashOut, dropItem
  } = useGame();

  const potPercentage = globalPot / MAX_POT;

  const handleBuildClick = (e: React.MouseEvent, type: ItemType) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 1. Force focus and lock immediately on the DOM element
    // We use the specific ID we added to the Canvas wrapper to find the canvas element
    const canvas = document.querySelector('#gl-canvas canvas') as HTMLCanvasElement;
    if (canvas) {
        canvas.focus(); 
        canvas.requestPointerLock();
    }
    
    // 2. Delay the React State update slightly.
    // If we unmount the menu (and this button) immediately in the same tick,
    // the browser sometimes cancels the pointer lock request because the active element vanished.
    setTimeout(() => {
        startBuildMode(type);
    }, 50);
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
      
      {/* AD OVERLAY - Blocks everything */}
      {activeEvent === GameEvent.AD_BREAK && (
        <div className="absolute inset-0 bg-black z-[100] flex items-center justify-center pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white text-black p-12 rounded-xl max-w-2xl w-full text-center space-y-6 shadow-[0_0_100px_rgba(255,255,255,0.2)]">
            <Tv size={64} className="mx-auto text-blue-600 animate-bounce" />
            <h1 className="text-4xl font-black uppercase">Sponsor Break</h1>
            <div className="bg-gray-100 p-4 rounded border border-gray-300">
              <p className="text-lg font-bold text-gray-600">Processing Payment...</p>
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>50% → Global Pot</span>
                <span>50% → Owner Revenue</span>
              </div>
              <div className="w-full h-4 bg-gray-300 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-blue-600 animate-[width_3s_ease-in-out_infinite]" style={{width: '100%'}}></div>
              </div>
            </div>
            <p className="text-sm text-gray-400">Thank you for supporting the Economy</p>
          </div>
        </div>
      )}

      {/* Event Banner */}
      {activeEvent === GameEvent.ACID_RAIN && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-2 rounded-b shadow-[0_0_20px_rgba(220,38,38,0.5)] font-bold flex items-center gap-3 animate-pulse">
          <CloudLightning size={24} />
          <div className="text-center">
            <div className="text-xs uppercase tracking-widest opacity-80">Environment Warning</div>
            <div className="text-lg uppercase">Acid Rain Storm</div>
          </div>
        </div>
      )}

      {/* BUILD MODE HUD */}
      {buildMode.active && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-blue-900/80 border border-blue-500 text-white px-8 py-4 rounded-lg shadow-lg flex items-center gap-6 pointer-events-none">
           <div className="text-center">
             <div className="text-xs text-blue-300 font-bold uppercase">Build Mode</div>
             <div className="text-2xl font-black">{buildMode.type}</div>
           </div>
           <div className="h-8 w-px bg-blue-500/50"></div>
           <div className="flex gap-4 text-sm font-mono">
              <div className="flex items-center gap-2"><MousePointer2 size={16}/> <span>Place</span></div>
              <div className="flex items-center gap-2"><RotateCw size={16}/> <span>[R] Rotate</span></div>
              <div className="flex items-center gap-2"><span className="text-red-300">[RMB] Cancel</span></div>
           </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="flex justify-between items-start w-full pointer-events-auto">
        <div className="flex gap-4">
          <StatCard icon={Coins} label="Personal Wallet" value={`$${money.toFixed(4)}`} subValue={`${(miningRate).toFixed(6)} / sec`} />
          
          {/* Global Pot Card */}
          <StatCard 
            icon={Globe} 
            label="Global POT" 
            value={`$${globalPot.toFixed(0)}`} 
            progress={potPercentage}
            subValue={potPercentage < 0.1 ? "CRITICAL - LOW LIQUIDITY" : "Network Funds"} 
            alert={potPercentage < 0.1}
          />
          
          <StatCard 
            icon={Cpu} 
            label="Network" 
            value={`${miningRate > 0 ? miningRigs : 0} Rigs`} 
            subValue={
              activeEvent === GameEvent.ACID_RAIN ? "STORM OFFLINE" : 
              potPercentage <= 0 ? "THROTTLED (POT EMPTY)" : 
              "Operating Normal"
            } 
            alert={activeEvent === GameEvent.ACID_RAIN || potPercentage <= 0}
          />
          
          {/* Owner Stats (Visualize the 50/50 split and fees) */}
          <StatCard 
            icon={Briefcase} 
            label="Owner Revenue" 
            value={`$${ownerBalance.toFixed(2)}`} 
            subValue="Commissions & Ads" 
          />
        </div>

        <div className="bg-black/60 backdrop-blur text-green-400 px-4 py-2 rounded border border-green-900/50 max-w-md font-mono text-sm flex items-center gap-2">
          <Terminal size={14} />
          <span className="animate-pulse">_</span>
          {marketHeadline}
        </div>
      </div>

      {/* Bottom Left: Logs */}
      <div className="flex flex-col gap-1 max-w-sm pointer-events-none opacity-80">
        {logs.map((log, i) => (
          <div key={i} className="text-sm font-mono bg-black/40 p-1 px-2 rounded text-gray-300 fade-in shadow">
            {'>'} {log}
          </div>
        ))}
        <div className="text-xs text-gray-500 mt-2">Press [E] or [TAB] to Toggle Menu</div>
      </div>

      {/* Modal Menu */}
      {isMenuOpen && (
        <div 
          className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-auto"
          onClick={(e) => e.stopPropagation()} // Prevent backdrop clicks from bubbling to document/canvas
        >
          <div 
            className="bg-gray-900 border border-gray-700 w-[800px] h-[600px] rounded-xl shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()} // Prevent clicks inside menu from bubbling
          >
            
            {/* Header */}
            <div className="bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
              <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                <Pickaxe size={20} className="text-yellow-500"/> Operations Terminal
              </h2>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleMenu(); }} 
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex flex-1 overflow-hidden">
              
              {/* Left: Inventory */}
              <div className="w-1/3 bg-gray-900/50 p-4 border-r border-gray-700 overflow-y-auto flex flex-col">
                <h3 className="text-gray-400 text-xs uppercase font-bold mb-4">Storage & Funds</h3>
                
                {/* Wallet Actions */}
                <div className="bg-gray-800 p-3 rounded border border-gray-600 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-xs">Wallet Balance</span>
                    <span className="text-green-400 font-mono">${money.toFixed(2)}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); cashOut(); }}
                    disabled={money <= 0}
                    className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition"
                  >
                    <DollarSign size={14} /> Cash Out
                  </button>
                  <div className="text-[10px] text-gray-500 mt-1 text-center">Triggers Ad • {(OWNER_FEE * 100).toFixed(0)}% Commission</div>
                </div>

                <div className="grid grid-cols-1 gap-2 flex-1 overflow-y-auto">
                  {Object.entries(inventory).map(([key, count]) => (
                    (count as number) > 0 && (
                      <div key={key} className="flex items-center justify-between bg-gray-800 p-2 rounded border border-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{ITEM_ICONS[key as ItemType] || '📦'}</span>
                          <span className="text-sm text-gray-200">{key}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-blue-400">{count as number}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); dropItem(key as ItemType); }}
                            className="p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 hover:text-white transition"
                            title="Drop 1"
                          >
                            <ArrowDownToLine size={14} />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                  
                  {/* Quick Actions */}
                  <div className="space-y-2 mt-4 pt-4 border-t border-gray-700">
                    {/* Dynamic Build Buttons for any structure type in inventory */}
                    {[ItemType.MINING_RIG, ItemType.FOUNDATION, ItemType.WALL, ItemType.ROOF].map(type => (
                       (inventory[type] as number || 0) > 0 && (
                        <button 
                          key={type}
                          onClick={(e) => { handleBuildClick(e, type); }}
                          className="w-full py-2 bg-amber-700 hover:bg-amber-600 text-white rounded font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2"
                        >
                          {type === ItemType.MINING_RIG ? <Cpu size={14}/> : <Home size={14} />} 
                          {type === ItemType.MINING_RIG ? 'Place Rig' : `Place ${type}`}
                        </button>
                       )
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Crafting */}
              <div className="w-2/3 p-4 bg-gray-800/30 overflow-y-auto">
                <h3 className="text-gray-400 text-xs uppercase font-bold mb-4 flex items-center gap-2">
                   <Hammer size={14} /> Manufacturing
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {RECIPES.map((recipe, idx) => (
                    <div key={idx} className="bg-gray-800 p-3 rounded-lg border border-gray-700 hover:border-gray-500 transition group">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                           <span className="text-2xl">{ITEM_ICONS[recipe.output]}</span>
                           <div>
                             <div className="font-bold text-sm text-white">{recipe.output}</div>
                             <div className="text-[10px] text-gray-400">x{recipe.count} • {recipe.craftTime}s</div>
                           </div>
                        </div>
                      </div>
                      
                      {/* Ingredients */}
                      <div className="space-y-1 mb-3">
                        {recipe.inputs.map((input, i) => {
                           const hasEnough = ((inventory[input.item] as number) || 0) >= input.count;
                           return (
                             <div key={i} className="flex justify-between text-xs">
                               <span className="text-gray-400">{input.item}</span>
                               <span className={hasEnough ? "text-green-400" : "text-red-400"}>
                                 {(inventory[input.item] as number || 0)}/{input.count}
                               </span>
                             </div>
                           );
                        })}
                      </div>

                      <button 
                        onClick={(e) => { e.stopPropagation(); craft(recipe); }}
                        className="w-full py-1.5 bg-gray-700 group-hover:bg-gray-600 text-white text-xs rounded font-bold transition"
                      >
                        Craft
                      </button>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
