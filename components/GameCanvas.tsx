
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Sky, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useGame, getTerrainHeight } from '../context/GameContext';
import { ItemType, ResourceNodeData, GameEvent, AIPlayer, AIAction } from '../types';

// --- Components ---

const Rain = ({ count = 1000 }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 40;
      const y = Math.random() * 20;
      const z = (Math.random() - 0.5) * 40;
      temp.push({ x, y, z, speed: 0.5 + Math.random() * 0.5 });
    }
    return temp;
  }, [count]);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current) return;

    particles.forEach((particle, i) => {
      particle.y -= particle.speed;
      if (particle.y < 0) {
        particle.y = 20;
        particle.x = camera.position.x + (Math.random() - 0.5) * 40;
        particle.z = camera.position.z + (Math.random() - 0.5) * 40;
      }
      
      dummy.position.set(particle.x, particle.y, particle.z);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <cylinderGeometry args={[0.02, 0.02, 0.5]} />
      <meshBasicMaterial color="#88cc44" transparent opacity={0.6} />
    </instancedMesh>
  );
};

const Terrain = () => {
  const { activeEvent } = useGame();
  
  const geometry = useMemo(() => {
    const size = 200;
    const segments = 256; 
    const geom = new THREE.PlaneGeometry(size, size, segments, segments);
    const posAttribute = geom.attributes.position;

    // Apply terrain height function to Z (which becomes Y after rotation)
    for (let i = 0; i < posAttribute.count; i++) {
      const x = posAttribute.getX(i);
      const y = posAttribute.getY(i); 
      // Invert Y for Z lookup because of -90deg rotation mapping Local Y to World -Z
      const height = getTerrainHeight(x, -y); 
      posAttribute.setZ(i, height);
    }
    
    geom.computeVertexNormals();
    return geom;
  }, []);

  return (
    <group>
      {/* Ground */}
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <meshStandardMaterial 
          color={activeEvent === GameEvent.ACID_RAIN ? "#2a332a" : "#3a5a40"} 
          flatShading={true}
          roughness={1}
        />
      </mesh>
      
      {/* Water Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial 
          color="#4fc3f7" 
          transparent 
          opacity={0.6} 
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>
    </group>
  );
};

const PlayerController = () => {
  const { camera } = useThree();
  const { checkCollision, playerPosRef, handleDeath, activeEvent, buildMode } = useGame();
  const baseSpeed = 8;
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame((state, delta) => {
    if (activeEvent === GameEvent.AD_BREAK) return; 

    const isCrouching = keys.current['ShiftLeft'] || keys.current['ShiftRight'];
    const isRunning = keys.current['CapsLock'];

    let speed = baseSpeed;
    let targetHeight = 1.7;

    if (isCrouching) {
      speed = baseSpeed * 0.4;
      targetHeight = 1.0;
    } else if (isRunning) {
      speed = baseSpeed * 1.8;
    }
    
    // Player Movement Logic
    const forward = (keys.current['KeyW'] ? 1 : 0) - (keys.current['KeyS'] ? 1 : 0);
    const right = (keys.current['KeyD'] ? 1 : 0) - (keys.current['KeyA'] ? 1 : 0);

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    
    // IMPORTANT: Normalize the direction on the XZ plane for predictable movement and dropping
    const horizontalDir = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
    
    const camRight = new THREE.Vector3().crossVectors(horizontalDir, new THREE.Vector3(0, 1, 0)).normalize();
    
    const moveVec = new THREE.Vector3()
      .addScaledVector(horizontalDir, forward)
      .addScaledVector(camRight, right)
      .normalize()
      .multiplyScalar(speed * delta);

    // Only update position if speed > 0
    if (speed > 0) {
      const nextX = camera.position.x + moveVec.x;
      const nextZ = camera.position.z + moveVec.z;

      if (!checkCollision(nextX, nextZ)) {
        camera.position.x = nextX;
        camera.position.z = nextZ;
      } else {
         // Slide
         if (!checkCollision(nextX, camera.position.z)) {
            camera.position.x = nextX;
         } else if (!checkCollision(camera.position.x, nextZ)) {
            camera.position.z = nextZ;
         }
      }
      
      // Fall off map check
      if (camera.position.y < -20) {
         camera.position.set(0, 5, 5); 
         handleDeath();
      }
    }

    // Terrain Follow (Always active so you don't clip into hills if you turn)
    const groundHeight = getTerrainHeight(camera.position.x, camera.position.z);
    const desiredY = groundHeight + targetHeight;
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredY, 10 * delta);
    
    // Update REF with position AND normalized direction (dirX, dirZ)
    // This ensures dropped items are always 1.5m horizontal distance away
    playerPosRef.current = [camera.position.x, camera.position.y, camera.position.z, horizontalDir.x, horizontalDir.z];
  });

  return null;
};

const PlayerTool = () => {
  const { camera, scene } = useThree();
  const { isMenuOpen, buildMode, hitNode, hitStructure, hitPlayer } = useGame();
  const group = useRef<THREE.Group>(null);
  const isSwinging = useRef(false);
  const swingProgress = useRef(0);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      // Left Click Only for Mining
      // Disable tool usage if Menu is open OR Build Mode is active
      if (isMenuOpen || buildMode.active || e.button !== 0) return;
      
      isSwinging.current = true;
      swingProgress.current = 0;

      // Raycast for Mining
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      
      // Intersect all children
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      if (intersects.length > 0) {
        const hit = intersects[0];
        // Max reach distance 2.5 meters
        if (hit.distance <= 2.5) {
           let obj = hit.object;
           while (obj) {
             if (obj.userData) {
               if (obj.userData.type === 'RESOURCE') {
                 hitNode(obj.userData.id);
                 break;
               }
               if (obj.userData.type === 'STRUCTURE') {
                 hitStructure(obj.userData.id);
                 break;
               }
               if (obj.userData.type === 'PLAYER') {
                 hitPlayer(obj.userData.id);
                 break;
               }
             }
             if (obj.parent) {
               obj = obj.parent;
             } else {
               break;
             }
           }
        }
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [isMenuOpen, buildMode, camera, scene, hitNode, hitStructure, hitPlayer]);

  useFrame((state, delta) => {
    if (!group.current) return;

    // 1. Follow Camera with Offset
    const offset = new THREE.Vector3(0.5, -0.4, -0.6); // Right, Down, Forward relative to cam
    offset.applyQuaternion(camera.quaternion);
    group.current.position.copy(camera.position).add(offset);
    
    // 2. Match Camera Rotation
    group.current.rotation.copy(camera.rotation);

    // 3. Animation Logic
    if (isSwinging.current) {
      swingProgress.current += delta * 15; // Swing speed
      
      if (swingProgress.current >= Math.PI) {
        isSwinging.current = false;
        swingProgress.current = 0;
      }
      
      // Chop motion
      const swingAngle = Math.sin(swingProgress.current) * 1.2;
      group.current.rotateX(-swingAngle);
      group.current.rotateZ(-swingAngle * 0.2); // Slight inward tilt
    } else {
      // Idle sway (breathing)
      const time = state.clock.getElapsedTime();
      group.current.position.y += Math.sin(time * 2) * 0.002;
      group.current.rotateX(Math.sin(time * 2) * 0.02);
    }
  });

  if (isMenuOpen || buildMode.active) return null;

  return (
    <group ref={group}>
      {/* Pickaxe Handle */}
      <mesh position={[0, -0.2, 0]} rotation={[Math.PI/8, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.03, 0.6, 8]} />
        <meshStandardMaterial color="#5c4033" />
      </mesh>
      {/* Pickaxe Head */}
      <group position={[0, 0.1, -0.1]} rotation={[Math.PI/8, 0, 0]}>
        {/* Main Iron Head */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
           <boxGeometry args={[0.05, 0.4, 0.05]} />
           <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Sharp Tips */}
        <mesh position={[0.22, 0, 0]} rotation={[0, 0, -Math.PI/2]}>
           <coneGeometry args={[0.03, 0.1, 4]} />
           <meshStandardMaterial color="#999999" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh position={[-0.22, 0, 0]} rotation={[0, 0, Math.PI/2]}>
           <coneGeometry args={[0.03, 0.1, 4]} />
           <meshStandardMaterial color="#999999" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
};

// Interaction Handler: Handles 'C' to Claim and 'Right Click' to Pickup
const InteractionHandler = () => {
  const { camera, scene } = useThree();
  const { structures, claimStructure, pickupStructure, addLog, isMenuOpen, buildMode } = useGame();

  useEffect(() => {
    const handleInput = (e: KeyboardEvent | MouseEvent) => {
      if (isMenuOpen || buildMode.active) return;

      const isClaimKey = e instanceof KeyboardEvent && e.code === 'KeyC';
      const isPickupClick = e instanceof MouseEvent && e.button === 2; // Right Click

      if (isClaimKey || isPickupClick) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
          const hit = intersects[0];
          if (hit.distance < 3.0) { // Interaction distance
            let obj = hit.object;
            while (obj) {
               if (obj.userData && obj.userData.type === 'STRUCTURE') {
                  const id = obj.userData.id;
                  const struct = structures.find(s => s.id === id);
                  
                  if (isClaimKey) {
                     if (struct && struct.type === ItemType.MINING_RIG && struct.ownerId) {
                       claimStructure(id);
                     } else if (struct && struct.type === ItemType.MINING_RIG && !struct.ownerId) {
                       addLog("You already own this rig.");
                     }
                  }
                  
                  if (isPickupClick) {
                     pickupStructure(id);
                  }

                  break;
               }
               if (obj.parent) obj = obj.parent;
               else break;
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleInput as any);
    window.addEventListener('mousedown', handleInput as any);
    return () => {
      window.removeEventListener('keydown', handleInput as any);
      window.removeEventListener('mousedown', handleInput as any);
    };
  }, [camera, scene, structures, claimStructure, pickupStructure, isMenuOpen, buildMode, addLog]);

  return null;
};

// AI Character Mesh
const AIModel: React.FC<{ bot: AIPlayer }> = ({ bot }) => {
  const groupRef = useRef<THREE.Group>(null);
  const pickaxeRef = useRef<THREE.Group>(null);
  const prevHealth = useRef(bot.health);
  const [flash, setFlash] = useState(false);
  
  useFrame((state) => {
    if (groupRef.current) {
      // Interpolate position for smoothness
      groupRef.current.position.lerp(new THREE.Vector3(...bot.position), 0.1);
      // Smooth rotation
      const curRot = groupRef.current.rotation.y;
      // Shortest path rotation lerp
      let diff = bot.rotation - curRot;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      groupRef.current.rotation.y += diff * 0.1;
    }
    
    // Animate pickaxe if mining
    if (pickaxeRef.current) {
      if (bot.action === AIAction.MINING) {
        const time = state.clock.elapsedTime * 10;
        pickaxeRef.current.rotation.x = -Math.abs(Math.sin(time)) * 1.5;
      } else {
        pickaxeRef.current.rotation.x = THREE.MathUtils.lerp(pickaxeRef.current.rotation.x, 0, 0.1);
      }
    }

    // Flash Effect check
    if (bot.health < prevHealth.current) {
        setFlash(true);
        setTimeout(() => setFlash(false), 200);
    }
    prevHealth.current = bot.health;
  });

  return (
    <group ref={groupRef} position={new THREE.Vector3(...bot.position)} userData={{ id: bot.id, type: 'PLAYER' }}>
      {/* Name Tag */}
      <Text position={[0, 2.2, 0]} fontSize={0.3} color={bot.color} anchorX="center" anchorY="bottom">
        {bot.name}
      </Text>

      {/* Health Bar */}
      {bot.health < bot.maxHealth && (
         <group position={[0, 2.0, 0]}>
            <mesh position={[-0.5 + (bot.health/bot.maxHealth)*0.5, 0, 0]}>
               <planeGeometry args={[(bot.health/bot.maxHealth), 0.1]} />
               <meshBasicMaterial color="red" />
            </mesh>
         </group>
      )}
      
      {/* Body */}
      <mesh position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.3, 0.8, 4, 8]} />
        <meshStandardMaterial color={flash ? "white" : bot.color} emissive={flash ? "red" : "black"} roughness={0.7} />
      </mesh>
      
      {/* Head */}
      <mesh position={[0, 1.6, 0]}>
         <sphereGeometry args={[0.25, 16, 16]} />
         <meshStandardMaterial color={flash ? "white" : "#ffccaa"} emissive={flash ? "red" : "black"} />
      </mesh>
      
      {/* Eyes */}
      <mesh position={[0.1, 1.65, 0.2]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-0.1, 1.65, 0.2]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="black" />
      </mesh>

      {/* Pickaxe Hand */}
      <group position={[0.4, 1.1, 0.3]} ref={pickaxeRef}>
         <mesh position={[0, 0.4, 0]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.8]} />
            <meshStandardMaterial color="#5c4033" />
         </mesh>
         <mesh position={[0, 0.8, 0]} rotation={[0, 0, Math.PI/2]}>
            <boxGeometry args={[0.1, 0.5, 0.1]} />
            <meshStandardMaterial color="#888" />
         </mesh>
      </group>
    </group>
  )
}

