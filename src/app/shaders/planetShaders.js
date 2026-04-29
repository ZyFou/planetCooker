// GLSL shaders ported verbatim from planet.html

export const glslNoise = `
    // Simplex 3D Noise 
    // by Ian McEwan, Ashima Arts
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

    float snoise(vec3 v){ 
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

        // First corner
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 =   v - i + dot(i, C.xxx) ;

        // Other corners
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );

        //  x0 = x0 - 0.0 + 0.0 * C 
        vec3 x1 = x0 - i1 + 1.0 * C.xxx;
        vec3 x2 = x0 - i2 + 2.0 * C.xxx;
        vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

        // Permutations
        i = mod(i, 289.0 ); 
        vec4 p = permute( permute( permute( 
                    i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

        // Gradients
        // ( N*N points uniformly over a square, mapped onto an octahedron.)
        float n_ = 1.0/7.0; // N=7
        vec3  ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );

        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);

        //Normalise gradients
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        // Mix final noise value
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                      dot(p2,x2), dot(p3,x3) ) );
    }

    // Fractal Brownian Motion
    float fbm(vec3 p, int octaves, float persistence, float lacunarity) {
        float amplitude = 1.0;
        float frequency = 1.0;
        float total = 0.0;
        float normalization = 0.0;

        for (int i = 0; i < octaves; ++i) {
            total += amplitude * snoise(p * frequency);
            normalization += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return total / normalization;
    }

    float fbmBillow(vec3 p, int octaves, float persistence, float lacunarity) {
        float amplitude = 1.0;
        float frequency = 1.0;
        float total = 0.0;
        float normalization = 0.0;

        for (int i = 0; i < octaves; ++i) {
            float n = snoise(p * frequency);
            n = abs(n);
            total += n * amplitude;
            normalization += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total / max(normalization, 0.0001);
    }

    float fbmRidged(vec3 p, int octaves, float persistence, float lacunarity) {
        float amplitude = 0.5;
        float frequency = 1.0;
        float total = 0.0;
        float weight = 1.0;

        for (int i = 0; i < 8; ++i) {
            if (i >= octaves) break;
            float n = snoise(p * frequency);
            n = 1.0 - abs(n);
            n *= n;
            n *= weight;
            total += n * amplitude;
            weight = clamp(n * 4.0, 0.0, 1.0);
            amplitude *= persistence;
            frequency *= lacunarity;
        }

        return total * 2.0;
    }

    vec3 domainWarp(vec3 p, float warpStrength, float warpFrequency, float variant) {
        vec3 q = vec3(
            snoise(p * warpFrequency + vec3(0.0, 0.0, 0.0)),
            snoise(p * warpFrequency + vec3(43.0, 17.0, 29.0)),
            snoise(p * warpFrequency + vec3(23.0, 71.0, 11.0))
        );

        vec3 r = vec3(
            snoise(p * warpFrequency * 2.0 + q * (0.5 + variant) + vec3(19.0, 39.0, 57.0)),
            snoise(p * warpFrequency * 2.0 + q * (0.5 + variant) + vec3(59.0, 11.0, 83.0)),
            snoise(p * warpFrequency * 2.0 + q * (0.5 + variant) + vec3(17.0, 93.0, 41.0))
        );

        return (q + r) * warpStrength;
    }
`;

