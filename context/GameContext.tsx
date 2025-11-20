
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { InventoryItem, ItemType, Recipe, ResourceNodeData, RECIPES, GameEvent, Structure, AD_REVENUE, MAX_POT, OWNER_FEE, BRAND_SPLIT, AIPlayer, AIAction } from '../types';
import { generateMarketNews } from '../services/geminiService';

// --- Terrain Utility ---
// Exported so GameCanvas can use it for mesh generation and physics without Hook overhead
export const getTerrainHeight = (x: number, z: number): number => {
  // Large rolling hills
  const largeScale = (Math.sin(x * 0.02) + Math.cos(z * 0.02)) * 4;
  // Medium detail
  const mediumScale = (Math.sin(x * 0.05 + 1) + Math.cos(z * 0.05 + 2)) * 2;
  // Small bumps
  const smallScale = (Math.sin(x * 0.15) * Math.cos(z * 0.15)) * 0.5;
  
  return largeScale + mediumScale + smallScale;
};

interface BuildState {
  active: boolean;
  type: ItemType | null;
  rotation: number;
}

interface GameState {
  inventory: Record<string, number>;
  money: number;
  globalPot: number;
  ownerBalance: number;
  miningRigs: number;
  miningRate: number; // $/sec
  marketModifier: number;
  marketHeadline: string;
  activeEvent: GameEvent;
  isMenuOpen: boolean;
  buildMode: BuildState;
  logs: string[];
  resources: ResourceNodeData[];
  structures: Structure[];
  aiPlayers: AIPlayer[];
  // x, y, z, dirX, dirZ
  playerPosRef: React.MutableRefObject<[number, number, number, number, number]>;
}

interface GameContextType extends GameState {
  addToInventory: (item: ItemType, count: number) => void;
  dropItem: (item: ItemType) => void;
  craft: (recipe: Recipe) => boolean;
  toggleMenu: () => void;
  startBuildMode: (type: ItemType) => void;
  cancelBuildMode: () => void;
  rotateBuild: () => void;
  confirmBuild: (position: [number, number, number]) => void;
  addLog: (msg: string) => void;
  updateResource: (id: string, newData: ResourceNodeData) => void;
  destroyNode: (id: string) => void;
  hitNode: (id: string, isBot?: boolean) => void;
  hitStructure: (id: string) => void;
  hitPlayer: (id: string) => void;
  checkCollision: (x: number, z: number, ignoreId?: string) => boolean;
  triggerAd: (reason: string) => void;
  handleDeath: () => void;
  cashOut: () => void;
  pickupStructure: (id: string) => void;
  claimStructure: (id: string) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
};

const BASE_MINING_RATE = 0.000083; // $/sec per rig

// --- Generation Helper ---
const generateResources = (count: number, range: number): ResourceNodeData[] => {
  const nodes: ResourceNodeData[] = [];
  for (let i = 0; i < count; i++) {
    const typeRoll = Math.random();
    let type: ResourceNodeData['type'] = 'STONE';
    let drop = ItemType.STONE;
    let color = '#888888';
    let maxHealth = 3;

    if (typeRoll < 0.3) {
      type = 'TREE';
      drop = ItemType.WOOD; 
      color = '#4a6b38';
      maxHealth = 4;
    } else if (typeRoll < 0.5) {
      type = 'STONE';
      drop = ItemType.STONE;
      color = '#777';
      maxHealth = 3;
    } else if (typeRoll < 0.65) {
      type = 'COAL';
      drop = ItemType.COAL;
      color = '#1a1a1a';
      maxHealth = 2;
    } else if (typeRoll < 0.8) {
      type = 'COPPER';
      drop = ItemType.COPPER_ORE;
      color = '#b87333';
      maxHealth = 4;
    } else if (typeRoll < 0.9) {
      type = 'METAL';
      drop = ItemType.METAL_ORE;
      color = '#64748b';
      maxHealth = 5;
    } else {
      type = 'JUNK';
      drop = ItemType.SCRAP;
      color = '#a855f7';
      maxHealth = 2;
    }

    const x = (Math.random() - 0.5) * range;
    const z = (Math.random() - 0.5) * range;
    const y = getTerrainHeight(x, z);

    // Don't spawn underwater if possible (assuming water at -3)
    if (y < -2.5 && type !== 'JUNK') continue;

    nodes.push({
      id: `node-${i}`,
      type,
      position: [x, y, z],
      health: maxHealth,
      maxHealth,
      drop,
      color
    });
  }
  return nodes;
};

