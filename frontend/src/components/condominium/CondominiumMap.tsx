import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Mapa, MapaUnidade } from '../../lib/api';

export type StatusUnidade = 'ocupada' | 'vazia' | 'alerta';
export interface UnidadeMapa { id: string; bloco: string; numero: string; andar?: number | null; tipoResidencia?: 'casa' | 'apartamento'; status: StatusUnidade; }

export type FerramentaMapa = 'select' | 'move' | 'scale' | 'rotate' | 'house' | 'road';
export type EixoMapa = 'free' | 'x' | 'y';
export type AlvoMapa = { kind: 'bloco' | 'unidade' | 'area' | 'rua' | 'portaria'; id: number };
export type LocalReferenciaMapa = { latitude: number; longitude: number };
export type AcaoCamera = 'fit' | 'top' | 'rotate' | 'zoom-in' | 'zoom-out';
type Props = { modoVisitante?: boolean; onRendererUnavailable?: () => void; unidades: UnidadeMapa[]; mapa?: Mapa; localReferencia?: LocalReferenciaMapa | null; onReferenceLoaded?: () => void; onReferenceError?: () => void; onSelect?: (unidade: UnidadeMapa) => void; onPlace?: (x: number, y: number, tool?: FerramentaMapa) => void; placementMode?: boolean; editMode?: boolean; editTool?: FerramentaMapa; axisLock?: EixoMapa; selectedTarget?: AlvoMapa | null; onSelectTarget?: (target: AlvoMapa | null) => void; onTransformTarget?: (target: AlvoMapa, x: number, y: number, scaleX: number, scaleY: number, rotationDelta?: number) => void; cameraAction?: { id: number; action: AcaoCamera } | null };

const referenceCanvasCache = new Map<string, Promise<HTMLCanvasElement>>();
const referenceZoom = 16;

function carregarBaseCartografica({ latitude, longitude }: LocalReferenciaMapa) {
  const cacheKey = `${latitude.toFixed(5)},${longitude.toFixed(5)},${referenceZoom}`;
  const cached = referenceCanvasCache.get(cacheKey);
  if (cached) return cached;
  const canvasPromise = (async () => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size * 3;
    canvas.height = size * 2;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponível');
    context.fillStyle = '#eef2f5';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const tileCount = 2 ** referenceZoom;
    const clampedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
    const centerTileX = ((longitude + 180) / 360) * tileCount;
    const radians = (clampedLatitude * Math.PI) / 180;
    const centerTileY = ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * tileCount;
    const left = centerTileX * size - canvas.width / 2;
    const top = centerTileY * size - canvas.height / 2;
    const firstTileX = Math.floor(left / size);
    const firstTileY = Math.floor(top / size);
    const tiles: Promise<{ image: HTMLImageElement; x: number; y: number }>[] = [];
    for (let row = 0; row < 2; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const rawX = firstTileX + column;
        const tileY = firstTileY + row;
        if (tileY < 0 || tileY >= tileCount) continue;
        const tileX = ((rawX % tileCount) + tileCount) % tileCount;
        tiles.push(new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve({ image, x: rawX * size - left, y: tileY * size - top });
          image.onerror = () => reject(new Error('Não foi possível carregar a imagem do mapa de referência.'));
          image.src = `https://tile.openstreetmap.org/${referenceZoom}/${tileX}/${tileY}.png`;
        }));
      }
    }
    const loadedTiles = await Promise.all(tiles);
    loadedTiles.forEach(({ image, x, y }) => context.drawImage(image, x, y, size, size));
    const markerX = canvas.width / 2;
    const markerY = canvas.height / 2;
    context.beginPath();
    context.arc(markerX, markerY, 13, 0, Math.PI * 2);
    context.fillStyle = '#ffffff';
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = '#1876ad';
    context.stroke();
    context.beginPath();
    context.arc(markerX, markerY, 5, 0, Math.PI * 2);
    context.fillStyle = '#1876ad';
    context.fill();
    return canvas;
  })();
  referenceCanvasCache.set(cacheKey, canvasPromise);
  canvasPromise.catch(() => referenceCanvasCache.delete(cacheKey));
  return canvasPromise;
}

function markEditable(object: THREE.Object3D, target: AlvoMapa) {
  object.userData.editTarget = target;
}

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

