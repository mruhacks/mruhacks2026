'use client';

import * as React from 'react';
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';

import styles from './display.module.css';

/**
 * Animated aurora background, ported from the MRUHacks 2026 banner (itself
 * the ReactBits "Aurora" with a light mode added). Needs WebGL2 for the
 * `#version 300 es` shader; without it the container gets a static gradient
 * in the same colours instead.
 */

const COLOR_STOPS = ['#FADF4B', '#D841A1', '#93FFFF'];
const AMPLITUDE = 1;
const BLEND = 0.5;
const SPEED = 0.5;
/** Matches the 2s colour transitions everywhere else on the screen. */
const THEME_TRANSITION_MS = 2000;

const vertexShader = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentShader = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;
uniform float uLightMode;
out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) { \\
  int index = 0; \\
  for (int i = 0; i < 2; i++) { \\
    ColorStop currentColor = colors[i]; \\
    bool isInBetween = currentColor.position <= factor; \\
    index = int(mix(float(index), float(i), float(isInBetween))); \\
  } \\
  ColorStop currentColor = colors[index]; \\
  ColorStop nextColor = colors[index + 1]; \\
  float range = nextColor.position - currentColor.position; \\
  float lerpFactor = (factor - currentColor.position) / range; \\
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \\
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);
  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);
  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = uv.y * 2.0 - height + 0.2;
  float intensity = 0.6 * height;
  float auroraAlpha = smoothstep(0.20 - uBlend * 0.5, 0.20 + uBlend * 0.5, intensity);
  vec3 auroraColor = intensity * rampColor;
  vec4 darkColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
  float energy = clamp(max(intensity, 0.0), 0.0, 1.0);
  float coverage = clamp(auroraAlpha * (0.55 + 0.45 * energy), 0.0, 0.86);
  vec3 chroma = pow(clamp(rampColor, 0.0, 1.0), vec3(1.2));
  float chromaPeak = max(chroma.r, max(chroma.g, chroma.b));
  chroma /= max(chromaPeak, 0.0001);
  vec4 lightColor = vec4(mix(vec3(1.0), chroma, min(coverage * 1.08, 0.94)), 1.0);
  fragColor = mix(darkColor, lightColor, clamp(uLightMode, 0.0, 1.0));
}`;

export function Aurora({ lightMode }: { lightMode: boolean }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  // Read by the render loop each frame, so a theme change eases over instead
  // of tearing down the WebGL context.
  const themeRef = React.useRef({
    from: lightMode ? 1 : 0,
    target: lightMode ? 1 : 0,
    value: lightMode ? 1 : 0,
    startedAt: 0,
  });

  React.useEffect(() => {
    const theme = themeRef.current;
    theme.from = theme.value;
    theme.target = lightMode ? 1 : 0;
    theme.startedAt = performance.now();
  }, [lightMode]);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
      });
    } catch {
      container.classList.add(styles.auroraFallback);
      return undefined;
    }
    if (!renderer.isWebgl2) {
      renderer.gl?.getExtension('WEBGL_lose_context')?.loseContext();
      container.classList.add(styles.auroraFallback);
      return undefined;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.backgroundColor = 'transparent';
    gl.canvas.style.display = 'block';

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: AMPLITUDE },
        uColorStops: {
          value: COLOR_STOPS.map((hex) => {
            const color = new Color(hex);
            return [color.r, color.g, color.b];
          }),
        },
        uResolution: { value: [1, 1] },
        uBlend: { value: BLEND },
        uLightMode: { value: themeRef.current.value },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    container.appendChild(gl.canvas);

    const resize = () => {
      const width = container.offsetWidth || 1;
      const height = container.offsetHeight || 1;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width, height];
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frame = 0;
    const update = (time: number) => {
      const theme = themeRef.current;
      const progress = Math.min(
        (performance.now() - theme.startedAt) / THEME_TRANSITION_MS,
        1,
      );
      theme.value = theme.from + (theme.target - theme.from) * progress;
      program.uniforms.uTime.value = time * 0.001 * SPEED;
      program.uniforms.uLightMode.value = theme.value;
      renderer.render({ scene: mesh });
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      if (gl.canvas.parentNode === container) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return <div ref={containerRef} className={styles.aurora} aria-hidden />;
}
