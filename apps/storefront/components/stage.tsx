'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function Stage({
  onLoaded,
}: {
  onLoaded: (milliseconds: number) => void;
}): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const rotate = useRef<(delta: number) => void>(() => undefined);
  const reset = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState('جارٍ تحميل المانيكان…');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const start = performance.now();
    let disposed = false;
    let frame = 0;
    let model: THREE.Object3D | undefined;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFailed(true);
      setStatus(
        'هذا الجهاز لا يدعم العرض ثلاثي الأبعاد. يمكنك متابعة مراجعة صور القطعة.',
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute(
      'aria-label',
      'مانيكان مرجعي. اسحب للدوران واستخدم عجلة التمرير للتقريب.',
    );
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.85;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    camera.position.set(0, 0.08, 4.2);
    const tokens = getComputedStyle(element);
    const light = new THREE.Color(tokens.getPropertyValue('--studio-light-color').trim());
    const ground = new THREE.Color(
      tokens.getPropertyValue('--studio-ground-color').trim(),
    );
    scene.add(new THREE.HemisphereLight(light, ground, 0.95));

    const key = new THREE.DirectionalLight(light, 3.4);
    key.position.set(2.5, 3.8, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00015;
    key.shadow.radius = 2.5;
    scene.add(key);

    const fill = new THREE.DirectionalLight(light, 1.4);
    fill.position.set(-2.8, 2.2, 2.4);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(light, 3.2);
    rim.position.set(-1.6, 3.2, -3.4);
    scene.add(rim);

    const kick = new THREE.DirectionalLight(light, 1.8);
    kick.position.set(2.2, 2.4, -2.8);
    scene.add(kick);

    const face = new THREE.PointLight(light, 0.5, 5, 1.8);
    face.position.set(0, 1.8, 2.2);
    scene.add(face);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 5;
    const draw = (): void => {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!disposed) {
          const moving = controls.update();
          renderer.render(scene, camera);
          if (moving) draw();
        }
      });
    };
    controls.addEventListener('change', draw);
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    });
    resize.observe(element);
    const lost = (event: Event): void => {
      event.preventDefault();
      setFailed(true);
      setStatus('توقف العرض ثلاثي الأبعاد. صور القطعة ما زالت متاحة للمراجعة.');
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    function release(object: THREE.Object3D): void {
      object.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          const mesh = node as THREE.Mesh;
          mesh.geometry.dispose();
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const material of materials) {
            for (const value of Object.values(
              material as unknown as Record<string, unknown>,
            )) {
              if (value instanceof THREE.Texture) value.dispose();
            }
            material.dispose();
          }
        }
      });
    }
    void new GLTFLoader()
      .loadAsync('/references/mannequin.glb')
      .then((gltf) => {
        if (disposed) {
          release(gltf.scene);
          return;
        }
        model = gltf.scene;
        model.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.material = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color(
                tokens.getPropertyValue('--mannequin').trim() || '#111214',
              ),
              roughness: 0.22,
              metalness: 0.05,
              clearcoat: 0.88,
              clearcoatRoughness: 0.12,
              sheen: 0.35,
              sheenColor: new THREE.Color(0xffffff),
              sheenRoughness: 0.3,
            });
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });
        const bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = 1.75 / size.y;
        model.scale.multiplyScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        scene.add(model);
        renderer.render(scene, camera);
        onLoaded(performance.now() - start);
        setStatus('اسحب للدوران. يمكنك أيضاً استخدام أزرار التحكم.');
        draw();
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true);
          setStatus('تعذر تحميل المانيكان. أعد فتح العرض للمحاولة مرة أخرى.');
        }
      });
    rotate.current = (delta) => {
      if (model) {
        model.rotation.y += delta;
        draw();
      }
    };
    reset.current = () => {
      controls.reset();
      if (model) model.rotation.y = 0;
      draw();
    };
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      if (model) release(model);
      roomEnv.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      rotate.current = () => undefined;
      reset.current = () => undefined;
    };
  }, [onLoaded]);
  return (
    <>
      <div className="canvas-host" ref={host} hidden={failed} />
      <div className={failed ? 'stage-loading' : 'stage-instruction'} role="status">
        {status}
      </div>
      {!failed && (
        <div className="rotation-controls">
          <button
            onClick={() => {
              rotate.current(-Math.PI / 6);
            }}
            aria-label="تدوير إلى اليسار"
          >
            ↶
          </button>
          <button
            onClick={() => {
              reset.current();
            }}
          >
            إعادة العرض
          </button>
          <button
            onClick={() => {
              rotate.current(Math.PI / 6);
            }}
            aria-label="تدوير إلى اليمين"
          >
            ↷
          </button>
        </div>
      )}
    </>
  );
}