export const terrainVertexShader = `
    ${glslNoise}

    uniform float uTime;
    uniform float uContinentSize;
    uniform float uMountainHeight;
    uniform float uRoughness;
    uniform float uDetail;
    uniform float uSeaLevel;
    uniform float uNoiseType;
    uniform float uNoiseVariant;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vHeight;
    varying float vLatitude;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        // Pass world position for consistent noise regardless of rotation if desired, 
        // but local 'position' works best for a planet that rotates as an object.
        vec3 pos = position; 

        float variant = clamp(uNoiseVariant, 0.0, 1.0);

        // Base continent shape (low frequency)
        vec3 continentCoord = pos * uContinentSize;
        float h = fbm(continentCoord, 8, uRoughness, uDetail);

        // Base ridged detail
        float hm = fbm(continentCoord * (3.0 + variant), 4, uRoughness, uDetail * (1.4 + variant * 0.3));
        hm = 1.0 - abs(hm);
        hm = pow(hm, 3.0);

        // Combine and normalize roughly to [0, 1]
        float noiseType = clamp(uNoiseType, 0.0, 3.0);
        float finalHeight;

        // Optimize: Only calculate the noise needed for the current type
        if (noiseType < 0.5) {
            // Classic
            finalHeight = (h * 0.55 + hm * 0.45) + 0.5;
        } else if (noiseType < 1.5) {
            // Ridged
            float ridged = fbmRidged(continentCoord * (2.0 + variant), 6, mix(0.35, uRoughness, 0.6), uDetail + 0.5);
            finalHeight = mix(h + 0.5, h * 0.35 + ridged * 0.65 + 0.5, 0.75);
        } else if (noiseType < 2.5) {
            // Billowy
            float billow = fbmBillow(continentCoord * (1.2 + variant * 0.6), 6, mix(0.5, uRoughness, 0.5), uDetail * (0.9 + variant * 0.4));
            finalHeight = mix(h + 0.5, billow * 0.75 + 0.25, 0.7);
        } else {
            // Warped
            float warpStrength = mix(0.18, 0.55, variant);
            vec3 warpedCoord = continentCoord + domainWarp(continentCoord, warpStrength, 1.3 + variant * 2.2, variant);
            float warped = fbm(warpedCoord, 6, uRoughness, uDetail * (1.1 + variant * 0.3));
            
            float blend = mix(0.6, 0.85, variant);
            finalHeight = mix(h + 0.5, warped * blend + 0.5 * (1.0 - blend), blend);
        }

        finalHeight = clamp(finalHeight, 0.0, 1.4);

        vHeight = finalHeight;
        vLatitude = abs(normalize(pos).y); 

        // Displacement
        // Only displace if above sea level to keep ocean flat-ish (or keep it for sea bed)
        // Scale by 0.3 to maintain visual effect with 0-1 range (was 0.1 * 3.0 max)
        float displacement = 0.0;
        if (finalHeight > uSeaLevel) {
             displacement = (finalHeight - uSeaLevel) * uMountainHeight * 0.3;
        }
        
        vec3 displacedPosition = pos + normal * displacement;
        vPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
`;