// Render different meshes for structures
const StructureModel: React.FC<{ id?: string; type: ItemType; position: number[]; rotation: number; isGhost?: boolean; ownerId?: string }> = ({ id, type, position, rotation, isGhost, ownerId }) => {
  const { activeEvent, globalPot } = useGame();
  const opacity = isGhost ? 0.5 : 1.0;
  const transparent = isGhost;
  const color = isGhost ? "#88ff88" : undefined;

  // Determine Mining Rig state (Active only if placed, no rain, and pot has money)
  const isMining = !isGhost && activeEvent !== GameEvent.ACID_RAIN && globalPot > 0;
  
  // Blinking effect for mining
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (!isMining) return;
    const interval = setInterval(() => setBlink(prev => !prev), 500);
    return () => clearInterval(interval);
  }, [isMining]);

  // Common material props
  const matProps = { transparent, opacity };

  // We wrap the content in a Group with userData to enable Raycasting for destruction
  const userData = isGhost ? undefined : { id, type: 'STRUCTURE', ownerId };

  // Lighting Colors for Mining Rigs
  // Player: Green (#00ff88), Bot: Purple (#a855f7)
  const lightColor = ownerId ? "#a855f7" : "#00ff88";
  const darkColor = ownerId ? "#3b0764" : "#003311";

  switch (type) {
    case ItemType.FOUNDATION:
       return (
         <group position={[position[0], position[1] - 2, position[2]]} rotation={[0, rotation, 0]} userData={userData}>
            <mesh>
              <boxGeometry args={[3, 4, 3]} /> 
              <meshStandardMaterial color={color || "#555"} {...matProps} />
            </mesh>
         </group>
       );
    case ItemType.WALL:
       return (
         <group position={[position[0], position[1] + 1, position[2]]} rotation={[0, rotation, 0]} userData={userData}>
           <mesh>
             <boxGeometry args={[3, 3, 0.2]} />
             <meshStandardMaterial color={color || "#8b5a2b"} {...matProps} />
           </mesh>
           {/* Wall Foundation extension */}
           <mesh position={[0, -2, 0]}>
              <boxGeometry args={[3, 1, 0.2]} />
              <meshStandardMaterial color={color || "#8b5a2b"} {...matProps} />
           </mesh>
         </group>
       );
    case ItemType.ROOF:
       return (
         <group position={[position[0], position[1] + 0.5, position[2]]} rotation={[0, rotation, 0]} userData={userData}>
            <mesh>
              <cylinderGeometry args={[0, 2.2, 3, 4, 1, false, Math.PI/4]} />
              <meshStandardMaterial color={color || "#3e2723"} {...matProps} side={THREE.DoubleSide} />
            </mesh>
         </group>
       );
    case ItemType.MINING_RIG:
       return (
         <group position={[position[0], position[1] + 0.5, position[2]]} rotation={[0, rotation, 0]} userData={userData}>
            {/* Case */}
            <mesh>
               <boxGeometry args={[0.8, 1, 0.8]} />
               <meshStandardMaterial color={color || "#222"} {...matProps} />
            </mesh>
            {/* Lights / Screen - Blink based on status */}
            <mesh position={[0, 0.2, 0.41]}>
               <planeGeometry args={[0.6, 0.4]} />
               <meshStandardMaterial 
                 color={isMining ? (blink ? lightColor : darkColor) : "#330000"} 
                 emissive={isMining ? lightColor : "#ff0000"} 
                 emissiveIntensity={isGhost ? 0 : (isMining ? (blink ? 1 : 0.2) : 0.5)} 
                 {...matProps}
               />
            </mesh>
            {/* Vents */}
            <mesh position={[0, -0.3, 0.41]}>
               <planeGeometry args={[0.6, 0.2]} />
               <meshStandardMaterial color="#111" {...matProps} />
            </mesh>
         </group>
       );
    default:
       return null;
  }
};

