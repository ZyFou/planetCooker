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
`;

export const terrainVertexShader = `
    ${glslNoise}

    uniform float uTime;
    uniform float uContinentSize;
    uniform float uMountainHeight;
    uniform float uRoughness;
    uniform float uDetail;
    uniform float uSeaLevel;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vHeight;
    varying float vLatitude;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        // Pass world position for consistent noise regardless of rotation if desired, 
        // but local 'position' works best for a planet that rotates as an object.
        vec3 pos = position; 

        // Base continent shape (low frequency)
        float h = fbm(pos * uContinentSize, 8, uRoughness, uDetail);
        
        // Ridged mountain noise (adds detail to landmasses)
        float hm = fbm(pos * uContinentSize * 4.0, 4, uRoughness, uDetail * 1.5);
        hm = 1.0 - abs(hm); // ridges
        hm = pow(hm, 3.0);
        
        // Combine and normalize roughly to [0, 1]
        float finalHeight = (h * 0.6 + hm * 0.4) + 0.5;

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
        // Standard Diffuse
        float NdotL = max(dot(normal, lightDir), 0.0);
        float lightIntensity = NdotL;
        
        // Ambient
        vec3 ambient = vec3(0.02);

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
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const atmosphereFragmentShader = `
    uniform vec3 uSunDirection;
    uniform vec3 uAtmosphereColor;
    uniform float uAtmosphereDensity;

    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
        // Rim lighting effect (Fresnel-ish)
        float viewDotNormal = dot(vViewDir, vNormal);
        // Invert because we are looking at it from outside
        float intensity = pow(0.6 - viewDotNormal, 2.5); 

        // Day/Night fading for atmosphere
        float lightIntensity = max(dot(vNormal, uSunDirection), 0.0);
        
        vec3 atmosphere = uAtmosphereColor * intensity * uAtmosphereDensity;
        
        // Boost it slightly on the sunlit side
        atmosphere *= (0.3 + 0.7 * smoothstep(-0.5, 1.0, lightIntensity));

        gl_FragColor = vec4(atmosphere, atmosphere.r + atmosphere.g + atmosphere.b);
    }
`;

export const gasPlanetVertexShader = `
    ${glslNoise}

    uniform float uTime;
    uniform float uTurbulence;
    uniform float uGasPlanetSize;

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
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition * uGasPlanetSize, 1.0);
    }
`;

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
        
        // Get latitude for horizontal stripes (normalized to [0, 1])
        float lat = (vLatitude + 1.0) * 0.5; // Normalize from [-1,1] to [0,1]
        
        // Calculate longitude for seamless wrapping around the planet
        float longitude = atan(vLocalPos.z, vLocalPos.x) / 3.14159; // [-1, 1]
        longitude = (longitude + 1.0) * 0.5; // Normalize to [0, 1]
        
        // Wrap time for seamless looping using fract
        // Scale time so one full cycle = 1.0
        float timeScale = uStripeSpeed * 0.5;
        float wrappedTime = fract(uTime * timeScale);
        
        // Create animated stripe pattern with seamless longitude wrapping
        // Use longitude that wraps from 0 to 2π for seamless noise
        float lonWrapped = longitude * 2.0 * 3.14159; // 0 to 2π
        
        // Create noise coordinates that wrap seamlessly around longitude
        vec3 noiseCoord = vec3(
            lonWrapped + wrappedTime * 2.0,  // Wraps seamlessly at 2π
            lat * uStripeFrequency * 2.0 + wrappedTime * uStripeFrequency * 2.0,
            wrappedTime * 5.0  // Time component
        );
        
        // Multi-octave noise for complex patterns - all using wrapped longitude
        float n1 = snoise(noiseCoord);
        float n2 = snoise(noiseCoord * 2.0 + vec3(100.0)) * 0.5;
        float n3 = snoise(noiseCoord * 4.0 + vec3(200.0)) * 0.25;
        float turbulenceNoise = (n1 + n2 + n3) * uTurbulence;
        
        // Base stripe pattern (horizontal bands) - seamless loop
        // sin() naturally repeats every 2π, so the pattern will loop seamlessly
        float stripePhase = (lat + wrappedTime) * uStripeFrequency * 2.0 * 3.14159;
        float stripe = sin(stripePhase + turbulenceNoise * 2.0);
        
        // Add vertical swirls using longitude-based noise - ensure seamless wrapping
        vec3 swirlCoord = vec3(
            lonWrapped + wrappedTime * 1.0,  // Wraps seamlessly
            lat * 3.0,
            wrappedTime * 5.0
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
        
        // Add subtle color variation from noise
        vec3 colorNoise = vec3(
            snoise(vLocalPos * 3.0 + vec3(0.0, uTime * 0.1, 0.0)),
            snoise(vLocalPos * 3.0 + vec3(100.0, uTime * 0.1, 0.0)),
            snoise(vLocalPos * 3.0 + vec3(200.0, uTime * 0.1, 0.0))
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