export const terrainFragmentShader = `
    uniform vec3 uSunDirection;
    uniform float uSeaLevel;
    uniform float uIceCapThreshold;
    
    uniform vec3 uColorDeepWater;
    uniform vec3 uColorShallowWater;
    uniform vec3 uColorBeach;
    uniform vec3 uColorGrass;
    uniform vec3 uColorForest;
    uniform vec3 uColorMountain;
    uniform vec3 uColorMountainHigh;
    uniform vec3 uColorSnow;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vHeight;
    varying float vLatitude;

    void main() {
        // Re-normalize normal interpolated across surface
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uSunDirection);
        vec3 viewDir = normalize(cameraPosition - vPosition);

        // --- Lighting ---
        // Standard Diffuse with minimum illumination
        float NdotL = dot(normal, lightDir);
        // Ensure minimum illumination so it's always visible (like constant daylight)
        float lightIntensity = max(NdotL, 0.4);
        
        // Ambient - increased for constant visibility
        vec3 ambient = vec3(0.4);

        // Specular (only for water)
        float specularStrength = 0.0;
        if (vHeight <= uSeaLevel) {
             vec3 reflectDir = reflect(-lightDir, normal);
             float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
             specularStrength = spec * 0.5;
        }

        // --- Color Mapping ---
        vec3 color;
        
        // Normalize height relative to sea level for easier coloring
        float h = vHeight;

        if (h <= uSeaLevel) {
            // Water: mix deep and shallow based on depth
            float waterDepth = smoothstep(uSeaLevel - 0.2, uSeaLevel, h);
            color = mix(uColorDeepWater, uColorShallowWater, waterDepth);
        } else {
            // Land: mix based on altitude
            float alt = smoothstep(uSeaLevel, 1.0, h); // normalized land altitude
            
            color = mix(uColorBeach, uColorGrass, smoothstep(0.0, 0.05, alt));
            color = mix(color, uColorForest, smoothstep(0.05, 0.3, alt));
            // Mix between base mountain and high mountain colors
            color = mix(color, uColorMountain, smoothstep(0.3, 0.5, alt));
            color = mix(color, uColorMountainHigh, smoothstep(0.5, 0.7, alt));
            color = mix(color, uColorSnow, smoothstep(0.7, 0.9, alt));
        }

        // Ice Caps based on latitude
        float ice = smoothstep(uIceCapThreshold - 0.1, uIceCapThreshold, vLatitude);
        // Ensure ice sits on top of water AND land
        if (vHeight <= uSeaLevel) {
             // Sea ice might be slightly different color or smoother, but let's keep it simple
             color = mix(color, uColorSnow * 0.9, ice);
             if (ice > 0.5) specularStrength *= 0.1; // Less specular on ice
        } else {
             color = mix(color, uColorSnow, ice);
        }

        // City Lights on dark side (simple height based mask)
        // Cities usually on low-lying land, not water, not high mountains, not ice.
        float night = 1.0 - lightIntensity;
        night = smoothstep(0.5, 0.8, night); // sharper transition for lights
        
        if (night > 0.0 && h > uSeaLevel && h < uSeaLevel + 0.3 && vLatitude < uIceCapThreshold - 0.1) {
            // Use simple noise to patch city lights
            float cityNoise = fract(sin(dot(vPosition.xy ,vec2(12.9898,78.233))) * 43758.5453);
            // Filter cities by some noise so they aren't everywhere
            if (cityNoise > 0.96) {
                 color += vec3(1.0, 0.8, 0.4) * night * 2.0; // Warm city lights
            }
        }

        // Combine lighting
        vec3 finalColor = (ambient + lightIntensity) * color + vec3(specularStrength);

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export const atmosphereVertexShader = `
    ${glslNoise}
    
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vLocalPosition = position;
        vViewDir = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const atmosphereFragmentShader = `
    ${glslNoise}
    
    uniform vec3 uSunDirection;
    uniform vec3 uAtmosphereColor;
    uniform float uAtmosphereDensity;
    uniform float uAtmosphereIntensity;
    uniform float uAtmosphereReflection;
    uniform float uAtmosphereDetail;
    uniform float uAtmosphereFalloff;
    uniform float uTime;

    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldPosition;
    varying vec3 vLocalPosition;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewDir);
        vec3 sunDir = normalize(uSunDirection);
        
        // Base uniform intensity - ensures visibility from all angles
        float baseIntensity = uAtmosphereIntensity;
        
        // Subtle rim enhancement (much weaker than before for uniformity)
        float viewDotNormal = dot(viewDir, normal);
        float rimFactor = pow(1.0 - max(viewDotNormal, 0.0), uAtmosphereFalloff);
        // Make rim effect much subtler - only adds 10-20% enhancement
        float rimIntensity = 1.0 + rimFactor * 0.15;
        
        // Day/night variation (subtle)
        float lightDotNormal = dot(normal, sunDir);
        float dayNightFactor = 0.7 + 0.3 * smoothstep(-0.3, 1.0, lightDotNormal);
        
        // Atmospheric detail using noise
        vec3 detailCoord = normalize(vLocalPosition) * uAtmosphereDetail;
        float detailNoise = snoise(detailCoord + vec3(uTime * 0.01)) * 0.5 + 0.5;
        // Subtle detail variation (5-10% variation)
        float detailFactor = 1.0 + (detailNoise - 0.5) * 0.1;
        
        // Reflection effect (specular highlight from sun)
        vec3 reflectDir = reflect(-sunDir, normal);
        float specular = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
        float reflection = specular * uAtmosphereReflection;
        
        // Combine all factors
        float finalIntensity = baseIntensity * rimIntensity * dayNightFactor * detailFactor;
        
        // Calculate final color
        vec3 atmosphere = uAtmosphereColor * finalIntensity * uAtmosphereDensity;
        
        // Add reflection highlight
        atmosphere += uAtmosphereColor * reflection * 0.5;
        
        // Ensure minimum visibility for uniformity
        float minVisibility = uAtmosphereDensity * 0.3;
        atmosphere = max(atmosphere, uAtmosphereColor * minVisibility);
        
        // Calculate alpha based on intensity
        float alpha = length(atmosphere) * 0.5;
        alpha = clamp(alpha, 0.0, 1.0);

        gl_FragColor = vec4(atmosphere, alpha);
    }
`;