const ResourceMesh: React.FC<{ node: ResourceNodeData }> = ({ node }) => {
  const [hovered, setHovered] = useState(false);
  const [scale, setScale] = useState(1);
  const meshRef = useRef<THREE.Mesh>(null);
  const prevHealth = useRef(node.health);
  
  // Random rotation for dropped items
  const randomRotation = useMemo(() => Math.random() * Math.PI * 2, []);

  // Watch health for animation effects
  useEffect(() => {
    if (node.health < prevHealth.current) {
       setScale(0.8);
       setTimeout(() => setScale(1), 100);
    }
    prevHealth.current = node.health;
  }, [node.health]);

  if (node.health <= 0) return null;

  // Visuals based on type
  let geometry = <dodecahedronGeometry args={[0.6, 0]} />;
  let yOffset = 0.35;
  let castShadow = true;
  let rotation: [number, number, number] = [0, 0, 0];
  let color = node.color;

  if (node.type === 'TREE') {
    geometry = (
      <group>
        {/* Leaves raised to y=3 (bottom at 1) to reveal trunk */}
        <mesh position={[0, 3, 0]}>
          <coneGeometry args={[1.5, 4, 8]} />
          <meshStandardMaterial color={node.color} />
        </mesh>
        {/* Trunk sits on ground 0 to 1 */}
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.3, 0.4, 1]} />
          <meshStandardMaterial color="#3d2817" />
        </mesh>
      </group>
    );
    yOffset = 0;
  } else if (node.type === 'JUNK') {
    geometry = <boxGeometry args={[0.8, 0.8, 0.8]} />;
    yOffset = 0.4;
  } else if (node.type === 'LOOSE_ITEM') {
    // Visuals for dropped items
    if (node.drop === ItemType.WOOD) {
        // Log lying down
        geometry = <cylinderGeometry args={[0.1, 0.1, 1]} />;
        yOffset = 0.1;
        rotation = [Math.PI / 2, randomRotation, 0]; // Lie flat
        color = '#5c4033';
    } else if (node.drop === ItemType.STONE || node.drop === ItemType.COAL || node.drop.includes('Ore')) {
        // Rock / Ore
        geometry = <dodecahedronGeometry args={[0.2, 0]} />;
        yOffset = 0.2;
        rotation = [Math.random(), Math.random(), Math.random()];
        
        // Map Colors
        if (node.drop === ItemType.STONE) color = '#888';
        if (node.drop === ItemType.COAL) color = '#222';
        if (node.drop === ItemType.COPPER_ORE) color = '#b87333';
        if (node.drop === ItemType.METAL_ORE) color = '#64748b';
    } else {
        // Generic Bag/Box
        geometry = <boxGeometry args={[0.3, 0.3, 0.3]} />;
        yOffset = 0.15;
        rotation = [0, randomRotation, 0];
        color = '#ddd';
        
        // Simple color mapping
        if (node.drop === ItemType.PLASTIC) color = '#38bdf8';
        if (node.drop === ItemType.RESIN) color = '#eab308';
        if (node.drop === ItemType.MINING_RIG) color = '#222'; // Dark box for Rig
    }
    castShadow = true;
  }

  return (
    <group position={[node.position[0], node.position[1] + yOffset, node.position[2]]} rotation={new THREE.Euler(...rotation)}>
      <mesh 
        ref={meshRef}
        userData={{ id: node.id, type: 'RESOURCE' }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={scale}
        castShadow={castShadow}
        receiveShadow
      >
        {node.type === 'TREE' ? geometry : (
          <>
            {geometry}
            <meshStandardMaterial 
              color={hovered ? '#ffffff' : color} 
              emissive={node.type === 'LOOSE_ITEM' ? color : '#000000'}
              emissiveIntensity={node.type === 'LOOSE_ITEM' && hovered ? 0.5 : 0}
            />
          </>
        )}
      </mesh>
      
      {/* Health Bar for non-instant items */}
      {hovered && node.maxHealth > 1 && (
         <Text position={[0, node.type === 'TREE' ? 4.5 : 1.5, 0]} fontSize={0.4} color="white" anchorX="center" anchorY="middle">
           {Math.ceil((node.health / node.maxHealth) * 100)}%
         </Text>
      )}
    </group>
  );
};

