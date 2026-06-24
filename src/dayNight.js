import { TextureLoader, ShaderMaterial, Vector2 } from 'https://esm.sh/three@0.170.0';
import * as solar from 'https://esm.sh/solar-calculator@0.3.0';

const DAY_TEXTURE_URL =
  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg';
const NIGHT_TEXTURE_URL =
  'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg';

const dayNightShader = {
  vertexShader: `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #define PI 3.141592653589793
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform vec2 sunPosition;
    uniform vec2 globeRotation;
    varying vec3 vNormal;
    varying vec2 vUv;

    float toRad(in float a) {
      return a * PI / 180.0;
    }

    vec3 Polar2Cartesian(in vec2 c) {
      float theta = toRad(90.0 - c.x);
      float phi = toRad(90.0 - c.y);
      return vec3(
        sin(phi) * cos(theta),
        cos(phi),
        sin(phi) * sin(theta)
      );
    }

    void main() {
      float invLon = toRad(globeRotation.x);
      float invLat = -toRad(globeRotation.y);
      mat3 rotX = mat3(
        1, 0, 0,
        0, cos(invLat), -sin(invLat),
        0, sin(invLat), cos(invLat)
      );
      mat3 rotY = mat3(
        cos(invLon), 0, sin(invLon),
        0, 1, 0,
        -sin(invLon), 0, cos(invLon)
      );
      vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
      float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv);
      float blendFactor = smoothstep(-0.1, 0.1, intensity);
      gl_FragColor = mix(nightColor, dayColor, blendFactor);
    }
  `,
};

export function getSunPosition(date = new Date()) {
  const dt = +date;
  const day = new Date(dt).setUTCHours(0, 0, 0, 0);
  const t = solar.century(dt);
  const longitude = ((day - dt) / 864e5) * 360 - 180;
  return [longitude - solar.equationOfTime(t) / 4, solar.declination(t)];
}

export async function createDayNightMaterial() {
  const [dayTexture, nightTexture] = await Promise.all([
    new TextureLoader().loadAsync(DAY_TEXTURE_URL),
    new TextureLoader().loadAsync(NIGHT_TEXTURE_URL),
  ]);

  const material = new ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture },
      nightTexture: { value: nightTexture },
      sunPosition: { value: new Vector2(...getSunPosition()) },
      globeRotation: { value: new Vector2() },
    },
    vertexShader: dayNightShader.vertexShader,
    fragmentShader: dayNightShader.fragmentShader,
  });

  return {
    material,
    setGlobeRotation(lng, lat) {
      material.uniforms.globeRotation.value.set(lng, lat);
    },
    refreshSunPosition(date = new Date()) {
      material.uniforms.sunPosition.value.set(...getSunPosition(date));
    },
  };
}