export default function CondominiumMap({ unidades, mapa, localReferencia = null, onReferenceLoaded, onReferenceError, onSelect, onPlace, placementMode = false, editMode = false, editTool = 'select', axisLock = 'free', selectedTarget = null, onSelectTarget, onTransformTarget, cameraAction, modoVisitante = false, onRendererUnavailable }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectedRef = useRef<UnidadeMapa | null>(null);
  const callbackRef = useRef(onSelect);
  const placeRef = useRef(onPlace);
  const placementRef = useRef(placementMode);
  const editModeRef = useRef(editMode);
  const editToolRef = useRef(editTool);
  const axisLockRef = useRef(axisLock);
  const targetRef = useRef(selectedTarget);
  const selectTargetRef = useRef(onSelectTarget);
  const transformTargetRef = useRef(onTransformTarget);
  const editPlaceRef = useRef(onPlace);
  const rendererUnavailableRef = useRef(onRendererUnavailable);
  rendererUnavailableRef.current = onRendererUnavailable;
  const referenceLoadedRef = useRef(onReferenceLoaded);
  const referenceErrorRef = useRef(onReferenceError);
  callbackRef.current = onSelect;
  placeRef.current = onPlace;
  placementRef.current = placementMode;
  editModeRef.current = editMode;
  editToolRef.current = editTool;
  axisLockRef.current = axisLock;
  targetRef.current = selectedTarget;
  selectTargetRef.current = onSelectTarget;
  transformTargetRef.current = onTransformTarget;
  editPlaceRef.current = onPlace;
  referenceLoadedRef.current = onReferenceLoaded;
  referenceErrorRef.current = onReferenceError;
  const sceneKey = JSON.stringify([mapa, unidades]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f6f8);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch (error) {
      if (!rendererUnavailableRef.current) throw error;
      rendererUnavailableRef.current();
      return;
    }
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

    const larguraConteudo = [
      ...(mapa?.blocos ?? []).map((item) => item.x + Math.abs(Math.cos((item.rotacao ?? 0) * Math.PI / 180)) * item.largura / 2 + Math.abs(Math.sin((item.rotacao ?? 0) * Math.PI / 180)) * item.altura / 2 + 5),
      ...(mapa?.unidades ?? []).filter((item) => !item.oculta).map((item) => item.x + Math.abs(Math.cos((item.rotacao ?? 0) * Math.PI / 180)) * item.largura / 2 + Math.abs(Math.sin((item.rotacao ?? 0) * Math.PI / 180)) * item.altura / 2 + 5),
      ...(mapa?.areas_comuns ?? []).map((item) => item.x + Math.abs(Math.cos((item.rotacao ?? 0) * Math.PI / 180)) * item.largura / 2 + Math.abs(Math.sin((item.rotacao ?? 0) * Math.PI / 180)) * item.altura / 2 + 5),
      ...(mapa?.ruas ?? []).flatMap((rua) => rua.pontos.map((ponto) => ponto.x + rua.largura / 2 + 5)),
      ...(mapa?.portarias ?? []).map((item) => item.x + 8),
    ];
    const profundidadeConteudo = [
      ...(mapa?.blocos ?? []).map((item) => item.y + Math.abs(Math.sin((item.rotacao ?? 0) * Math.PI / 180)) * item.largura / 2 + Math.abs(Math.cos((item.rotacao ?? 0) * Math.PI / 180)) * item.altura / 2 + 5),
      ...(mapa?.unidades ?? []).filter((item) => !item.oculta).map((item) => item.y + Math.abs(Math.sin((item.rotacao ?? 0) * Math.PI / 180)) * item.largura / 2 + Math.abs(Math.cos((item.rotacao ?? 0) * Math.PI / 180)) * item.altura / 2 + 5),
      ...(mapa?.areas_comuns ?? []).map((item) => item.y + Math.abs(Math.sin((item.rotacao ?? 0) * Math.PI / 180)) * item.largura / 2 + Math.abs(Math.cos((item.rotacao ?? 0) * Math.PI / 180)) * item.altura / 2 + 5),
      ...(mapa?.ruas ?? []).flatMap((rua) => rua.pontos.map((ponto) => ponto.y + rua.largura / 2 + 5)),
      ...(mapa?.portarias ?? []).map((item) => item.y + 8),
    ];
    const width = Math.max(20, mapa?.largura || 100, ...larguraConteudo);
    const height = Math.max(20, mapa?.altura || 70, ...profundidadeConteudo);
    const unidadesVisiveis = unidades.filter((unit) => !mapa?.unidades.some((item) => item.unidade_id === Number(unit.id) && item.oculta));
    const tipoCondominio = mapa?.tipo_condominio ?? 'vertical';
    const scale = Math.min(0.22, 36 / Math.max(width, height));
    const mapX = (value: number) => (value - width / 2) * scale;
    const mapZ = (value: number) => (value - height / 2) * scale;
    const groundWidth = Math.max(width * scale, 8);
    const groundHeight = Math.max(height * scale, 8);
    const mapSpan = Math.max(groundWidth, groundHeight);

    const groundTopMaterial = makeMaterial(0xf8fafc);
    const groundSideMaterial = makeMaterial(0xf1f5f7);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(groundWidth, 0.25, groundHeight), [groundSideMaterial, groundSideMaterial, groundTopMaterial, groundSideMaterial, groundSideMaterial, groundSideMaterial]);
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    world.add(ground);
    const gridSize = Math.max(groundWidth, groundHeight);
    const grid = new THREE.GridHelper(gridSize, Math.max(10, Math.min(80, Math.round(gridSize))), 0xd7dfe5, 0xe7ecf0);
    grid.position.y = -0.065;
    grid.visible = !localReferencia;
    world.add(grid);
    let referenceTexture: THREE.CanvasTexture | null = null;
    let referenceCancelled = false;
    if (localReferencia) {
      void carregarBaseCartografica(localReferencia).then((image) => {
        if (referenceCancelled) return;
        referenceTexture = new THREE.CanvasTexture(image);
        referenceTexture.colorSpace = THREE.SRGBColorSpace;
        referenceTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        groundTopMaterial.map = referenceTexture;
        groundTopMaterial.color.set(0xffffff);
        groundTopMaterial.needsUpdate = true;
        referenceLoadedRef.current?.();
      }).catch(() => {
        if (!referenceCancelled) referenceErrorRef.current?.();
      });
    }

    const roadMaterial = makeMaterial(0xaebbc1);
    (mapa?.ruas ?? []).forEach((rua) => rua.pontos.slice(0, -1).forEach((point, index) => {
      const next = rua.pontos[index + 1];
      const dx = next.x - point.x;
      const dz = next.y - point.y;
      const road = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dz) * scale, 0.08, rua.largura * scale), roadMaterial);
      road.position.set(mapX((point.x + next.x) / 2), -0.04, mapZ((point.y + next.y) / 2));
      road.rotation.y = -Math.atan2(dz, dx);
      road.receiveShadow = true;
      markEditable(road, { kind: 'rua', id: rua.id });
      world.add(road);
    }));

    const unitById = new Map<string, UnidadeMapa>();
    const addUnit = (unit: UnidadeMapa, x: number, z: number, unitWidth = 1.8, unitDepth = 1.25, y = 0.85, editTarget?: AlvoMapa) => {
      unitById.set(unit.id, unit);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(unitWidth, 1.2, unitDepth), makeMaterial(unitColors[unit.status], { roughness: 0.56 }));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.userData.unitId = unit.id;
      mesh.userData.baseY = y;
      if (editTarget) markEditable(mesh, editTarget);
      world.add(mesh);
    };

    const addHouse = (unit: UnidadeMapa, x: number, z: number, houseWidth = 1.8, houseDepth = 1.45) => {
      unitById.set(unit.id, unit);
      const walls = new THREE.Mesh(new THREE.BoxGeometry(houseWidth, 1.05, houseDepth), makeMaterial(0xf0e6d2));
      walls.position.set(x, 0.53, z);
      walls.userData.unitId = unit.id;
      markEditable(walls, { kind: 'unidade', id: Number(unit.id) });
      walls.castShadow = true;
      world.add(walls);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(houseWidth, houseDepth) * 0.78, 0.95, 4), makeMaterial(0x9b6049));
      roof.rotation.y = Math.PI / 4;
      roof.position.set(x, 1.48, z);
      roof.userData.unitId = unit.id;
      markEditable(roof, { kind: 'unidade', id: Number(unit.id) });
      world.add(roof);
      const door = new THREE.Mesh(new THREE.BoxGeometry(houseWidth * 0.16, 0.48, 0.04), makeMaterial(0x755540));
      door.position.set(x, 0.25, z + houseDepth / 2 + 0.025);
      door.userData.unitId = unit.id;
      markEditable(door, { kind: 'unidade', id: Number(unit.id) });
      world.add(door);
      const status = new THREE.Mesh(new THREE.BoxGeometry(houseWidth * 0.2, 0.12, 0.06), makeMaterial(unitColors[unit.status]));
      status.position.set(x, 1.05, z + houseDepth / 2 + 0.035);
      status.userData.unitId = unit.id;
      markEditable(status, { kind: 'unidade', id: Number(unit.id) });
      world.add(status);
      const label = makeLabel(modoVisitante ? `Destino · ${unit.numero}` : unit.numero, modoVisitante ? '#125948' : '#344e49');
      label.position.set(x, 2.15, z);
      markEditable(label, { kind: 'unidade', id: Number(unit.id) });
      world.add(label);
    };

    const blocks = mapa?.blocos ?? [];
    if (blocks.length) {
      blocks.forEach((block, index) => {
        const editTarget: AlvoMapa = { kind: 'bloco', id: block.id };
        const unitsInBlock = unidadesVisiveis.filter((unit) => unit.bloco === block.nome);
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
          markEditable(sector, editTarget);
          world.add(sector);
          const sectorLabel = makeLabel(modoVisitante ? `Destino · ${block.nome}` : block.nome, modoVisitante ? '#125948' : '#426447');
          sectorLabel.position.set(x, 0.85, z - blockDepth / 2 - 0.7);
          markEditable(sectorLabel, editTarget);
          world.add(sectorLabel);
          const perRow = Math.max(1, Math.ceil(Math.sqrt(unitsInBlock.length)));
          unitsInBlock.forEach((unit, unitIndex) => {
            const coordinates = mapa?.unidades.find((item) => item.unidade_id === Number(unit.id));
            const unitX = coordinates ? mapX(coordinates.x) : x + (unitIndex % perRow - (perRow - 1) / 2) * (blockWidth / perRow);
            const unitZ = coordinates ? mapZ(coordinates.y) : z + (Math.floor(unitIndex / perRow) - (Math.ceil(unitsInBlock.length / perRow) - 1) / 2) * (blockDepth / perRow);
            addHouse(unit, unitX, unitZ, coordinates ? Math.max(1, coordinates.largura * scale) : Math.min(1.65, blockWidth / (perRow + 1)), coordinates ? Math.max(1, coordinates.altura * scale) : Math.min(1.35, blockDepth / (perRow + 1)));
          });
        } else {
          const building = new THREE.Mesh(new THREE.BoxGeometry(blockWidth, blockHeight, blockDepth), makeMaterial(index % 2 ? 0xe7e4da : 0xf2eee4));
          building.position.set(x, blockHeight / 2 - 0.05, z);
          building.castShadow = true;
          building.receiveShadow = true;
          markEditable(building, editTarget);
          world.add(building);

          const roof = new THREE.Mesh(new THREE.BoxGeometry(blockWidth + 0.28, 0.16, blockDepth + 0.28), makeMaterial(index % 2 ? 0x596f6c : 0x647977));
          roof.position.set(x, blockHeight - 0.03, z);
          markEditable(roof, editTarget);
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
            markEditable(line, editTarget);
            world.add(line);
          }
          const label = makeLabel(modoVisitante ? `Destino · ${block.nome}` : block.nome, modoVisitante ? '#125948' : '#344e49');
          label.position.set(x, blockHeight + 0.95, z);
          markEditable(label, editTarget);
          world.add(label);

          apartmentUnits.forEach((unit, unitIndex) => {
            const perRow = Math.max(1, Math.ceil(Math.sqrt(apartmentUnits.length)));
            const unitWidth = Math.min(1.5, blockWidth / (perRow + 1));
            const unitDepth = Math.min(1.1, blockDepth / (perRow + 1));
            const unitX = x + (unitIndex % perRow - (perRow - 1) / 2) * (unitWidth + 0.14);
            const unitZ = z + (Math.floor(unitIndex / perRow) - (Math.ceil(apartmentUnits.length / perRow) - 1) / 2) * (unitDepth + 0.14);
            addUnit(unit, unitX, unitZ, unitWidth, unitDepth, blockHeight + 0.72, editTarget);
          });
          houseUnits.forEach((unit, unitIndex) => {
            const coordinates = mapa?.unidades.find((item) => item.unidade_id === Number(unit.id));
            const houseX = coordinates ? mapX(coordinates.x) : x - blockWidth / 2 - 2.2;
            const houseZ = coordinates ? mapZ(coordinates.y) : z + unitIndex * 2.2;
            addHouse(unit, houseX, houseZ, coordinates ? Math.max(1, coordinates.largura * scale) : 1.65, coordinates ? Math.max(1, coordinates.altura * scale) : 1.4);
          });
        }
      });
    }

    unidadesVisiveis.forEach((unit) => {
      const coordinates = mapa?.unidades.find((item) => item.unidade_id === Number(unit.id));
      if (coordinates && !unitById.has(unit.id)) {
        if (unit.tipoResidencia === 'casa') addHouse(unit, mapX(coordinates.x), mapZ(coordinates.y), Math.max(1, coordinates.largura * scale), Math.max(1, coordinates.altura * scale));
        else addUnit(unit, mapX(coordinates.x), mapZ(coordinates.y), Math.max(1, coordinates.largura * scale), Math.max(1, coordinates.altura * scale), 0.85, { kind: 'unidade', id: Number(unit.id) });
      }
    });

    (mapa?.portarias ?? []).forEach((portaria) => {
      const x = mapX(portaria.x);
      const z = mapZ(portaria.y);
      const booth = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 1.15), makeMaterial(0xf1eadc));
      booth.position.set(x, 0.45, z);
      booth.castShadow = true;
      markEditable(booth, { kind: 'portaria', id: portaria.id });
      world.add(booth);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.16, 1.35), makeMaterial(0x287a68));
      roof.position.set(x, 0.98, z);
      markEditable(roof, { kind: 'portaria', id: portaria.id });
      world.add(roof);
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), makeMaterial(0xe35f4f));
      barrier.position.set(x + 1.55, 0.55, z + 0.45);
      markEditable(barrier, { kind: 'portaria', id: portaria.id });
      world.add(barrier);
      const label = makeLabel(modoVisitante ? `Entrada · ${portaria.nome}` : portaria.nome, modoVisitante ? '#173d70' : '#344e49');
      label.position.set(x, 1.95, z);
      markEditable(label, { kind: 'portaria', id: portaria.id });
      world.add(label);
    });

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
      markEditable(base, { kind: 'area', id: area.id });
      base.receiveShadow = true;
      world.add(base);

      if (isPool) {
        const water = new THREE.Mesh(new THREE.BoxGeometry(areaWidth * 0.76, 0.12, areaDepth * 0.68), makeMaterial(0x42b4d5, { roughness: 0.28, metalness: 0.12 }));
        water.position.set(x, 0.13, z);
        markEditable(water, { kind: 'area', id: area.id });
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
        markEditable(outline, { kind: 'area', id: area.id });
        world.add(outline);
        const middle = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.14, -areaDepth / 2), new THREE.Vector3(0, 0.14, areaDepth / 2)]), new THREE.LineBasicMaterial({ color: 0xffffff }));
        middle.position.set(x, 0, z);
        markEditable(middle, { kind: 'area', id: area.id });
        world.add(middle);
      }

      const label = makeLabel(modoVisitante ? `Destino · ${area.nome}` : area.nome, modoVisitante ? '#125948' : '#34564d');
      label.userData.areaId = area.id;
      label.position.set(x, 0.92, z);
      markEditable(label, { kind: 'area', id: area.id });
      base.userData.areaId = area.id;
      world.add(label);
    });

    // Saved objects store their orientation in degrees. Apply each orientation
    // around its map-space center to every mesh that belongs to the object.
    const rotations: { target: AlvoMapa; x: number; y: number; degrees: number }[] = [
      ...(mapa?.blocos ?? []).map((item) => ({ target: { kind: 'bloco' as const, id: item.id }, x: item.x, y: item.y, degrees: item.rotacao ?? 0 })),
      ...(mapa?.unidades ?? []).map((item) => ({ target: { kind: 'unidade' as const, id: item.unidade_id }, x: item.x, y: item.y, degrees: item.rotacao ?? 0 })),
      ...(mapa?.areas_comuns ?? []).map((item) => ({ target: { kind: 'area' as const, id: item.id }, x: item.x, y: item.y, degrees: item.rotacao ?? 0 })),
      ...(mapa?.portarias ?? []).map((item) => ({ target: { kind: 'portaria' as const, id: item.id }, x: item.x, y: item.y, degrees: item.rotacao ?? 0 })),
    ];
    rotations.forEach(({ target, x, y, degrees }) => {
      if (!degrees) return;
      const center = new THREE.Vector3(mapX(x), 0, mapZ(y));
      const radians = degrees * (Math.PI / 180);
      world.children.filter((object) => {
        const item = object.userData.editTarget as AlvoMapa | undefined;
        return item?.kind === target.kind && item.id === target.id;
      }).forEach((object) => {
        object.position.sub(center).applyAxisAngle(new THREE.Vector3(0, 1, 0), radians).add(center);
        object.rotation.y += radians;
      });
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let selectionOutline: THREE.Box3Helper | null = null;
    let dragging = false;
    let moved = false;
    let previousX = 0;
    let previousY = 0;
    let yaw = editMode ? 0 : 0.65;
    let pitch = editMode ? 1.5 : 0.76;
    let distance = Math.max(16, mapSpan * 1.55);
    let transformDrag: { target: AlvoMapa; tool: 'move' | 'scale' | 'rotate'; start: THREE.Vector3; center: THREE.Vector3; bounds: THREE.Vector3; startAngle: number; rotationDelta: number; objects: Map<THREE.Object3D, { position: THREE.Vector3; scale: THREE.Vector3; rotation: THREE.Euler }> } | null = null;

    const updatePointer = (event: MouseEvent | PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };
    const groundPoint = (event: MouseEvent | PointerEvent) => {
      updatePointer(event);
      return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    };
    const hitTarget = (event: MouseEvent | PointerEvent) => {
      updatePointer(event);
      const hit = raycaster.intersectObjects(world.children, true).find((entry) => entry.object.userData.editTarget);
      return hit?.object.userData.editTarget as AlvoMapa | undefined;
    };
    const highlightTarget = (target: AlvoMapa | null) => {
      if (selectionOutline) { world.remove(selectionOutline); selectionOutline.geometry.dispose(); (selectionOutline.material as THREE.Material).dispose(); selectionOutline = null; }
      if (!target) return;
      world.updateMatrixWorld(true);
      const objects = world.children.filter((object) => {
        const item = object.userData.editTarget as AlvoMapa | undefined;
        return item?.kind === target.kind && item.id === target.id;
      });
      if (!objects.length) return;
      const bounds = new THREE.Box3();
      objects.forEach((object) => bounds.expandByObject(object));
      selectionOutline = new THREE.Box3Helper(bounds, 0xf59e0b);
      selectionOutline.userData.selectionOutline = true;
      world.add(selectionOutline);
    };
    if (editMode && selectedTarget) highlightTarget(selectedTarget);

    const updateCamera = () => {
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
      camera.lookAt(0, 0, 0);
    };
    const distanciaEnquadrada = () => Math.max(16, mapSpan * 1.55 * (modoVisitante ? Math.max(1, 1 / camera.aspect) : 1));
    const limitarDistancia = (valor: number) => Math.max(mapSpan * 0.55, Math.min(Math.max(mapSpan * 3, distanciaEnquadrada()), valor));
    const cameraControl = (event: Event) => {
      const action = (event as CustomEvent<{ action: AcaoCamera }>).detail?.action;
      if (action === 'top') { yaw = 0; pitch = 1.5; distance = distanciaEnquadrada(); }
      else if (action === 'rotate') { yaw = 0.65; pitch = 0.76; distance = distanciaEnquadrada(); }
      else if (action === 'zoom-in') distance = limitarDistancia(distance / 1.25);
      else if (action === 'zoom-out') distance = limitarDistancia(distance * 1.25);
      else distance = distanciaEnquadrada();
      updateCamera();
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
      moved = false;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      if (!editModeRef.current) { dragging = true; return; }
      const tool = editToolRef.current;
      if (tool !== 'move' && tool !== 'scale' && tool !== 'rotate') { dragging = false; return; }
      const target = hitTarget(event);
      if (!target) { dragging = false; return; }
      selectTargetRef.current?.(target);
      highlightTarget(target);
      if (tool === 'scale' && target.kind === 'portaria') { dragging = false; return; }
      const point = groundPoint(event);
      if (!point) { dragging = false; return; }
      const objects = world.children.filter((object) => {
        const value = object.userData.editTarget as AlvoMapa | undefined;
        return value?.kind === target.kind && value.id === target.id;
      });
      const bounds = new THREE.Box3();
      objects.forEach((object) => bounds.expandByObject(object));
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const savedCenter = target.kind === 'bloco' ? mapa?.blocos.find((item) => item.id === target.id)
        : target.kind === 'unidade' ? mapa?.unidades.find((item) => item.unidade_id === target.id)
          : target.kind === 'area' ? mapa?.areas_comuns.find((item) => item.id === target.id)
            : target.kind === 'portaria' ? mapa?.portarias.find((item) => item.id === target.id) : undefined;
      if (savedCenter) center.set(mapX(savedCenter.x), center.y, mapZ(savedCenter.y));
      if (target.kind === 'rua') {
        const road = mapa?.ruas.find((item) => item.id === target.id);
        if (road?.pontos.length) center.set(mapX(road.pontos.reduce((sum, value) => sum + value.x, 0) / road.pontos.length), center.y, mapZ(road.pontos.reduce((sum, value) => sum + value.y, 0) / road.pontos.length));
      }
      transformDrag = {
        target, tool, start: point.clone(), center,
        bounds: new THREE.Vector3(Math.max(size.x, 1), Math.max(size.z, 1), 0),
        startAngle: Math.atan2(point.z - center.z, point.x - center.x), rotationDelta: 0,
        objects: new Map(objects.map((object) => [object, { position: object.position.clone(), scale: object.scale.clone(), rotation: object.rotation.clone() }])),
      };
      dragging = true;
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      if (Math.abs(event.clientX - previousX) + Math.abs(event.clientY - previousY) > 3) moved = true;
      if (transformDrag) {
        const point = groundPoint(event);
        if (!point) return;
        let dx = point.x - transformDrag.start.x;
        let dz = point.z - transformDrag.start.z;
        const axis = axisLockRef.current;
        if (axis === 'x') dz = 0;
        if (axis === 'y') dx = 0;
        if (transformDrag.tool === 'rotate') {
          let angle = Math.atan2(point.z - transformDrag.center.z, point.x - transformDrag.center.x) - transformDrag.startAngle;
          if (!event.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
          transformDrag.rotationDelta = angle;
          transformDrag.objects.forEach((origin, object) => {
            const offset = origin.position.clone().sub(transformDrag!.center).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            object.position.copy(transformDrag!.center).add(offset);
            object.rotation.set(origin.rotation.x, origin.rotation.y + angle, origin.rotation.z);
          });
          if (selectionOutline) {
            const bounds = new THREE.Box3();
            transformDrag.objects.forEach((_, object) => bounds.expandByObject(object));
            selectionOutline.box.copy(bounds);
            selectionOutline.updateMatrixWorld(true);
          }
          previousX = event.clientX; previousY = event.clientY;
          return;
        }
        const factorX = transformDrag.tool === 'scale' && axis !== 'y' ? Math.max(0.2, Math.min(5, 1 + dx / (transformDrag.bounds.x / 2))) : 1;
        const factorY = transformDrag.tool === 'scale' && axis !== 'x' ? Math.max(0.2, Math.min(5, 1 + dz / (transformDrag.bounds.y / 2))) : 1;
        transformDrag.objects.forEach((origin, object) => {
          if (transformDrag?.tool === 'move') object.position.set(origin.position.x + dx, origin.position.y, origin.position.z + dz);
          else if (transformDrag) {
            object.position.set(transformDrag.center.x + (origin.position.x - transformDrag.center.x) * factorX, origin.position.y, transformDrag.center.z + (origin.position.z - transformDrag.center.z) * factorY);
            object.scale.set(origin.scale.x * factorX, origin.scale.y, origin.scale.z * factorY);
          }
        });
        if (selectionOutline) {
          const bounds = new THREE.Box3();
          transformDrag.objects.forEach((_, object) => bounds.expandByObject(object));
          selectionOutline.box.copy(bounds);
          selectionOutline.updateMatrixWorld(true);
        }
        previousX = event.clientX; previousY = event.clientY;
        return;
      }
      if (editModeRef.current) return;
      yaw -= (event.clientX - previousX) * 0.008;
      pitch = Math.max(0.35, Math.min(1.35, pitch + (event.clientY - previousY) * 0.008));
      previousX = event.clientX;
      previousY = event.clientY;
      updateCamera();
    };
    const pointerUp = () => {
      if (transformDrag) {
        const data = transformDrag;
        const center = new THREE.Box3();
        data.objects.forEach((_, object) => center.expandByObject(object));
        const movedCenter = data.tool === 'rotate' ? data.center : center.getCenter(new THREE.Vector3());
        const movedRatioX = data.tool === 'scale' ? Math.max(0.2, center.getSize(new THREE.Vector3()).x / data.bounds.x) : 1;
        const movedRatioY = data.tool === 'scale' ? Math.max(0.2, center.getSize(new THREE.Vector3()).z / data.bounds.y) : 1;
        if (moved) transformTargetRef.current?.(data.target,
          Math.max(0, Math.round((movedCenter.x / scale) + width / 2)),
          Math.max(0, Math.round((movedCenter.z / scale) + height / 2)), movedRatioX, movedRatioY, data.rotationDelta * (180 / Math.PI));
        transformDrag = null;
      }
      dragging = false;
    };
    const wheel = (event: WheelEvent) => {
      distance = limitarDistancia(distance + event.deltaY * 0.02);
      updateCamera();
    };
    const click = (event: MouseEvent) => {
      if (moved) return;
      updatePointer(event);
      if (editModeRef.current) {
        const target = hitTarget(event);
        if (target) { selectTargetRef.current?.(target); highlightTarget(target); return; }
        if (editToolRef.current === 'house' || editToolRef.current === 'road') {
          const point = groundPoint(event);
          if (point) editPlaceRef.current?.(Math.max(0, Math.min(width, point.x / scale + width / 2)), Math.max(0, Math.min(height, point.z / scale + height / 2)), editToolRef.current);
        }
        return;
      }
      const areaHit = raycaster.intersectObjects(world.children).find((entry) => entry.object.userData.areaId);
      if (areaHit && !placementRef.current) {
        const areaId = Number(areaHit.object.userData.areaId);
        canvas.dataset.dragArea = String(areaId);
        return;
      }
      if (placementRef.current) {
        const groundHit = raycaster.intersectObject(ground);
        if (groundHit[0]) {
          const point = groundHit[0].point;
          placeRef.current?.(Math.max(0, Math.min(width, point.x / scale + width / 2)), Math.max(0, Math.min(height, point.z / scale + height / 2)));
        }
        return;
      }
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
    canvas.addEventListener('map-camera', cameraControl);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (modoVisitante) distance = distanciaEnquadrada();
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
      referenceCancelled = true;
      referenceTexture?.dispose();
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointerleave', pointerUp);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('click', click);
      canvas.removeEventListener('map-camera', cameraControl);
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
  }, [mapa, unidades, editMode, localReferencia, modoVisitante]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cameraAction) return;
    canvas.dispatchEvent(new CustomEvent('map-camera', { detail: cameraAction }));
  }, [cameraAction]);

  const cursorClass = placementMode ? 'cursor-crosshair' : editMode ? editTool === 'scale' ? 'cursor-nwse-resize' : editTool === 'move' ? 'cursor-move' : editTool === 'rotate' ? 'cursor-alias' : 'cursor-default' : 'cursor-grab active:cursor-grabbing';
  return <canvas key={sceneKey} ref={canvasRef} className={`block w-full touch-none ${modoVisitante ? 'h-[min(57dvh,550px)] min-h-[280px]' : 'h-[min(68vh,700px)] min-h-105'} ${cursorClass}`} aria-label={editMode ? 'Modo de edição do mapa 3D' : 'Mapa 3D interativo do condomínio'}/>;
}