const BuildSystem = () => {
  const { buildMode, confirmBuild, rotateBuild, cancelBuildMode } = useGame();
  const { camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  
  // Visual State for React Rendering
  const [ghostVisualPos, setGhostVisualPos] = useState<[number, number, number] | null>(null);
  
  // Ref for Event Listeners (Latest position without re-binding)
  const ghostPosRef = useRef<[number, number, number] | null>(null);
  const buildModeRef = useRef(buildMode);

  // Sync buildMode ref
  useEffect(() => {
    buildModeRef.current = buildMode;
  }, [buildMode]);

  // Setup Event Listeners ONLY when confirm/cancel functions change (Stable)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
       if (!buildModeRef.current.active) return;
       if (e.code === 'KeyR') rotateBuild();
       if (e.key === 'Escape') cancelBuildMode(); 
    };

    const handleMouseDown = (e: MouseEvent) => {
       // Only build if pointer is locked
       if (!document.pointerLockElement) return;

       if (buildModeRef.current.active && ghostPosRef.current && e.button === 0) { // Left Click
          confirmBuild(ghostPosRef.current);
       }
       if (buildModeRef.current.active && e.button === 2) { // Right Click
          cancelBuildMode();
       }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleMouseDown);
    }
  }, [confirmBuild, cancelBuildMode, rotateBuild]); 

  useFrame(() => {
    if (!buildMode.active) return;

    // Raycast from center of screen for building
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    const intersects = raycaster.intersectObjects(scene.children, true);
    const groundHit = intersects.find(i => i.object.type === 'Mesh' && (i.object as any).geometry.type === 'PlaneGeometry');

    if (groundHit) {
       let x = groundHit.point.x;
       let z = groundHit.point.z;

       // Grid Snap (3m)
       x = Math.round(x / 3) * 3;
       z = Math.round(z / 3) * 3;
       const y = getTerrainHeight(x, z);
       
       const newPos: [number, number, number] = [x, y, z];
       
       // Update Ref for Event Listener
       ghostPosRef.current = newPos;

       // Update Visual State (Debounced/Check if changed to save renders?)
       setGhostVisualPos(prev => {
         if (!prev || prev[0] !== x || prev[1] !== y || prev[2] !== z) return newPos;
         return prev;
       });
    }
  });

  if (!buildMode.active || !buildMode.type || !ghostVisualPos) return null;

  return <StructureModel type={buildMode.type} position={ghostVisualPos} rotation={buildMode.rotation} isGhost={true} />;
}

