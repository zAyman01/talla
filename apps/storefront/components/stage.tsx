'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
        powerPreference: 'low-power',
      });
    } catch {
      setFailed(true);
      setStatus(
        'هذا الجهاز لا يدعم العرض ثلاثي الأبعاد. يمكنك متابعة مراجعة صور القطعة.',
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.domElement.setAttribute(
      'aria-label',
      'مانيكان مرجعي. اسحب للدوران واستخدم عجلة التمرير للتقريب.',
    );
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 0.1, 3.6);
    const tokens = getComputedStyle(element);
    const light = new THREE.Color(tokens.getPropertyValue('--studio-light-color').trim());
    const ground = new THREE.Color(
      tokens.getPropertyValue('--studio-ground-color').trim(),
    );
    scene.add(new THREE.HemisphereLight(light, ground, 2));
    const key = new THREE.DirectionalLight(light, 2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 5;
    const draw = (): void => {
      if (disposed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!disposed) renderer.render(scene, camera);
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
          node.geometry.dispose();
          const materials = Array.isArray(node.material)
            ? node.material
            : [node.material];
          for (const material of materials) {
            for (const value of Object.values(material) as unknown[]) {
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
            onClick={() => rotate.current(-Math.PI / 6)}
            aria-label="تدوير إلى اليسار"
          >
            ↶
          </button>
          <button onClick={() => reset.current()}>إعادة العرض</button>
          <button
            onClick={() => rotate.current(Math.PI / 6)}
            aria-label="تدوير إلى اليمين"
          >
            ↷
          </button>
        </div>
      )}
    </>
  );
}