const generateAIPlayers = (count: number, resources: ResourceNodeData[]): AIPlayer[] => {
  const bots: AIPlayer[] = [];
  for (let i = 0; i < count; i++) {
    let x = 0, z = 0, y = 0;
    let validPosition = false;
    let attempts = 0;

    // Try finding a safe spawn spot
    while (!validPosition && attempts < 20) {
        x = (Math.random() - 0.5) * 80;
        z = (Math.random() - 0.5) * 80;
        y = getTerrainHeight(x, z);
        
        // Avoid water
        if (y < -1.5) {
            attempts++;
            continue;
        }

        // Collision check against resources
        let hit = false;
        for (const r of resources) {
            const dx = x - r.position[0];
            const dz = z - r.position[2];
            if (Math.sqrt(dx*dx + dz*dz) < 2.0) { // 2m safety radius
                hit = true;
                break;
            }
        }
        
        if (!hit) validPosition = true;
        attempts++;
    }
    
    bots.push({
      id: `bot-${i}-${Date.now()}`,
      name: `Bot-${['Alpha', 'Beta', 'Delta', 'Gamma', 'Omega', 'Zeta'][i % 6]}`,
      position: [x, y, z],
      rotation: Math.random() * Math.PI * 2,
      action: AIAction.IDLE,
      targetNodeId: null,
      color: `hsl(${Math.random() * 360}, 60%, 50%)`,
      inventory: {
        // Give them a starter kit to build a rig immediately
        [ItemType.CIRCUIT_BOARD]: 3,
        [ItemType.FRAME]: 1,
        [ItemType.PLASTIC]: 2,
        [ItemType.COAL]: 5 // Fuel to keep going
      },
      health: 100,
      maxHealth: 100
    });
  }
  return bots;
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [inventory, setInventory] = useState<Record<string, number>>({
    [ItemType.STONE]: 0, 
  });
  const [money, setMoney] = useState(0);
  const [globalPot, setGlobalPot] = useState(2500); 
  const [ownerBalance, setOwnerBalance] = useState(0); // Track Owner's 50% split and 5% fees
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [buildMode, setBuildMode] = useState<BuildState>({ active: false, type: null, rotation: 0 });
  const [marketModifier, setMarketModifier] = useState(1.0);
  const [marketHeadline, setMarketHeadline] = useState("Market Initialize...");
  const [activeEvent, setActiveEvent] = useState<GameEvent>(GameEvent.NONE);
  const [logs, setLogs] = useState<string[]>([]);
  
  // World State
  const [resources, setResources] = useState<ResourceNodeData[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [aiPlayers, setAIPlayers] = useState<AIPlayer[]>([]);
  
  // State Refs for Collision Logic (avoids stale closures in intervals/callbacks)
  const resourcesRef = useRef(resources);
  const structuresRef = useRef(structures);
  const aiPlayersRef = useRef(aiPlayers);
  
  // Keep refs synced
  useEffect(() => { resourcesRef.current = resources; }, [resources]);
  useEffect(() => { structuresRef.current = structures; }, [structures]);
  useEffect(() => { aiPlayersRef.current = aiPlayers; }, [aiPlayers]);
  
  // Player Position: x, y, z, dirX, dirZ
  const playerPosRef = useRef<[number, number, number, number, number]>([0, 5, 5, 1, 0]); 

  // Derived Mining Rigs count based on placed structures
  const miningRigs = useMemo(() => structures.filter(s => s.type === ItemType.MINING_RIG && !s.ownerId).length, [structures]);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 5));
  }, []);

  // Trigger Brand Deal / Ad
  const triggerAd = useCallback((reason: string) => {
    setActiveEvent(GameEvent.AD_BREAK);
    addLog(`SPONSOR: ${reason}`);
    
    // Duration 4 seconds
    setTimeout(() => {
      // 50% to Pot, 50% to Owner
      const totalPayment = AD_REVENUE;
      const potShare = totalPayment * BRAND_SPLIT;
      const ownerShare = totalPayment * (1 - BRAND_SPLIT);

      setGlobalPot(prev => Math.min(prev + potShare, MAX_POT));
      setOwnerBalance(prev => prev + ownerShare);

      addLog(`Deal Closed: $${potShare} to Pot, $${ownerShare} to Owner.`);
      setActiveEvent(GameEvent.NONE);
    }, 4000);
  }, [addLog]);

  // Initial Generation & Login Ad
  useEffect(() => {
    const initResources = generateResources(150, 150);
    setResources(initResources); 
    setAIPlayers(generateAIPlayers(5, initResources));
    setTimeout(() => triggerAd("Login Sponsor"), 1000);
  }, [triggerAd]);

  // Environmental Event Loop
  useEffect(() => {
    const eventCycle = setInterval(() => {
      if (activeEvent !== GameEvent.NONE) return;

      if (Math.random() > 0.85) {
        setActiveEvent(GameEvent.ACID_RAIN);
        addLog("WARNING: Acid Rain detected! Mining Rigs going offline.");

        setTimeout(() => {
          setActiveEvent(GameEvent.NONE);
          addLog("Environmental conditions normalizing.");
        }, 20000);
      }
    }, 30000); 

    return () => clearInterval(eventCycle);
  }, [addLog, activeEvent]);

  // Market Simulation Loop
  useEffect(() => {
    const updateMarket = async () => {
      const news = await generateMarketNews(marketModifier);
      setMarketHeadline(news.headline);
      setMarketModifier(news.modifier);
      if (activeEvent === GameEvent.NONE) {
        addLog(`MARKET: ${news.headline}`);
      }
    };

    updateMarket();
    const interval = setInterval(updateMarket, 30000); 
    return () => clearInterval(interval);
  }, [addLog, activeEvent]);

  // Mining Loop (Computers mine from Global Pot)
  useEffect(() => {
    const totalRigs = structures.filter(s => s.type === ItemType.MINING_RIG).length;
    if (totalRigs === 0) return;
    
    const interval = setInterval(() => {
      if (activeEvent === GameEvent.ACID_RAIN || activeEvent === GameEvent.AD_BREAK) return;
      
      // Pot availability logic
      let availableFactor = 1.0;
      if (globalPot <= 0) {
        availableFactor = 0.1; 
      }

      // Calculate total draw from pot (Players + Bots)
      const basePerRig = BASE_MINING_RATE * marketModifier * availableFactor;
      const totalDraw = totalRigs * basePerRig;
      
      // Deduct from Pot
      if (globalPot > 0) {
         setGlobalPot(prev => Math.max(0, prev - totalDraw));
      }

      // Add to Player Wallet (only for rigs owned by player)
      const playerRigs = structures.filter(s => s.type === ItemType.MINING_RIG && !s.ownerId).length;
      const playerIncome = playerRigs * basePerRig;
      
      if (playerIncome > 0) {
        setMoney(prev => prev + playerIncome);
      }
      
    }, 1000);
    
    return () => clearInterval(interval);
  }, [structures, marketModifier, activeEvent, globalPot]);

  const addToInventory = useCallback((item: ItemType, count: number) => {
    setInventory(prev => ({
      ...prev,
      [item]: (prev[item] || 0) + count
    }));
  }, []);

  const dropItem = useCallback((item: ItemType) => {
    setInventory(prev => {
      if ((prev[item] || 0) > 0) {
         // Side effect inside setter to ensure sync state usage? 
         // Better to keep logic clean, but for now we need position ref
         const [px, py, pz, dx, dz] = playerPosRef.current;
         const dropDistance = 1.5; 
         const randomOffset = (Math.random() - 0.5) * 0.2;

         const nx = px + (dx * dropDistance) + (-dz * randomOffset);
         const nz = pz + (dz * dropDistance) + (dx * randomOffset);
         const ny = getTerrainHeight(nx, nz);

         const newNode: ResourceNodeData = {
           id: `drop-${Date.now()}-${Math.random()}`,
           type: 'LOOSE_ITEM',
           position: [nx, ny, nz],
           health: 1,
           maxHealth: 1,
           drop: item,
           color: '#ffffff'
         };
         
         // We need to update resources state too
         setResources(curr => [...curr, newNode]);
         addLog(`Dropped ${item}`);
         
         return { ...prev, [item]: prev[item] - 1 };
      }
      return prev;
    });
  }, [addLog]);

  const spawnLoot = (pos: [number, number, number], item: ItemType, count: number) => {
     // Cap drops to avoid crashing if bot has 1000 items
     const dropCount = Math.min(count, 10); 
     
     setResources(prev => {
        const newNodes: ResourceNodeData[] = [];
        for(let i=0; i<dropCount; i++) {
            const offsetX = (Math.random() - 0.5) * 1.5;
            const offsetZ = (Math.random() - 0.5) * 1.5;
            const nx = pos[0] + offsetX;
            const nz = pos[2] + offsetZ;
            const ny = getTerrainHeight(nx, nz) + 0.5; // slight air drop

            newNodes.push({
                id: `loot-${Date.now()}-${Math.random()}`,
                type: 'LOOSE_ITEM',
                position: [nx, ny, nz],
                health: 1,
                maxHealth: 1,
                drop: item,
                color: '#ffffff'
            });
        }
        return [...prev, ...newNodes];
     });
  };

  const craft = useCallback((recipe: Recipe): boolean => {
    // We need to check current inventory. 
    // setState updater pattern can be used for atomic updates, 
    // but checking condition requires access to state.
    // Since this is triggered by UI click, reading state from render scope is generally safe 
    // IF craft is recreated on inventory change.
    // Due to useCallback dependencies, we must add inventory.
    
    // However, to prevent recreation on every money tick, we can use a Ref or just accept it recreates on inventory change.
    // Since inventory only changes on interaction, it's fine.
    // But to be safe inside the function:
    
    setInventory(currentInv => {
        for (const input of recipe.inputs) {
            if ((currentInv[input.item] || 0) < input.count) {
                addLog(`Missing ${input.item}`);
                return currentInv;
            }
        }

        const newInv = { ...currentInv };
        for (const input of recipe.inputs) {
            newInv[input.item] -= input.count;
        }
        newInv[recipe.output] = (newInv[recipe.output] || 0) + recipe.count;
        
        addLog(`Crafted ${recipe.output}`);
        if (recipe.output === ItemType.MINING_RIG) {
            addLog("TIP: Place Rig from Inventory to start mining.");
        }
        return newInv;
    });

    return true; 
  }, [addLog]);

  const startBuildMode = useCallback((type: ItemType) => {
    setBuildMode({ active: true, type, rotation: 0 });
    setIsMenuOpen(false);
    addLog(`Placing: ${type}`);
  }, [addLog]);

  const cancelBuildMode = useCallback(() => {
    setBuildMode({ active: false, type: null, rotation: 0 });
  }, []);

  const rotateBuild = useCallback(() => {
    setBuildMode(prev => ({ ...prev, rotation: prev.rotation + (Math.PI / 2) }));
  }, []);

  const confirmBuild = useCallback((position: [number, number, number]) => {
    setBuildMode(currentBuild => {
        if (!currentBuild.active || !currentBuild.type) return currentBuild;

        setInventory(currentInv => {
             if ((currentInv[currentBuild.type!] || 0) > 0) {
                 const newStruct: Structure = {
                    id: `struct-${Date.now()}-${Math.random()}`,
                    type: currentBuild.type!,
                    position,
                    rotation: currentBuild.rotation
                 };
                 setStructures(prev => [...prev, newStruct]);
                 addLog(`Built ${currentBuild.type}`);
                 
                 const newCount = currentInv[currentBuild.type!] - 1;
                 if (newCount <= 0) {
                     // Schedule close
                     setTimeout(() => setBuildMode({ active: false, type: null, rotation: 0 }), 0);
                 }
                 return { ...currentInv, [currentBuild.type!]: newCount };
             }
             return currentInv;
        });
        return currentBuild;
    });
  }, [addLog]);

  const pickupStructure = useCallback((id: string) => {
    setStructures(currentStructs => {
        const struct = currentStructs.find(s => s.id === id);
        if (!struct) return currentStructs;

        if (struct.ownerId) {
          addLog("Access Denied. Press 'C' to Hack/Claim first.");
          return currentStructs;
        }

        addLog(`Picked up ${struct.type}`);
        addToInventory(struct.type, 1);
        return currentStructs.filter(s => s.id !== id);
    });
  }, [addLog, addToInventory]);

  const claimStructure = useCallback((id: string) => {
    setStructures(prev => prev.map(s => {
      if (s.id === id && s.ownerId) {
        addLog("Hacked & Claimed Mining Rig!");
        return { ...s, ownerId: undefined };
      } else if (s.id === id && !s.ownerId) {
        addLog("You already own this.");
        return s;
      }
      return s;
    }));
  }, [addLog]);

  const hitStructure = useCallback((id: string) => {
    setStructures(currentStructs => {
        const struct = currentStructs.find(s => s.id === id);
        if (!struct) return currentStructs;

        const recipe = RECIPES.find(r => r.output === struct.type);
        if (recipe) {
            recipe.inputs.forEach(input => {
                addToInventory(input.item, input.count);
            });
            addLog(`Destroyed ${struct.type}. Refunded resources.`);
        } else {
            addToInventory(struct.type, 1);
            addLog(`Destroyed ${struct.type}. Item retrieved.`);
        }
        return currentStructs.filter(s => s.id !== id);
    });
  }, [addLog, addToInventory]);

  const updateResource = useCallback((id: string, newData: ResourceNodeData) => {
    setResources(prev => prev.map(r => r.id === id ? newData : r));
  }, []);

  const destroyNode = useCallback((id: string) => {
    setResources(prev => {
      const node = prev.find(n => n.id === id);
      if (!node) return prev;

      if (node.type === 'LOOSE_ITEM') {
        return prev.filter(n => n.id !== id);
      }

      setTimeout(() => {
        setResources(current => {
           return current.map(r => {
             if (r.id !== id) return r;
             const range = 140;
             let rx = (Math.random() - 0.5) * range;
             let rz = (Math.random() - 0.5) * range;
             let ry = getTerrainHeight(rx, rz);

             if (ry < -2.0 && r.type !== 'JUNK') {
                 rx = (Math.random() - 0.5) * range;
                 rz = (Math.random() - 0.5) * range;
                 ry = getTerrainHeight(rx, rz);
             }

             return {
               ...r,
               health: r.maxHealth,
               position: [rx, ry, rz]
             };
           });
        });
      }, 15000 + Math.random() * 15000);

      return prev.map(n => n.id === id ? { ...n, health: 0, position: [0, -1000, 0] } : n);
    });
  }, []);

  const hitNode = useCallback((id: string, isBot: boolean = false) => {
    setResources(currentResources => {
        const node = currentResources.find(n => n.id === id);
        if (!node || node.health <= 0) return currentResources;

        const newHealth = node.health - 1;
        
        if (newHealth <= 0) {
          if (!isBot) {
            addToInventory(node.drop, 1);
            if (node.type === 'TREE') {
              addToInventory(ItemType.RESIN, 1);
              addLog(`+1 ${ItemType.RESIN}`);
            }
            addLog(`Harvested ${node.drop}`);
          } else {
            addLog(`A bot mined ${node.type}!`);
          }
          
          setTimeout(() => destroyNode(id), 0); 
          return currentResources.map(r => r.id === id ? { ...r, health: 0 } : r);
        } else {
          if (!isBot) addLog(`Mining... ${Math.ceil((newHealth / node.maxHealth) * 100)}%`);
          return currentResources.map(r => r.id === id ? { ...r, health: newHealth } : r);
        }
    });
  }, [addToInventory, addLog, destroyNode]);

  const hitPlayer = useCallback((id: string) => {
    setAIPlayers(currentPlayers => {
       const bot = currentPlayers.find(b => b.id === id);
       if (!bot) return currentPlayers;

       const newHealth = bot.health - 25;
       
       if (newHealth <= 0) {
          addLog(`Killed ${bot.name}!`);
          
          // Drop inventory
          Object.entries(bot.inventory).forEach(([key, val]) => {
             const count = val as number;
             if (count > 0) {
                spawnLoot(bot.position, key as ItemType, count);
             }
          });

          // Respawn later
          setTimeout(() => {
             setAIPlayers(curr => [...curr, ...generateAIPlayers(1, resourcesRef.current)]);
          }, 30000);

          return currentPlayers.filter(b => b.id !== id);
       } else {
          return currentPlayers.map(b => b.id === id ? { ...b, health: newHealth } : b);
       }
    });
  }, [addLog]);

  const checkCollision = useCallback((x: number, z: number, ignoreId?: string): boolean => {
     if (x < -98 || x > 98 || z < -98 || z > 98) return true;

     const playerRadius = 0.5;
     
     // Use Refs to get latest state without closure staleness
     for (const r of resourcesRef.current) {
       if (r.type === 'LOOSE_ITEM') continue;

       const dx = x - r.position[0];
       const dz = z - r.position[2];
       const dist = Math.sqrt(dx*dx + dz*dz);
       const objectRadius = r.type === 'TREE' ? 0.5 : 1.0;
       if (dist < (playerRadius + objectRadius)) return true;
     }

     for (const s of structuresRef.current) {
       const dx = x - s.position[0];
       const dz = z - s.position[2];
       const dist = Math.sqrt(dx*dx + dz*dz);
       
       let structRadius = 1.0;
       if (s.type === ItemType.FOUNDATION) structRadius = 2.0;
       if (s.type === ItemType.WALL) structRadius = 1.5;
       if (s.type === ItemType.MINING_RIG) structRadius = 0.5;
       
       if (dist < (playerRadius + structRadius)) return true;
     }
     
     // AI Collision
     for (const ai of aiPlayersRef.current) {
       if (ai.id === ignoreId) continue;
       const dx = x - ai.position[0];
       const dz = z - ai.position[2];
       const dist = Math.sqrt(dx*dx + dz*dz);
       if (dist < 1.0) return true;
     }

     // Main Player Collision (If called by a bot)
     if (ignoreId) {
       const [px, , pz] = playerPosRef.current;
       const dx = x - px;
       const dz = z - pz;
       const dist = Math.sqrt(dx*dx + dz*dz);
       if (dist < 1.0) return true;
     }
     
     return false;
  }, []);

  // --- AI Loop ---
  useEffect(() => {
    const interval = setInterval(() => {
      setAIPlayers(currentBots => {
        return currentBots.map(bot => {
          let { id, position, action, targetNodeId, rotation, inventory: botInv } = bot;
          let [x, y, z] = position;
          
          // 1. Intelligent Crafting Logic
          // Check if we can craft components for Mining Rig
          // Always check (100% chance) so they craft immediately upon spawning
          
           // Silicon
           if ((botInv?.[ItemType.STONE] || 0) >= 2 && (botInv?.[ItemType.COAL] || 0) >= 1) {
               botInv[ItemType.STONE] -= 2; botInv[ItemType.COAL] -= 1;
               botInv[ItemType.SILICON] = (botInv[ItemType.SILICON] || 0) + 1;
           }
           // Steel
           if ((botInv?.[ItemType.METAL_ORE] || 0) >= 2 && (botInv?.[ItemType.COAL] || 0) >= 1) {
               botInv[ItemType.METAL_ORE] -= 2; botInv[ItemType.COAL] -= 1;
               botInv[ItemType.STEEL] = (botInv[ItemType.STEEL] || 0) + 1;
           }
           // Copper Wire
           if ((botInv?.[ItemType.COPPER_ORE] || 0) >= 1 && (botInv?.[ItemType.COAL] || 0) >= 1) {
               botInv[ItemType.COPPER_ORE] -= 1; botInv[ItemType.COAL] -= 1;
               botInv[ItemType.COPPER_WIRE] = (botInv[ItemType.COPPER_WIRE] || 0) + 2;
           }
           // Plastic
           if ((botInv?.[ItemType.RESIN] || 0) >= 2 && (botInv?.[ItemType.COAL] || 0) >= 1) {
               botInv[ItemType.RESIN] -= 2; botInv[ItemType.COAL] -= 1;
               botInv[ItemType.PLASTIC] = (botInv[ItemType.PLASTIC] || 0) + 1;
           }
           
           // Components
           // Circuit Board
           if ((botInv?.[ItemType.SILICON] || 0) >= 2 && (botInv?.[ItemType.COPPER_WIRE] || 0) >= 3 && (botInv?.[ItemType.PLASTIC] || 0) >= 1) {
               botInv[ItemType.SILICON] -= 2; botInv[ItemType.COPPER_WIRE] -= 3; botInv[ItemType.PLASTIC] -= 1;
               botInv[ItemType.CIRCUIT_BOARD] = (botInv[ItemType.CIRCUIT_BOARD] || 0) + 1;
           }
           // Frame
           if ((botInv?.[ItemType.STEEL] || 0) >= 4 && (botInv?.[ItemType.SCRAP] || 0) >= 2) {
               botInv[ItemType.STEEL] -= 4; botInv[ItemType.SCRAP] -= 2;
               botInv[ItemType.FRAME] = (botInv[ItemType.FRAME] || 0) + 1;
           }

           // Final: Mining Rig
           if ((botInv?.[ItemType.CIRCUIT_BOARD] || 0) >= 3 && (botInv?.[ItemType.FRAME] || 0) >= 1 && (botInv?.[ItemType.PLASTIC] || 0) >= 2) {
               botInv[ItemType.CIRCUIT_BOARD] -= 3; botInv[ItemType.FRAME] -= 1; botInv[ItemType.PLASTIC] -= 2;
               botInv[ItemType.MINING_RIG] = (botInv[ItemType.MINING_RIG] || 0) + 1;
               addLog(`${bot.name} crafted a Mining Rig!`);
           }
          

          // 2. Building Logic
          if ((botInv?.[ItemType.MINING_RIG] || 0) > 0) {
             action = AIAction.MOVING; 
             // Just place it where they stand - Increased chance to 0.2 for faster placement
             if (Math.random() < 0.2) {
                setStructures(prev => [...prev, {
                    id: `bot-struct-${Date.now()}-${Math.random()}`,
                    type: ItemType.MINING_RIG,
                    position: [x, y, z],
                    rotation: Math.random() * Math.PI * 2,
                    ownerId: id
                }]);
                botInv[ItemType.MINING_RIG]--;
                addLog(`${bot.name} placed a Mining Rig!`);
             }
          }

          // 3. Movement / Mining FSM
          if (action === AIAction.IDLE || (action === AIAction.MINING && !targetNodeId)) {
             // Smart Targeting: Find what we need
             let neededType: ResourceNodeData['type'] | null = null;
             
             // Coal is critical for almost everything
             if ((botInv?.[ItemType.COAL] || 0) < 5) neededType = 'COAL';
             // Need Resin for plastic
             else if ((botInv?.[ItemType.RESIN] || 0) < 5) neededType = 'TREE';
             // Need Stone for Silicon
             else if ((botInv?.[ItemType.STONE] || 0) < 5) neededType = 'STONE';
             // Need Metal
             else if ((botInv?.[ItemType.METAL_ORE] || 0) < 5) neededType = 'METAL';
             // Need Copper
             else if ((botInv?.[ItemType.COPPER_ORE] || 0) < 2) neededType = 'COPPER';
             // Need Scrap
             else if ((botInv?.[ItemType.SCRAP] || 0) < 2) neededType = 'JUNK';

             const nearest = resourcesRef.current.find(r => {
                if (r.health <= 0 || r.type === 'LOOSE_ITEM') return false;
                
                // Prioritize needed type, but take anything if close
                if (neededType && r.type !== neededType) return false;

                const dist = Math.sqrt(Math.pow(r.position[0] - x, 2) + Math.pow(r.position[2] - z, 2));
                return dist < 50; 
             });
             
             // Fallback if specific resource not found nearby
             const fallbackNearest = !nearest ? resourcesRef.current.find(r => r.health > 0 && r.type !== 'LOOSE_ITEM' && Math.sqrt(Math.pow(r.position[0] - x, 2) + Math.pow(r.position[2] - z, 2)) < 30) : null;

             const target = nearest || fallbackNearest;

             if (target) {
               targetNodeId = target.id;
               action = AIAction.MOVING;
             } else {
               action = AIAction.MOVING;
               // Random walk
               rotation = Math.random() * Math.PI * 2;
             }
          }

          if (action === AIAction.MOVING) {
             let tx = x, tz = z;
             let move = true;
             
             if (targetNodeId) {
               const target = resourcesRef.current.find(r => r.id === targetNodeId);
               if (!target || target.health <= 0) {
                 targetNodeId = null;
                 action = AIAction.IDLE;
                 move = false;
               } else {
                 tx = target.position[0];
                 tz = target.position[2];
                 
                 const dx = tx - x;
                 const dz = tz - z;
                 const dist = Math.sqrt(dx*dx + dz*dz);
                 
                 if (dist < 2.0) {
                   action = AIAction.MINING;
                   move = false;
                 } else {
                   rotation = Math.atan2(dx, dz);
                 }
               }
             } 

             if (move) {
                 const speed = 4.0 * 0.1;
                 const nextX = x + Math.sin(rotation) * speed;
                 const nextZ = z + Math.cos(rotation) * speed;

                 // Check Collision before moving
                 if (!checkCollision(nextX, nextZ, id)) {
                    x = nextX;
                    z = nextZ;
                 } else {
                    // Simple Obstacle Avoidance / Sliding
                    // Try moving X only
                    if (!checkCollision(nextX, z, id)) {
                        x = nextX;
                    } 
                    // Try moving Z only
                    else if (!checkCollision(x, nextZ, id)) {
                        z = nextZ;
                    } else {
                        // Stuck? Rotate randomly
                        rotation += Math.PI / 2;
                        action = AIAction.IDLE; 
                    }
                 }
                 y = getTerrainHeight(x, z);
             }
          }

          if (action === AIAction.MINING) {
             if (targetNodeId) {
               const target = resourcesRef.current.find(r => r.id === targetNodeId);
               if (target && target.health > 0) {
                  if (Math.random() < 0.2) {
                     hitNode(targetNodeId, true);
                     // Add to Bot Inventory
                     botInv[target.drop] = (botInv[target.drop] || 0) + 1;
                     if (target.type === 'TREE') botInv[ItemType.RESIN] = (botInv[ItemType.RESIN] || 0) + 1;
                  }
               } else {
                  action = AIAction.IDLE;
                  targetNodeId = null;
               }
             } else {
               action = AIAction.IDLE;
             }
          }

          return { ...bot, position: [x, y, z], rotation, action, targetNodeId, inventory: botInv };
        });
      });
    }, 100); 

    return () => clearInterval(interval);
  }, [checkCollision, hitNode, addLog]); // Refs handle the data deps

  const handleDeath = useCallback(() => {
    addLog("CRITICAL ERROR: Connection Lost (You Died).");
    triggerAd("System Reboot");
  }, [addLog, triggerAd]);

  const cashOut = useCallback(() => {
    setMoney(prevMoney => {
      if (prevMoney <= 0) {
        addLog("No funds to cash out.");
        return prevMoney;
      }
      
      const fee = prevMoney * OWNER_FEE;
      const payout = prevMoney - fee;

      setOwnerBalance(prev => prev + fee);
      triggerAd("Cash Out Transaction");
      addLog(`Withdrawn $${payout.toFixed(2)}. Owner Commission: $${fee.toFixed(2)}`);
      return 0;
    });
  }, [addLog, triggerAd]);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen(prev => !prev);
    setBuildMode(prev => ({ ...prev, active: false }));
  }, []);

  const currentMiningRate = activeEvent === GameEvent.ACID_RAIN || activeEvent === GameEvent.AD_BREAK 
    ? 0 
    : (miningRigs * BASE_MINING_RATE * marketModifier * (globalPot > 0 ? 1.0 : 0.1)); 

  return (
    <GameContext.Provider value={{
      inventory,
      money,
      globalPot,
      ownerBalance,
      miningRigs,
      miningRate: currentMiningRate,
      marketModifier,
      marketHeadline,
      activeEvent,
      isMenuOpen,
      buildMode,
      logs,
      resources,
      structures,
      aiPlayers,
      playerPosRef,
      addToInventory,
      dropItem,
      craft,
      toggleMenu,
      startBuildMode,
      cancelBuildMode,
      rotateBuild,
      confirmBuild,
      addLog,
      updateResource,
      destroyNode,
      hitNode,
      hitStructure,
      hitPlayer,
      checkCollision,
      triggerAd,
      handleDeath,
      cashOut,
      pickupStructure,
      claimStructure
    }}>
      {children}
    </GameContext.Provider>
  );
};