const World = () => {
  const { resources, structures, aiPlayers } = useGame();

  return (
    <group>
      {resources.map(node => (
        <ResourceMesh key={node.id} node={node} />
      ))}
      {structures.map(struct => (
        <StructureModel 
          key={struct.id} 
          id={struct.id}
          type={struct.type} 
          position={struct.position} 
          rotation={struct.rotation} 
          ownerId={struct.ownerId}
        />
      ))}
      {aiPlayers.map(bot => (
        <AIModel key={bot.id} bot={bot} />
      ))}
    </group>
  );
};

export const GameCanvas = () => {
  const { isMenuOpen, activeEvent, toggleMenu, buildMode } = useGame();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' || e.code === 'Tab') {
        e.preventDefault();
        if (!isMenuOpen) {
          document.exitPointerLock(); 
        }
        toggleMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMenuOpen, toggleMenu]);

  return (
    <div id="gl-canvas" className="w-full h-full">
      <Canvas shadows camera={{ fov: 75, position: [0, 5, 5] }}>
        <Sky sunPosition={[100, 20, 100]} turbidity={0.1} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />
        <ambientLight intensity={activeEvent === GameEvent.ACID_RAIN ? 0.2 : 0.5} />
        <directionalLight 
          position={[50, 50, 25]} 
          intensity={activeEvent === GameEvent.ACID_RAIN ? 0.2 : 1} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        
        {activeEvent === GameEvent.ACID_RAIN && <fog attach="fog" args={['#2a332a', 0, 50]} />}
        {activeEvent === GameEvent.ACID_RAIN && <Rain count={3000} />}

        <Terrain />
        <World />
        <BuildSystem />
        <PlayerController />
        <PlayerTool />
        <InteractionHandler />
        
        {/* Always mounted to ensure it can receive lock requests from the UI layer */}
        <PointerLockControls makeDefault />
      </Canvas>
      
      {/* Crosshair - visible when playing OR building */}
      {(!isMenuOpen || buildMode.active) && (
        <div className={`crosshair ${activeEvent === GameEvent.NONE ? '' : 'opacity-50'}`} />
      )}
    </div>
  );
};