export const gasPlanetVertexShader = `
    ${glslNoise}

    uniform float uTime;
    uniform float uTurbulence;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vLocalPos;
    varying float vLatitude;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec3 pos = position;
        vLocalPos = pos;
        
        // Calculate latitude for stripe direction
        vLatitude = normalize(pos).y;
        
        // Subtle displacement for gas turbulence (very minimal)
        vec3 noisePos = pos * 2.0 + vec3(uTime * 0.05);
        float turbulence = snoise(noisePos) * uTurbulence * 0.01;
        vec3 displacedPosition = pos + normal * turbulence;
        
        vPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
`;

export const flatTerrainVertexShader = `
    ${glslNoise}

    uniform float uTime;
    uniform float uContinentSize;
    uniform float uMountainHeight;
    uniform float uRoughness;
    uniform float uDetail;
    uniform float uSeaLevel;
    uniform float uNoiseType;
    uniform float uNoiseVariant;
    uniform float uBaseLatitude;
    uniform float uBaseLongitude;
    uniform float uRadius;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vHeight;
    varying float vLatitude;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        
        // Get world position (plane coordinates: x, y=0, z)
        vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        
        // Terrain scale factor: converts world units to angular displacement
        // This ensures terrain features are properly scaled for walking
        // A larger factor means more terrain variation per world unit
        float terrainScale = 0.002 / max(uRadius, 0.1);
        
        // Calculate angular displacement from spawn point
        // Scale world coordinates to get reasonable lat/lon deltas
        float latDelta = worldPos.z * terrainScale;
        float lonDelta = worldPos.x * terrainScale;
        
        // Apply latitude bounds to prevent pole singularities
        float maxLat = 1.4; // ~80 degrees
        float lat = clamp(uBaseLatitude + latDelta, -maxLat, maxLat);
        
        // For longitude, account for latitude (distance per longitude shrinks at poles)
        float avgLat = clamp((uBaseLatitude + lat) * 0.5, -1.3, 1.3);
        float cosLat = max(0.15, cos(avgLat));
        float lon = uBaseLongitude + lonDelta / cosLat;
        
        // Wrap longitude to [-PI, PI]
        lon = mod(lon + 3.14159, 6.28318) - 3.14159;
        
        // Convert spherical to cartesian (3D direction vector for noise sampling)
        float cosLat2 = max(0.15, cos(lat));
        vec3 dir = normalize(vec3(
            cosLat2 * cos(lon),
            sin(lat),
            cosLat2 * sin(lon)
        ));
        
        // Use direction for noise sampling
        vec3 pos = dir;
        float variant = clamp(uNoiseVariant, 0.0, 1.0);

        // Base continent shape (low frequency)
        vec3 continentCoord = pos * uContinentSize;
        float h = fbm(continentCoord, 8, uRoughness, uDetail);

        // Base ridged detail
        float hm = fbm(continentCoord * (3.0 + variant), 4, uRoughness, uDetail * (1.4 + variant * 0.3));
        hm = 1.0 - abs(hm);
        hm = pow(hm, 3.0);

        // Combine and normalize roughly to [0, 1]
        float noiseType = clamp(uNoiseType, 0.0, 3.0);
        float finalHeight;

        // Optimize: Only calculate the noise needed for the current type
        if (noiseType < 0.5) {
            // Classic
            finalHeight = (h * 0.55 + hm * 0.45) + 0.5;
        } else if (noiseType < 1.5) {
            // Ridged
            float ridged = fbmRidged(continentCoord * (2.0 + variant), 6, mix(0.35, uRoughness, 0.6), uDetail + 0.5);
            finalHeight = mix(h + 0.5, h * 0.35 + ridged * 0.65 + 0.5, 0.75);
        } else if (noiseType < 2.5) {
            // Billowy
            float billow = fbmBillow(continentCoord * (1.2 + variant * 0.6), 6, mix(0.5, uRoughness, 0.5), uDetail * (0.9 + variant * 0.4));
            finalHeight = mix(h + 0.5, billow * 0.75 + 0.25, 0.7);
        } else {
            // Warped
            float warpStrength = mix(0.18, 0.55, variant);
            vec3 warpedCoord = continentCoord + domainWarp(continentCoord, warpStrength, 1.3 + variant * 2.2, variant);
            float warped = fbm(warpedCoord, 6, uRoughness, uDetail * (1.1 + variant * 0.3));
            
            float blend = mix(0.6, 0.85, variant);
            finalHeight = mix(h + 0.5, warped * blend + 0.5 * (1.0 - blend), blend);
        }

        finalHeight = clamp(finalHeight, 0.0, 1.4);

        vHeight = finalHeight;
        vLatitude = abs(dir.y);

        // Displacement - apply mountain height more prominently
        float displacement = 0.0;
        if (finalHeight > uSeaLevel) {
             // Scale displacement by mountain height and radius for proper terrain relief
             float relief = (finalHeight - uSeaLevel);
             displacement = relief * uMountainHeight * max(uRadius, 1.0) * 0.5;
        }
        
        // Apply displacement in Y (up) direction for flat plane
        vec3 displacedPosition = position;
        displacedPosition.y += displacement;
        vPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
    }
`;

