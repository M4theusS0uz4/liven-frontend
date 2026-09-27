import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Mapa, MapaUnidade } from '../../lib/api';

export type StatusUnidade = 'ocupada' | 'vazia' | 'alerta';
export interface UnidadeMapa { id: string; bloco: string; numero: string; andar?: number | null; tipoResidencia?: 'casa' | 'apartamento'; status: StatusUnidade; }

type Props = { unidades: UnidadeMapa[]; mapa?: Mapa; onSelect?: (unidade: UnidadeMapa) => void };

const unitColors: Record<StatusUnidade, number> = { ocupada: 0x17845b, vazia: 0xb5c4cb, alerta: 0xe2a72f };
const areaColors: Record<string, number> = {
  lazer: 0x66a984,
  quadra: 0x238a5c,
  piscina: 0x48add0,
  playground: 0xf0b84f,
  churrasqueira: 0xc67a4a,
  salao: 0xd5a65d,
  academia: 0x6c98b4,
  jardim: 0x77a96c,
};

function makeMaterial(color: number, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...options });
}

function normalizeType(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function makeLabel(text: string, color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 144;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Group();
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(8, 8, 624, 128, 28);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = '700 48px Segoe UI, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text.slice(0, 24), 320, 74, 580);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  label.scale.set(Math.max(4.5, Math.min(9, text.length * 0.38)), 1.05, 1);
  label.userData.texture = texture;
  return label;
}

export default function CondominiumMap({ unidades, mapa, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef<UnidadeMapa | null>(null);
  const callbackRef = useRef(onSelect);
  callbackRef.current = onSelect;
  const sceneKey = JSON.stringify([mapa, unidades]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeaf1f2);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false;

    const world = new THREE.Group();
    scene.add(world);
    scene.add(new THREE.HemisphereLight(0xf8fbff, 0x849a91, 2.1));
    const sun = new THREE.DirectionalLight(0xfff4dc, 3.1);
    sun.position.set(-14, 24, 12);
    sun.castShadow = false;
    scene.add(sun);

    const width = Math.max(20, mapa?.largura || 100);
    const height = Math.max(20, mapa?.altura || 70);
    const tipoCondominio = mapa?.tipo_condominio ?? 'vertical';
    const scale = Math.min(0.22, 36 / Math.max(width, height));
    const mapX = (value: number) => (value - width / 2) * scale;
    const mapZ = (value: number) => (value - height / 2) * scale;
    const fallbackBlocks = [...new Set(unidades.map((unit) => unit.bloco))];
    const fallbackCount = tipoCondominio === 'horizontal' || tipoCondominio === 'misto' ? unidades.length : fallbackBlocks.length;
    const columns = Math.max(1, Math.ceil(Math.sqrt(fallbackCount)));
    const rows = Math.max(1, Math.ceil(fallbackCount / columns));
    const groundWidth = Math.max(width * scale, columns * 8);
    const groundHeight = Math.max(height * scale, rows * 8);
    const mapSpan = Math.max(groundWidth, groundHeight);

    const ground = new THREE.Mesh(new THREE.BoxGeometry(groundWidth, 0.25, groundHeight), makeMaterial(0xdde9df));
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    world.add(ground);
    const gridSize = Math.max(groundWidth, groundHeight);
    const grid = new THREE.GridHelper(gridSize, Math.max(10, Math.min(80, Math.round(gridSize))), 0xb7c7bd, 0xcbd7ce);
    grid.position.y = -0.065;
    world.add(grid);

    const roadMaterial = makeMaterial(0xaebbc1);
    (mapa?.ruas ?? []).forEach((rua) => rua.pontos.slice(0, -1).forEach((point, index) => {
      const next = rua.pontos[index + 1];
      const dx = next.x - point.x;
      const dz = next.y - point.y;
      const road = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz) * scale, 0.08, rua.largura * scale), roadMaterial);
      road.position.set(mapX((point.x + next.x) / 2), -0.04, mapZ((point.y + next.y) / 2));
      road.rotation.y = -Math.atan2(dz, dx);
      road.receiveShadow = true;
      world.add(road);
    }));

    const unitById = new Map<string, UnidadeMapa>();
    const addUnit = (unit: UnidadeMapa, x: number, z: number, unitWidth = 1.8, unitDepth = 1.25, y = 0.85) => {
      unitById.set(unit.id, unit);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(unitWidth, 1.2, unitDepth), makeMaterial(unitColors[unit.status], { roughness: 0.56 }));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.userData.unitId = unit.id;
      mesh.userData.baseY = y;
      world.add(mesh);
    };

    const addHouse = (unit: UnidadeMapa, x: number, z: number, houseWidth = 1.8, houseDepth = 1.45) => {
      unitById.set(unit.id, unit);
      const walls = new THREE.Mesh(new THREE.BoxGeometry(houseWidth, 1.05, houseDepth), makeMaterial(0xf0e6d2));
      walls.position.set(x, 0.53, z);
      walls.userData.unitId = unit.id;
      walls.castShadow = true;
      world.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(houseWidth, houseDepth) * 0.78, 0.95, 4), makeMaterial(0x9b6049));
      roof.rotation.y = Math.PI / 4;
      roof.position.set(x, 1.48, z);
      roof.userData.unitId = unit.id;
      world.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(houseWidth * 0.16, 0.48, 0.04), makeMaterial(0x755540));
      door.position.set(x, 0.25, z + houseDepth / 2 + 0.025);
      door.userData.unitId = unit.id;
      world.add(door);
      const status = new THREE.Mesh(new THREE.BoxGeometry(houseWidth * 0.2, 0.12, 0.06), makeMaterial(unitColors[unit.status]));
      status.position.set(x, 1.05, z + houseDepth / 2 + 0.035);
      status.userData.unitId = unit.id;
      world.add(status);
      const label = makeLabel(unit.numero, '#344e49');
      label.position.set(x, 2.15, z);
      world.add(label);
    };

    const blocks = mapa?.blocos ?? [];
    if (blocks.length) {
      blocks.forEach((block, index) => {
        const unitsInBlock = unidades.filter((unit) => unit.bloco === block.nome);
        const horizontalArea = tipoCondominio === 'horizontal' || (tipoCondominio === 'misto' && (unitsInBlock.length ? unitsInBlock.every((unit) => unit.tipoResidencia === 'casa' || (!unit.tipoResidencia && unit.andar === null)) : block.andares <= 1));
        const houseUnits = tipoCondominio === 'misto' && !horizontalArea ? unitsInBlock.filter((unit) => unit.tipoResidencia === 'casa' || (!unit.tipoResidencia && unit.andar === null)) : [];
        const apartmentUnits = unitsInBlock.filter((unit) => !houseUnits.includes(unit));
        const blockWidth = Math.max(horizontalArea ? 4 : 2.6, block.largura * scale);
        const blockDepth = Math.max(horizontalArea ? 4 : 2.6, block.altura * scale);
        const floors = horizontalArea ? 1 : Math.max(2, block.andares);
        const blockHeight = floors * 0.72;
        const x = mapX(block.x);
        const z = mapZ(block.y);
        if (horizontalArea) {
          const sector = new THREE.Mesh(new THREE.BoxGeometry(blockWidth, 0.12, blockDepth), makeMaterial(0xa6c39b));
          sector.position.set(x, -0.05, z);
          world.add(sector);
          const sectorLabel = makeLabel(block.nome, '#426447');
          sectorLabel.position.set(x, 0.85, z - blockDepth / 2 - 0.7);
          world.add(sectorLabel);
          const perRow = Math.max(1, Math.ceil(Math.sqrt(unitsInBlock.length)));
          unitsInBlock.forEach((unit, unitIndex) => {
            const coordinates = mapa?.unidades.find((item) => item.unidade_id === Number(unit.id));
            const unitX = coordinates ? mapX(coordinates.x) : x + (unitIndex % perRow - (perRow - 1) / 2) * (blockWidth / perRow);
            const unitZ = coordinates ? mapZ(coordinates.y) : z + (Math.floor(unitIndex / perRow) - (Math.ceil(unitsInBlock.length / perRow) - 1) / 2) * (blockDepth / perRow);
            addHouse(unit, unitX, unitZ, Math.min(1.65, blockWidth / (perRow + 1)), Math.min(1.35, blockDepth / (perRow + 1)));
          });
        } else {
          const building = new THREE.Mesh(new THREE.BoxGeometry(blockWidth, blockHeight, blockDepth), makeMaterial(index % 2 ? 0xe7e4da : 0xf2eee4));
          building.position.set(x, blockHeight / 2 - 0.05, z);
          building.castShadow = true;
          building.receiveShadow = true;
          world.add(building);

          const roof = new THREE.Mesh(new THREE.BoxGeometry(blockWidth + 0.28, 0.16, blockDepth + 0.28), makeMaterial(index % 2 ? 0x596f6c : 0x647977));
          roof.position.set(x, blockHeight - 0.03, z);
          roof.castShadow = true;
          world.add(roof);

          const floorLineMaterial = new THREE.LineBasicMaterial({ color: 0xc2bfb6, transparent: true, opacity: 0.8 });
          for (let floor = 1; floor < floors; floor += 1) {
            const lineGeometry = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(-blockWidth / 2, floor * 0.72 - blockHeight / 2, blockDepth / 2 + 0.012),
              new THREE.Vector3(blockWidth / 2, floor * 0.72 - blockHeight / 2, blockDepth / 2 + 0.012),
            ]);
            const line = new THREE.Line(lineGeometry, floorLineMaterial);
            line.position.set(x, blockHeight / 2 - 0.05, z);
            world.add(line);
          }
          const label = makeLabel(block.nome, '#344e49');
          label.position.set(x, blockHeight + 0.95, z);
          world.add(label);

          apartmentUnits.forEach((unit, unitIndex) => {
            const perRow = Math.max(1, Math.ceil(Math.sqrt(apartmentUnits.length)));
            const unitWidth = Math.min(1.5, blockWidth / (perRow + 1));
            const unitDepth = Math.min(1.1, blockDepth / (perRow + 1));
            const unitX = x + (unitIndex % perRow - (perRow - 1) / 2) * (unitWidth + 0.14);
            const unitZ = z + (Math.floor(unitIndex / perRow) - (Math.ceil(apartmentUnits.length / perRow) - 1) / 2) * (unitDepth + 0.14);
            addUnit(unit, unitX, unitZ, unitWidth, unitDepth, blockHeight + 0.72);
          });
          houseUnits.forEach((unit, unitIndex) => {
            const coordinates = mapa?.unidades.find((item) => item.unidade_id === Number(unit.id));
            const houseX = coordinates ? mapX(coordinates.x) : x - blockWidth / 2 - 2.2;
            const houseZ = coordinates ? mapZ(coordinates.y) : z + unitIndex * 2.2;
            addHouse(unit, houseX, houseZ, 1.65, 1.4);
          });
        }
      });
    } else if (tipoCondominio === 'horizontal') {
      const streetMaterial = makeMaterial(0xb0bdc1);
      const roadLength = Math.max(groundWidth * 0.78, columns * 6);
      for (let row = 0; row < rows; row += 1) {
        const road = new THREE.Mesh(new THREE.BoxGeometry(roadLength, 0.09, 0.72), streetMaterial);
        road.position.set(0, -0.035, (row - (rows - 1) / 2) * 5.4 + 2.7);
        world.add(road);
      }
      unidades.forEach((unit, index) => {
        const x = (index % columns - (columns - 1) / 2) * 5.4;
        const z = (Math.floor(index / columns) - (rows - 1) / 2) * 5.4;
        addHouse(unit, x, z);
      });
    } else {
      const streetMaterial = makeMaterial(0xb0bdc1);
      const street = new THREE.Mesh(new THREE.BoxGeometry(Math.max(groundWidth * 0.78, columns * 7), 0.09, 1.4), streetMaterial);
      street.position.y = -0.035;
      world.add(street);
      const houseUnits = tipoCondominio === 'misto' ? unidades.filter((unit) => unit.tipoResidencia === 'casa' || (!unit.tipoResidencia && unit.andar === null)) : [];
      const apartmentUnits = tipoCondominio === 'misto' ? unidades.filter((unit) => !houseUnits.includes(unit)) : unidades;
      houseUnits.forEach((unit, index) => {
        const x = -Math.max(8, fallbackBlocks.length * 3) + (index % columns) * 4.5;
        const z = (Math.floor(index / columns) - (rows - 1) / 2) * 4.5;
        addHouse(unit, x, z, 1.65, 1.4);
      });
      const apartmentBlocks = [...new Set(apartmentUnits.map((unit) => unit.bloco))];
      apartmentBlocks.forEach((blockName, blockIndex) => {
        const groupUnits = apartmentUnits.filter((unit) => unit.bloco === blockName);
        const x = blockIndex * 6 + 5;
        const z = 0;
        const floors = Math.max(2, Math.ceil(groupUnits.length / 4));
        const blockWidth = 5.3;
        const blockDepth = 4.8;
        const blockHeight = floors * 0.72;
        const body = new THREE.Mesh(new THREE.BoxGeometry(blockWidth, blockHeight, blockDepth), makeMaterial(blockIndex % 2 ? 0xe7e4da : 0xf2eee4));
        body.position.set(x, blockHeight / 2 - 0.05, z);
        world.add(body);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(blockWidth + 0.28, 0.16, blockDepth + 0.28), makeMaterial(0x596f6c));
        roof.position.set(x, blockHeight - 0.03, z);
        world.add(roof);
        const label = makeLabel(blockName, '#344e49');
        label.position.set(x, blockHeight + 0.95, z);
        world.add(label);
        groupUnits.forEach((unit, unitIndex) => addUnit(unit, x + (unitIndex % 2) * 2.1 - 1.05, z + Math.floor(unitIndex / 2) * 1.35 - 0.65, 1.8, 1.1, blockHeight + 0.72));
      });
    }

    (mapa?.areas_comuns ?? []).forEach((area) => {
      const kind = normalizeType(area.tipo);
      const areaWidth = Math.max(2.5, area.largura * scale);
      const areaDepth = Math.max(2.5, area.altura * scale);
      const x = mapX(area.x);
      const z = mapZ(area.y);
      const isPool = kind.includes('piscina');
      const isCourt = kind.includes('quadra');
      const baseColor = isPool ? 0xd8c49e : areaColors[kind] ?? 0x80a98a;
      const base = new THREE.Mesh(new THREE.BoxGeometry(areaWidth, 0.22, areaDepth), makeMaterial(baseColor, { roughness: 0.9 }));
      base.position.set(x, -0.015, z);
      base.receiveShadow = true;
      world.add(base);

      if (isPool) {
        const water = new THREE.Mesh(new THREE.BoxGeometry(areaWidth * 0.76, 0.12, areaDepth * 0.68), makeMaterial(0x42b4d5, { roughness: 0.28, metalness: 0.12 }));
        water.position.set(x, 0.13, z);
        world.add(water);
      }
      if (isCourt) {
        const points = [
          new THREE.Vector3(-areaWidth / 2 + 0.12, 0.14, -areaDepth / 2 + 0.12),
          new THREE.Vector3(areaWidth / 2 - 0.12, 0.14, -areaDepth / 2 + 0.12),
          new THREE.Vector3(areaWidth / 2 - 0.12, 0.14, areaDepth / 2 - 0.12),
          new THREE.Vector3(-areaWidth / 2 + 0.12, 0.14, areaDepth / 2 - 0.12),
        ];
        const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
        outline.position.set(x, 0, z);
        world.add(outline);
        const middle = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.14, -areaDepth / 2), new THREE.Vector3(0, 0.14, areaDepth / 2)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
        middle.position.set(x, 0, z);
        world.add(middle);
      }

      const label = makeLabel(area.nome, '#34564d');
      label.position.set(x, 0.92, z);
      world.add(label);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let previousX = 0;
    let previousY = 0;
    let yaw = 0.65;
    let pitch = 0.76;
    let distance = Math.max(16, mapSpan * 1.55);

    const updateCamera = () => {
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
      camera.lookAt(0, 0, 0);
    };
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const canvasWidth = Math.max(1, bounds.width);
      const canvasHeight = Math.max(1, bounds.height);
      renderer.setSize(canvasWidth, canvasHeight, false);
      camera.aspect = canvasWidth / canvasHeight;
      camera.updateProjectionMatrix();
    };
    const pointerDown = (event: PointerEvent) => {
      dragging = true;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      yaw -= (event.clientX - previousX) * 0.008;
      pitch = Math.max(0.35, Math.min(1.35, pitch + (event.clientY - previousY) * 0.008));
      previousX = event.clientX;
      previousY = event.clientY;
      updateCamera();
    };
    const pointerUp = () => { dragging = false; };
    const wheel = (event: WheelEvent) => {
      distance = Math.max(mapSpan * 0.55, Math.min(mapSpan * 3, distance + event.deltaY * 0.02));
      updateCamera();
    };
    const click = (event: MouseEvent) => {
      if (dragging) return;
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(world.children).find((entry) => entry.object.userData.unitId);
      if (!hit) return;
      const unit = unitById.get(String(hit.object.userData.unitId));
      if (unit) {
        selectedRef.current = unit;
        callbackRef.current?.(unit);
      }
    };

    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointerleave', pointerUp);
    canvas.addEventListener('wheel', wheel, { passive: true });
    canvas.addEventListener('click', click);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    updateCamera();
    let animationFrame = 0;
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      world.children.forEach((child) => {
        if (child.userData.unitId) child.position.y = child.userData.baseY + (selectedRef.current?.id === child.userData.unitId ? Math.sin(Date.now() * 0.006) * 0.12 : 0);
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointerleave', pointerUp);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('click', click);
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((entry) => {
            if (entry instanceof THREE.SpriteMaterial && entry.map) entry.map.dispose();
            entry.dispose();
          });
        }
        if (object instanceof THREE.Sprite) {
          const spriteMaterial = object.material as THREE.SpriteMaterial;
          spriteMaterial.map?.dispose();
          spriteMaterial.dispose();
        }
      });
    };
  }, [mapa, unidades]);

  return <canvas key={sceneKey} ref={canvasRef} className="block h-[min(68vh,700px)] min-h-105 w-full cursor-grab touch-none active:cursor-grabbing" aria-label="Mapa 3D interativo do condomínio"/>;
}
