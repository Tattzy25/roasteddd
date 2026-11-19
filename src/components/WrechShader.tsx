import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import orbShaders from './data/orb-shaders.json';

export interface OrbShaderConfig {
  id: string;
  label: string;
  wireframe: boolean;
  detail: number;
  scale: number;
  rotationSpeed: number;
  additive?: boolean;
  background?: string;
  vertexShader: string;
  fragmentShader: string;
}

export interface WreckShaderProps {
  audioLevel: number;
  visualMode: 'idle' | 'listening' | 'speaking';
  /** Pass sessionData.session_persona (e.g. "cinder", "zero-day", "vesper") */
  personaId?: string;
}

export const WreckShader: React.FC<WreckShaderProps> = ({
  audioLevel = 0,
  visualMode = 'idle',
  personaId = 'cinder',
}: WreckShaderProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioLevelRef = useRef<number>(Number.isFinite(audioLevel) ? audioLevel : 0);
  const visualModeRef = useRef<'idle' | 'listening' | 'speaking'>(visualMode);

  useEffect(() => {
    audioLevelRef.current = Number.isFinite(audioLevel) ? audioLevel : 0;
  }, [audioLevel]);

  useEffect(() => {
    visualModeRef.current = visualMode;
  }, [visualMode]);

  // Same lookup pattern as personas.find((p) => p.id === sessionData.session_persona)
  const list = orbShaders as unknown as OrbShaderConfig[];
  const activeSlot = list.find((s) => s.id === personaId) ?? list[0];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeSlot) return;

    const initW = container.clientWidth || 400;
    const initH = container.clientHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, initW / Math.max(1, initH), 0.1, 1000);
    camera.position.z = 4.3;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.error('WebGLRenderer init failed:', err);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setSize(initW, initH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(1, activeSlot.detail);
    const material = new THREE.ShaderMaterial({
      vertexShader: activeSlot.vertexShader,
      fragmentShader: activeSlot.fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAudioLevel: { value: 0 },
        uListening: { value: 0 },
        uSpeaking: { value: 0 },
      },
      wireframe: activeSlot.wireframe,
      transparent: Boolean(activeSlot.wireframe || activeSlot.additive),
      depthWrite: !activeSlot.additive,
      side: activeSlot.additive ? THREE.DoubleSide : THREE.FrontSide,
      blending: activeSlot.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphere.scale.setScalar(activeSlot.scale);
    scene.add(sphere);

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    ro?.observe(container);
    window.addEventListener('resize', handleResize);

    const rotStep = activeSlot.rotationSpeed * 0.016;
    let frameId = 0;
    const animate = (time: number) => {
      material.uniforms.uTime.value = time * 0.001;
      const targetAudio = Number.isFinite(audioLevelRef.current) ? audioLevelRef.current : 0;
      material.uniforms.uAudioLevel.value += (targetAudio - material.uniforms.uAudioLevel.value) * 0.2;

      const targetL = visualModeRef.current === 'listening' ? 1.0 : 0.0;
      const targetS = visualModeRef.current === 'speaking' ? 1.0 : 0.0;
      material.uniforms.uListening.value += (targetL - material.uniforms.uListening.value) * 0.1;
      material.uniforms.uSpeaking.value += (targetS - material.uniforms.uSpeaking.value) * 0.1;

      sphere.rotation.y += rotStep;
      sphere.rotation.z += 0.002;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [activeSlot]);

  return <div ref={containerRef} className="w-full h-full" />;
};

export default WreckShader;
