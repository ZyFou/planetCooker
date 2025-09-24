varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vAxisWorld;
varying vec3 vPlanetCenter;

uniform float uHeight;

void main() {
    vec3 localNormal = normalize(normal);
    vec3 displacedPosition = position * (1.0 + uHeight);

    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vWorldPosition = worldPosition.xyz;

    vWorldNormal = normalize(mat3(modelMatrix) * localNormal);
    vAxisWorld = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));

    vec4 worldCenter = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vPlanetCenter = worldCenter.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