export const flatTerrainFragmentShader = terrainFragmentShader;

export const gasPlanetFragmentShader = `
    ${glslNoise}

    uniform float uTime;
    uniform vec3 uSunDirection;
    uniform float uStripeSpeed;
    uniform float uStripeFrequency;
    uniform float uStripeSharpness;
    uniform float uTurbulence;
    
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    uniform vec3 uColor4;
    uniform vec3 uColor5;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying vec3 vLocalPos;
    varying float vLatitude;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uSunDirection);
        vec3 viewDir = normalize(cameraPosition - vPosition);
        
        // Normalize local position to get unit sphere coordinates
        vec3 pos = normalize(vLocalPos);
        
        // Get latitude for horizontal stripes (normalized to [0, 1])
        float lat = (pos.y + 1.0) * 0.5; // Normalize from [-1,1] to [0,1]
        
        // Calculate longitude using atan2 for proper wrapping (range: -π to π)
        // Then normalize to [0, 2π] for seamless wrapping
        float longitude = atan(pos.z, pos.x); // Range: [-π, π]
        float lonWrapped = longitude + 3.14159; // Range: [0, 2π]
        
        // Wrap time for seamless looping using fract
        float timeScale = uStripeSpeed * 0.5;
        float wrappedTime = fract(uTime * timeScale);
        
        // Use spherical coordinates for noise that naturally wrap
        // Convert to 3D coordinates on unit sphere for seamless noise sampling
        float latRad = (lat - 0.5) * 3.14159; // Latitude in radians: [-π/2, π/2]
        float cosLat = cos(latRad);
        
        // Create noise coordinates using spherical coordinates that wrap seamlessly
        // The key is to use cos/sin of longitude which naturally wraps
        vec3 noiseCoord = vec3(
            cos(lonWrapped) * cosLat * 2.0 + wrappedTime * 0.5,
            sin(lonWrapped) * cosLat * 2.0 + wrappedTime * 0.5,
            sin(latRad) * 2.0 + wrappedTime * 0.3
        );
        
        // Multi-octave noise for complex patterns - using wrapped coordinates
        float n1 = snoise(noiseCoord);
        float n2 = snoise(noiseCoord * 2.0 + vec3(100.0)) * 0.5;
        float n3 = snoise(noiseCoord * 4.0 + vec3(200.0)) * 0.25;
        float turbulenceNoise = (n1 + n2 + n3) * uTurbulence;
        
        // Base stripe pattern (horizontal bands) - seamless loop
        float stripePhase = (lat + wrappedTime) * uStripeFrequency * 2.0 * 3.14159;
        float stripe = sin(stripePhase + turbulenceNoise * 2.0);
        
        // Add vertical swirls using longitude-based noise - ensure seamless wrapping
        vec3 swirlCoord = vec3(
            cos(lonWrapped) * cosLat * 3.0 + wrappedTime * 0.3,
            sin(lonWrapped) * cosLat * 3.0 + wrappedTime * 0.3,
            sin(latRad) * 3.0 + wrappedTime * 0.2
        );
        float swirl = snoise(swirlCoord) * 0.3;
        
        // Combine stripe and swirl
        float pattern = stripe + swirl;
        
        // Sharpen the pattern
        pattern = pow(abs(pattern), 1.0 / uStripeSharpness) * sign(pattern);
        
        // Normalize to [0, 1] range
        pattern = pattern * 0.5 + 0.5;
        
        // Create multiple color bands using smooth transitions
        vec3 color;
        if (pattern < 0.2) {
            color = mix(uColor1, uColor2, pattern / 0.2);
        } else if (pattern < 0.4) {
            color = mix(uColor2, uColor3, (pattern - 0.2) / 0.2);
        } else if (pattern < 0.6) {
            color = mix(uColor3, uColor4, (pattern - 0.4) / 0.2);
        } else if (pattern < 0.8) {
            color = mix(uColor4, uColor5, (pattern - 0.6) / 0.2);
        } else {
            color = mix(uColor5, uColor1, (pattern - 0.8) / 0.2);
        }
        
        // Add subtle color variation from noise using wrapped coordinates
        // Use the same spherical coordinate approach for seamless wrapping
        vec3 colorNoiseCoord = vec3(
            cos(lonWrapped) * cosLat * 3.0 + uTime * 0.1,
            sin(lonWrapped) * cosLat * 3.0 + uTime * 0.1,
            sin(latRad) * 3.0 + uTime * 0.05
        );
        vec3 colorNoise = vec3(
            snoise(colorNoiseCoord),
            snoise(colorNoiseCoord + vec3(100.0)),
            snoise(colorNoiseCoord + vec3(200.0))
        ) * 0.1;
        color += colorNoise;
        
        // Lighting
        float NdotL = max(dot(normal, lightDir), 0.0);
        float lightIntensity = NdotL;
        
        // Ambient
        vec3 ambient = vec3(0.1);
        
        // Specular highlight for gas clouds
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
        float specularStrength = spec * 0.3;
        
        // Combine lighting
        vec3 finalColor = (ambient + lightIntensity) * color + vec3(specularStrength);
        
        // Add subtle rim glow
        float rim = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.0);
        finalColor += color * rim * 0.2;
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export const ringVertexShader = `
    varying vec2 vRingPosition;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    void main() {
        vRingPosition = position.xy;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const ringFragmentShader = `
    ${glslNoise}

    uniform float uTime;
    uniform vec3 uSunDirection;
    uniform vec3 uBaseColor;
    uniform float uInnerRadius;
    uniform float uOuterRadius;
    uniform float uOpacity;
    uniform float uNoiseScale;
    uniform float uNoiseStrength;
    uniform float uBrightness;
    uniform float uStyle;

    varying vec2 vRingPosition;
    varying vec3 vWorldPosition;
    varying vec3 vNormal;

    float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
    }

    void main() {
        float radius = length(vRingPosition);
        float width = max(uOuterRadius - uInnerRadius, 0.0001);
        float ringT = clamp((radius - uInnerRadius) / width, 0.0, 1.0);

        float edgeFeather = clamp(0.018 / width, 0.012, 0.12);
        float innerFade = smoothstep(0.0, edgeFeather, ringT);
        float outerFade = 1.0 - smoothstep(1.0 - edgeFeather, 1.0, ringT);
        float edgeFade = innerFade * outerFade;

        if (edgeFade <= 0.001) discard;

        float angle = atan(vRingPosition.y, vRingPosition.x);
        vec2 polar = vec2(ringT * max(uNoiseScale, 0.2), angle * 0.15915494);
        vec3 radialCoord = vec3(
            radius * max(uNoiseScale, 0.2),
            cos(angle) * max(uNoiseScale, 0.2),
            sin(angle) * max(uNoiseScale, 0.2)
        );

        vec3 warped = radialCoord + domainWarp(radialCoord + vec3(uTime * 0.006, 0.0, 0.0), 0.12, 1.25, 0.28);
        float strata = sin((ringT * 56.0 + snoise(warped * 0.32) * 0.85) * 3.14159);
        strata = strata * 0.5 + 0.5;

        float ridges = fbmRidged(warped * 0.82, 4, 0.46, 1.85);
        float slabNoise = fbm(warped * 2.2 + vec3(19.0, 47.0, 83.0), 3, 0.48, 1.75) * 0.5 + 0.5;
        float dust = fbm(warped * 4.2 + vec3(31.0, 11.0, 67.0), 2, 0.42, 1.9) * 0.5 + 0.5;
        float gravel = pow(hash21(floor(vec2(radius * 210.0, angle * 72.0))), 9.0);
        float clumps = smoothstep(0.46, 0.82, ridges) * mix(0.72, 1.0, slabNoise);
        float fineBands = smoothstep(0.28, 0.76, strata);

        float styleMix = clamp(uStyle, 0.0, 1.0);
        float rockyPattern = mix(
            fineBands * 0.58 + clumps * 0.34 + dust * 0.12,
            ridges * 0.52 + clumps * 0.36 + gravel * 0.18,
            styleMix
        );
        rockyPattern = mix(0.56, clamp(rockyPattern, 0.0, 1.18), clamp(uNoiseStrength * 0.72, 0.0, 0.85));

        float laneGap = smoothstep(0.01, 0.0, abs(fract(ringT * 22.0 + snoise(warped * 0.45) * 0.035) - 0.5) - 0.485);
        float fracturedEdge = smoothstep(0.18, 0.78, slabNoise + ridges * 0.28);
        float alpha = uOpacity * edgeFade * mix(0.72, 1.0, rockyPattern) * mix(0.9, 1.0, fracturedEdge);
        alpha *= 1.0 - laneGap * 0.38;

        if (alpha <= 0.015) discard;

        vec3 base = uBaseColor;
        vec3 coolShadow = base * vec3(0.46, 0.48, 0.52);
        vec3 mineral = mix(base, vec3(0.70, 0.68, 0.62), 0.26 + slabNoise * 0.18);
        mineral = mix(mineral, base * vec3(0.82, 0.78, 0.72), smoothstep(0.55, 0.95, strata) * 0.25);
        vec3 highlight = mix(mineral, vec3(0.92, 0.9, 0.84), 0.10 + gravel * 0.22);
        vec3 color = mix(coolShadow, highlight, clamp(rockyPattern, 0.0, 1.0));

        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uSunDirection);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float NdotL = abs(dot(normal, lightDir));
        float diffuse = 0.28 + NdotL * 0.82;
        float rim = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
        float forwardScatter = pow(max(dot(viewDir, lightDir), 0.0), 4.0) * 0.18;

        color *= diffuse * uBrightness;
        color += base * rim * 0.18 * uBrightness;
        color += highlight * forwardScatter * uBrightness;

        gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
    }
`;

export const spaceBackgroundVertexShader = `
    varying vec3 vWorldPosition;

    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const spaceBackgroundFragmentShader = `
    ${glslNoise}

    uniform float uTime;
    uniform float uNebulaIntensity;
    uniform float uStarDensity;
    uniform float uGradientIntensity;
    uniform float uSkyResolution;
    uniform vec3 uBaseColor;
    uniform vec3 uNebulaColor1;
    uniform vec3 uNebulaColor2;

    varying vec3 vWorldPosition;

    float hash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
    }

    void main() {
        vec3 dir = normalize(vWorldPosition);
        float time = uTime * 0.02;

        float gradient = smoothstep(-0.4, 0.75, dir.y);
        vec3 color = uBaseColor + gradient * uGradientIntensity * vec3(0.05, 0.08, 0.13);

        vec3 coord = dir * 2.2 + vec3(time * 0.12, time * 0.08, -time * 0.06);
        vec3 warped = domainWarp(coord, 0.45, 1.2, 0.27);
        // Reduce octaves based on sky resolution (5 octaves at 1.0, 3 at 0.5, 2 at 0.25)
        int nebulaOctaves = int(mix(2.0, 5.0, clamp(uSkyResolution, 0.0, 1.0)));
        float nebula = fbm(coord + warped, nebulaOctaves, 0.55, 2.05);
        nebula = clamp((nebula + 1.0) * 0.5, 0.0, 1.0);
        nebula = pow(nebula, 2.4);
        float nebulaMask = smoothstep(0.15, 0.8, nebula);
        vec3 nebulaColor = mix(
            uNebulaColor1,
            uNebulaColor2,
            clamp(0.5 + 0.5 * sin(dir.x * 4.5 + dir.y * 2.6 + time * 0.18), 0.0, 1.0)
        );
        vec3 desaturatedNebula = mix(nebulaColor, vec3(dot(nebulaColor, vec3(0.299, 0.587, 0.114))), 0.35);
        color = mix(color, desaturatedNebula, nebulaMask * uNebulaIntensity * 0.4);
        color = mix(color, uBaseColor, 0.48);

        vec3 starCoord = dir * 120.0;
        float baseStar = 1.0 - abs(snoise(starCoord + vec3(time * 0.55, 0.0, 0.0)));
        float starMask = smoothstep(0.82, 0.97, baseStar);
        float linePattern = pow(starMask, 7.0);
        float sparkle = sin(uTime * 0.1 + dir.x * 24.0 + dir.y * 18.0 + dir.z * 12.0);
        float twinkle = mix(0.85, 1.05, clamp(sparkle * 0.5 + 0.5, 0.0, 1.0));
        float darkNoise = linePattern * twinkle * uStarDensity * 0.6;

        float microSeed = hash3(starCoord + vec3(time * 0.18, -time * 0.12, time * 0.09));
        darkNoise += pow(smoothstep(0.92, 1.0, microSeed), 5.0) * uStarDensity * 0.15;

        float noiseMix = clamp(darkNoise, 0.0, 0.95);
        color = mix(color, vec3(0.0), noiseMix);
        color += nebula * 0.0025;

        vec3 finalColor = clamp(color, 0.0, 0.6);
        finalColor = mix(finalColor, vec3(dot(finalColor, vec3(0.2126, 0.7152, 0.0722))), 0.24);
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export const sunVertexShader = `
    ${glslNoise}

    uniform float uTime;
    uniform float uNoiseScale;
    uniform float uNoiseStrength;
    uniform float uPulseAmplitude;
    uniform float uPulseSpeed;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vNoise;

    void main() {
        vec3 pos = position;
        float pulse = sin(uTime * uPulseSpeed) * 0.5 + 0.5;
        float noiseValue = snoise(pos * uNoiseScale + vec3(uTime * 0.4, uTime * 0.31, -uTime * 0.27));
        float displacement = noiseValue * uNoiseStrength * (0.6 + pulse * uPulseAmplitude);
        vec3 displaced = pos + normal * displacement;

        vNoise = noiseValue;
        vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
        vWorldPosition = worldPosition.xyz;
        vNormal = normalize(normalMatrix * normal);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
`;

export const sunFragmentShader = `
    ${glslNoise}

    uniform float uTime;
    uniform float uBrightness;
    uniform float uHotspotStrength;
    uniform float uPulseSpeed;
    uniform vec3 uBaseColor;
    uniform vec3 uHighlightColor;
    uniform vec3 uRimColor;

    varying vec3 vWorldPosition;
    varying vec3 vNormal;
    varying float vNoise;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);

        vec3 dir = normalize(vWorldPosition);
        vec3 coord = dir * 3.2 + vec3(uTime * 0.12, uTime * 0.07, -uTime * 0.05);
        vec3 warped = domainWarp(coord, 0.45, 2.1, 0.4);
        float flow = fbm(coord + warped, 4, 0.52, 2.1);
        flow = clamp((flow + 1.0) * 0.5, 0.0, 1.0);

        float noiseFactor = clamp(vNoise * 0.5 + 0.5, 0.0, 1.0);
        float heat = mix(noiseFactor, flow, 0.6);

        vec3 surfaceColor = mix(uBaseColor, uHighlightColor, pow(heat, 1.3));

        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
        vec3 rim = uRimColor * (0.6 + heat * 0.4) * fresnel;

        float hotspot = pow(max(dot(normal, normalize(viewDir + normal * 0.35)), 0.0), 12.0);
        surfaceColor += uHighlightColor * hotspot * uHotspotStrength;

        float pulse = sin(uTime * uPulseSpeed * 0.6 + heat * 3.14159) * 0.5 + 0.5;
        surfaceColor *= mix(0.9, 1.15, pulse);

        vec3 finalColor = (surfaceColor + rim) * uBrightness;
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

