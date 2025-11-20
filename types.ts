
export enum ItemType {
  // Raw
  STONE = 'Stone',
  METAL_ORE = 'Metal Ore',
  COPPER_ORE = 'Copper Ore',
  WOOD = 'Wood',
  RESIN = 'Resin',
  COAL = 'Coal',
  SCRAP = 'Scrap',
  
  // Processed
  SILICON = 'Silicon',
  STEEL = 'Steel',
  COPPER_WIRE = 'Copper Wire',
  PLASTIC = 'Plastic',
  
  // Components
  CIRCUIT_BOARD = 'Circuit Board',
  FRAME = 'Frame',
  
  // Buildings/Final
  MINING_RIG = 'Mining Rig',
  FOUNDATION = 'Stone Foundation',
  WALL = 'Wooden Wall',
  ROOF = 'Wooden Roof'
}

export enum GameEvent {
  NONE = 'Normal Conditions',
  ACID_RAIN = 'Acid Rain Storm',
  AD_BREAK = 'Brand Deal / Sponsor'
}

export interface Recipe {
  output: ItemType;
  count: number;
  inputs: { item: ItemType; count: number }[];
  craftTime: number; // seconds
}

export interface ResourceNodeData {
  id: string;
  type: 'TREE' | 'STONE' | 'METAL' | 'COPPER' | 'COAL' | 'JUNK' | 'LOOSE_ITEM';
  position: [number, number, number];
  health: number;
  maxHealth: number;
  drop: ItemType;
  color: string;
}

export interface Structure {
  id: string;
  type: ItemType;
  position: [number, number, number];
  rotation: number;
  ownerId?: string;
}

export interface InventoryItem {
  type: ItemType;
  count: number;
}

export enum AIAction {
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  MINING = 'MINING'
}

export interface AIPlayer {
  id: string;
  name: string;
  position: [number, number, number]; // x, y, z
  rotation: number; // y-axis rotation
  action: AIAction;
  targetNodeId: string | null;
  color: string;
  inventory: Record<string, number>;
  health: number;
  maxHealth: number;
}

export const AD_REVENUE = 1000; // Brand deal amount
export const MAX_POT = 10000;
export const OWNER_FEE = 0.05; // 5% Commission on Cash Out
export const BRAND_SPLIT = 0.50; // 50% Split on Brand Deals

export const RECIPES: Recipe[] = [
  // Processing Raw Materials
  {
    output: ItemType.SILICON,
    count: 1,
    inputs: [{ item: ItemType.STONE, count: 2 }, { item: ItemType.COAL, count: 1 }],
    craftTime: 2
  },
  {
    output: ItemType.STEEL,
    count: 1,
    inputs: [{ item: ItemType.METAL_ORE, count: 2 }, { item: ItemType.COAL, count: 1 }],
    craftTime: 3
  },
  {
    output: ItemType.COPPER_WIRE,
    count: 2,
    inputs: [{ item: ItemType.COPPER_ORE, count: 1 }, { item: ItemType.COAL, count: 1 }],
    craftTime: 2
  },
  {
    output: ItemType.PLASTIC,
    count: 1,
    inputs: [{ item: ItemType.RESIN, count: 2 }, { item: ItemType.COAL, count: 1 }],
    craftTime: 2
  },
  
  // Components
  {
    output: ItemType.CIRCUIT_BOARD,
    count: 1,
    inputs: [
      { item: ItemType.SILICON, count: 2 },
      { item: ItemType.COPPER_WIRE, count: 3 },
      { item: ItemType.PLASTIC, count: 1 }
    ],
    craftTime: 5
  },
  {
    output: ItemType.FRAME,
    count: 1,
    inputs: [
      { item: ItemType.STEEL, count: 4 },
      { item: ItemType.SCRAP, count: 2 }
    ],
    craftTime: 4
  },

  // Final
  {
    output: ItemType.MINING_RIG,
    count: 1,
    inputs: [
      { item: ItemType.CIRCUIT_BOARD, count: 3 },
      { item: ItemType.FRAME, count: 1 },
      { item: ItemType.PLASTIC, count: 2 }
    ],
    craftTime: 10
  },
  {
    output: ItemType.FOUNDATION,
    count: 1,
    inputs: [{ item: ItemType.STONE, count: 4 }, { item: ItemType.WOOD, count: 1 }],
    craftTime: 5
  },
  {
    output: ItemType.WALL,
    count: 1,
    inputs: [{ item: ItemType.WOOD, count: 4 }],
    craftTime: 3
  },
  {
    output: ItemType.ROOF,
    count: 1,
    inputs: [{ item: ItemType.WOOD, count: 4 }],
    craftTime: 3
  }
];

export const ITEM_ICONS: Record<ItemType, string> = {
  [ItemType.STONE]: '🪨',
  [ItemType.METAL_ORE]: '⛰️',
  [ItemType.COPPER_ORE]: '🟠',
  [ItemType.WOOD]: '🪵',
  [ItemType.RESIN]: '💧',
  [ItemType.COAL]: '⚫',
  [ItemType.SCRAP]: '🔩',
  [ItemType.SILICON]: '⬛',
  [ItemType.STEEL]: '⛓️',
  [ItemType.COPPER_WIRE]: '➰',
  [ItemType.PLASTIC]: '🥤',
  [ItemType.CIRCUIT_BOARD]: '📟',
  [ItemType.FRAME]: '🏗️',
  [ItemType.MINING_RIG]: '💻',
  [ItemType.FOUNDATION]: '⬛',
  [ItemType.WALL]: '🧱',
  [ItemType.ROOF]: '⛺'
};
