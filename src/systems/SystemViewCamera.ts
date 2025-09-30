import * as THREE from "three";

export type SystemViewFrame = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
};

export function computeSystemViewCamera(
  planets: { semiMajorAxis: number; radius: number }[],
  starPosition: THREE.Vector3,
  tilt = THREE.MathUtils.degToRad(30),
) {
  const maxExtent = planets.reduce((max, planet) => {
    const extent = (planet?.semiMajorAxis ?? 0) + (planet?.radius ?? 0);
    return Math.max(max, extent);
  }, 1);
  const distance = Math.max(4, maxExtent * 2.4);
  const height = Math.sin(tilt) * distance;
  const horizontal = Math.cos(tilt) * distance;

  const offset = new THREE.Vector3(horizontal, height, horizontal);
  const position = starPosition.clone().add(offset);
  const target = starPosition.clone();

  return { position, target, distance } satisfies SystemViewFrame;
}

export function lerpCamera(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3 } | null,
  frame: SystemViewFrame,
  alpha: number,
) {
  const nextPosition = camera.position.clone().lerp(frame.position, alpha);
  camera.position.copy(nextPosition);
  if (controls) {
    controls.target.lerp(frame.target, alpha);
  }
  camera.lookAt(frame.target);
}
