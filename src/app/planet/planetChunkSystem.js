import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { SeededRNG } from "../utils.js";

/**
 * Représente un chunk individuel de la surface de la planète
 */
export class PlanetChunk {
    constructor(chunkId, vertices, lodLevel, geometry, material, parentGroup) {
        this.chunkId = chunkId;
        this.vertices = vertices; // Les vertices du chunk dans l'espace icosaèdre
        this.lodLevel = lodLevel;
        this.mesh = null;
        this.geometry = geometry;
        this.material = material;
        this.parentGroup = parentGroup;
        this.lastCameraDistance = Infinity;
        this.isVisible = true;
        this.boundingSphere = null;
    }

    /**
     * Met à jour le niveau de LOD du chunk basé sur la distance de la caméra
     */
    updateLOD(cameraPosition, planetRadius, lodConfig) {
        if (!this.mesh || !this.boundingSphere) return;

        const worldPos = this.mesh.getWorldPosition(new THREE.Vector3());
        const distance = cameraPosition.distanceTo(worldPos);
        this.lastCameraDistance = distance;

        // Normaliser la distance par rapport à la taille de la planète
        const normalizedDistance = distance / (planetRadius * 10);
        
        // Déterminer le niveau de LOD optimal
        let targetLOD = 0;
        if (normalizedDistance < 0.5) {
            targetLOD = 8; // Très haut niveau de détail
        } else if (normalizedDistance < 1.0) {
            targetLOD = 7;
        } else if (normalizedDistance < 2.0) {
            targetLOD = 6;
        } else if (normalizedDistance < 4.0) {
            targetLOD = 5;
        } else if (normalizedDistance < 8.0) {
            targetLOD = 4;
        } else if (normalizedDistance < 16.0) {
            targetLOD = 3;
        } else if (normalizedDistance < 32.0) {
            targetLOD = 2;
        } else {
            targetLOD = 1;
        }

        this.lodLevel = Math.max(0, Math.min(8, targetLOD));
    }

    /**
     * Crée ou met à jour le mesh du chunk
     */
    createMesh() {
        if (this.mesh) {
            // Mettre à jour la géométrie existante
            if (this.geometry) {
                if (this.mesh.geometry) {
                    this.mesh.geometry.dispose();
                }
                this.mesh.geometry = this.geometry;
                this.mesh.material = this.material;
            }
        } else {
            // Créer un nouveau mesh
            this.mesh = new THREE.Mesh(this.geometry, this.material);
            this.mesh.castShadow = true;
            this.mesh.receiveShadow = true;
            this.mesh.userData.chunkId = this.chunkId;
            this.mesh.userData.isChunk = true;
            this.mesh.frustumCulled = true; // Activer le frustum culling
            
            if (this.geometry) {
                this.geometry.computeBoundingSphere();
                this.boundingSphere = this.geometry.boundingSphere;
            }
            
            if (this.parentGroup) {
                this.parentGroup.add(this.mesh);
            }
        }

        return this.mesh;
    }

    /**
     * Supprime le mesh et libère les ressources
     */
    dispose() {
        if (this.mesh) {
            if (this.parentGroup) {
                this.parentGroup.remove(this.mesh);
            }
            if (this.mesh.geometry) {
                this.mesh.geometry.dispose();
            }
            if (this.mesh.material && this.mesh.material !== this.material) {
                this.mesh.material.dispose();
            }
            this.mesh = null;
        }
        if (this.geometry && this.geometry !== this.mesh?.geometry) {
            this.geometry.dispose();
        }
    }
}

/**
 * Système de gestion des chunks pour la surface de la planète
 */
export class PlanetChunkSystem {
    constructor(planetRadius, params, visualSettings, generators, profile, offsets, material) {
        this.planetRadius = planetRadius;
        this.params = params;
        this.visualSettings = visualSettings;
        this.generators = generators;
        this.profile = profile;
        this.offsets = offsets;
        this.material = material;

        this.chunks = new Map();
        this.chunkGroup = new THREE.Group();
        this.chunkGroup.name = "PlanetChunks";

        // Configuration du nombre de chunks par niveau de subdivision
        this.chunkSubdivisionLevel = 0; // Nombre de subdivisions de base (augmentera avec le LOD) - Commencer à 0 pour moins de chunks
        this.maxChunksPerFace = 4; // Maximum de chunks par face de l'icosaèdre
        
        // Cache pour les géométries générées par niveau de LOD
        this.geometryCache = new Map();
        
        // Générateur de couleurs (sera défini par Planet)
        this.colorGenerator = null;
    }

    /**
     * Génère tous les chunks de la planète
     */
    generateChunks() {
        // Nettoyer les chunks existants
        this.dispose();

        // Créer un icosaèdre de base
        const baseGeometry = new THREE.IcosahedronGeometry(1, 0);
        const positions = baseGeometry.getAttribute("position");
        const indexAttribute = baseGeometry.getIndex();
        
        // Si la géométrie n'a pas d'index, on doit la créer ou traiter différemment
        let indices;
        if (indexAttribute) {
            indices = indexAttribute.array;
        } else {
            // Si pas d'index, créer manuellement les indices (triangle pour chaque groupe de 3 vertices)
            indices = new Uint16Array(positions.count);
            for (let i = 0; i < positions.count; i++) {
                indices[i] = i;
            }
        }

        // Créer les chunks pour chaque face de l'icosaèdre
        let chunkId = 0;
        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i];
            const i1 = indices[i + 1];
            const i2 = indices[i + 2];

            const v0 = new THREE.Vector3(
                positions.getX(i0),
                positions.getY(i0),
                positions.getZ(i0)
            ).normalize();
            const v1 = new THREE.Vector3(
                positions.getX(i1),
                positions.getY(i1),
                positions.getZ(i1)
            ).normalize();
            const v2 = new THREE.Vector3(
                positions.getX(i2),
                positions.getY(i2),
                positions.getZ(i2)
            ).normalize();

            // Subdiviser cette face en chunks
            const faceChunks = this.subdivideFace(v0, v1, v2, this.chunkSubdivisionLevel);
            
            for (const vertices of faceChunks) {
                const chunk = new PlanetChunk(
                    `chunk_${chunkId++}`,
                    vertices,
                    0, // Niveau de LOD initial
                    null, // Géométrie sera générée à la demande
                    this.material,
                    this.chunkGroup
                );
                this.chunks.set(chunk.chunkId, chunk);
            }
        }

        // Libérer la géométrie de base
        baseGeometry.dispose();
    }

    /**
     * Subdivise une face triangulaire en plusieurs chunks
     */
    subdivideFace(v0, v1, v2, subdivisionLevel) {
        const chunks = [];
        
        if (subdivisionLevel === 0) {
            // Pas de subdivision, retourner la face entière
            return [[v0, v1, v2]];
        }

        // Calculer les points médians
        const mid01 = new THREE.Vector3().addVectors(v0, v1).normalize();
        const mid12 = new THREE.Vector3().addVectors(v1, v2).normalize();
        const mid20 = new THREE.Vector3().addVectors(v2, v0).normalize();

        if (subdivisionLevel === 1) {
            // Une subdivision crée 4 triangles
            chunks.push([v0, mid01, mid20]);
            chunks.push([v1, mid12, mid01]);
            chunks.push([v2, mid20, mid12]);
            chunks.push([mid01, mid12, mid20]);
        } else {
            // Subdivision récursive
            const subChunks0 = this.subdivideFace(v0, mid01, mid20, subdivisionLevel - 1);
            const subChunks1 = this.subdivideFace(v1, mid12, mid01, subdivisionLevel - 1);
            const subChunks2 = this.subdivideFace(v2, mid20, mid12, subdivisionLevel - 1);
            const subChunks3 = this.subdivideFace(mid01, mid12, mid20, subdivisionLevel - 1);
            
            chunks.push(...subChunks0, ...subChunks1, ...subChunks2, ...subChunks3);
        }

        return chunks;
    }

    /**
     * Génère la géométrie pour un chunk donné avec un niveau de LOD spécifique
     */
    generateChunkGeometry(chunk, lodLevel) {
        const cacheKey = `${chunk.chunkId}_lod${lodLevel}`;
        
        // Vérifier le cache
        if (this.geometryCache.has(cacheKey)) {
            // Toujours cloner pour éviter le partage d'objets
            return this.geometryCache.get(cacheKey).clone();
        }

        // Calculer le niveau de détail basé sur le LOD
        // LOD 0 = résolution minimale, LOD 8 = résolution maximale
        // Réduire la résolution de base pour moins de détail initial
        const detail = Math.max(0, Math.min(6, lodLevel)); // Réduire de 8 à 6 pour moins de détail
        
        // Créer une géométrie basée sur le triangle du chunk
        const geometry = this.buildChunkGeometry(chunk.vertices, detail);
        
        // Mettre en cache (cloner avant de mettre en cache pour éviter les modifications)
        this.geometryCache.set(cacheKey, geometry.clone());
        
        // Retourner un clone pour ce chunk spécifique
        return geometry.clone();
    }

    /**
     * Construit la géométrie d'un chunk avec déformation de terrain
     */
    buildChunkGeometry(vertices, detail) {
        // Créer une géométrie triangulaire subdivisée
        const positions = [];
        const uvs = [];
        const colors = [];
        const indices = [];

        // Fonction pour interpoler un point sur la surface du triangle (coordonnées barycentriques)
        const interpolate = (v0, v1, v2, u, v, w) => {
            const result = new THREE.Vector3();
            result.addScaledVector(v0, w);
            result.addScaledVector(v1, u);
            result.addScaledVector(v2, v);
            return result.normalize();
        };

        // Générer les points de la grille triangulaire
        // Le détail détermine le nombre de subdivisions
        // Réduire la résolution de base pour moins de vertices
        const resolution = Math.max(1, Math.floor(Math.pow(1.8, detail))); // Réduire la croissance de la résolution

        // Générer les vertices avec subdivision barycentrique
        // Nous générons les vertices de manière séquentielle, donc pas besoin de vertexMap
        
        // Générer les vertices en parcourant le triangle de manière barycentrique
        for (let i = 0; i <= resolution; i++) {
            for (let j = 0; j <= resolution - i; j++) {
                const k = resolution - i - j;
                const u = i / resolution;
                const v = j / resolution;
                const w = k / resolution;

                const pos = interpolate(vertices[0], vertices[1], vertices[2], u, v, w);
                
                // Appliquer la déformation du terrain (même logique que _buildRockyGeometry)
                const normal = pos.clone().normalize();
                let sampleDir = normal.clone();

                if (this.profile.warpStrength > 0) {
                    const warpAmount = this.profile.warpStrength * 0.35;
                    const fx = this.profile.warpFrequency;
                    const offset = this.profile.warpOffset;
                    const { warpNoiseX, warpNoiseY, warpNoiseZ } = this.generators;
                    
                    const warpVec = new THREE.Vector3(
                        warpNoiseX(normal.x * fx + offset.x, normal.y * fx + offset.y, normal.z * fx + offset.z),
                        warpNoiseY(normal.x * fx + offset.y, normal.y * fx + offset.z, normal.z * fx + offset.x),
                        warpNoiseZ(normal.x * fx + offset.z, normal.y * fx + offset.x, normal.z * fx + offset.y)
                    );
                    sampleDir.addScaledVector(warpVec, warpAmount).normalize();
                }

                let amplitude = 1;
                let frequency = this.params.noiseFrequency;
                let totalAmplitude = 0;
                let sum = 0;
                let ridgeSum = 0;
                let billowSum = 0;

                const { baseNoise, ridgeNoise } = this.generators;

                for (let layer = 0; layer < this.params.noiseLayers; layer += 1) {
                    const offset = this.offsets[layer];
                    const sx = sampleDir.x * frequency + offset.x;
                    const sy = sampleDir.y * frequency + offset.y;
                    const sz = sampleDir.z * frequency + offset.z;

                    const sample = baseNoise(sx, sy, sz);
                    sum += sample * amplitude;

                    const ridgeSample = ridgeNoise(
                        sx * this.profile.ridgeFrequency,
                        sy * this.profile.ridgeFrequency,
                        sz * this.profile.ridgeFrequency
                    );
                    ridgeSum += (1 - Math.abs(ridgeSample)) * amplitude;
                    billowSum += Math.pow(Math.abs(sample), this.profile.ruggedPower) * amplitude;

                    totalAmplitude += amplitude;
                    amplitude *= this.params.persistence;
                    frequency *= this.params.lacunarity;
                }

                if (totalAmplitude > 0) {
                    sum /= totalAmplitude;
                    ridgeSum /= totalAmplitude;
                    billowSum /= totalAmplitude;
                }

                let elevation = sum;
                elevation = THREE.MathUtils.lerp(elevation, ridgeSum * 2 - 1, this.profile.ridgeWeight);
                elevation = THREE.MathUtils.lerp(elevation, billowSum * 2 - 1, this.profile.billowWeight);
                elevation = Math.sign(elevation) * Math.pow(Math.abs(elevation), this.profile.sharpness);

                let normalized = elevation * 0.5 + 0.5;
                normalized = Math.pow(THREE.MathUtils.clamp(normalized, 0, 1), this.profile.plateauPower);

                if (this.profile.striationStrength > 0) {
                    const striation = Math.sin((sampleDir.x + sampleDir.z) * this.profile.striationFrequency + this.profile.striationPhase);
                    normalized += striation * this.profile.striationStrength;
                }

                if (this.profile.equatorLift || this.profile.poleDrop) {
                    const latitude = Math.abs(sampleDir.y);
                    normalized += (1 - latitude) * this.profile.equatorLift;
                    normalized -= latitude * this.profile.poleDrop;
                }

                const { craterNoise } = this.generators;
                const craterSample = craterNoise(
                    sampleDir.x * this.profile.craterFrequency + this.profile.craterOffset.x,
                    sampleDir.y * this.profile.craterFrequency + this.profile.craterOffset.y,
                    sampleDir.z * this.profile.craterFrequency + this.profile.craterOffset.z
                );
                const craterValue = (craterSample + 1) * 0.5;
                if (craterValue > this.profile.craterThreshold) {
                    const craterT = (craterValue - this.profile.craterThreshold) / Math.max(1e-6, 1 - this.profile.craterThreshold);
                    normalized -= Math.pow(craterT, this.profile.craterSharpness) * this.profile.craterDepth;
                }

                normalized = THREE.MathUtils.clamp(normalized, 0, 1);

                const displacement = (normalized - this.params.oceanLevel) * this.params.noiseAmplitude;
                const finalRadius = this.planetRadius + displacement;
                
                const finalPos = normal.clone().multiplyScalar(finalRadius);
                
                // Ajouter directement le vertex (pas besoin de Map car ordre séquentiel)
                positions.push(finalPos.x, finalPos.y, finalPos.z);

                // UV mapping
                const uv_u = Math.atan2(finalPos.x, finalPos.z) / (2 * Math.PI) + 0.5;
                const uv_v = Math.asin(finalPos.y / finalRadius) / Math.PI + 0.5;
                uvs.push(uv_u, uv_v);

                // Générer la couleur en utilisant le générateur de couleurs si disponible
                let colorValue = new THREE.Color(0.5, 0.5, 0.5);
                if (this.colorGenerator) {
                    const unitVertex = finalPos.clone().normalize();
                    const colorResult = this.colorGenerator(normalized, finalRadius, unitVertex);
                    // sampleColor retourne un THREE.Color
                    if (colorResult instanceof THREE.Color) {
                        colorValue = colorResult;
                    } else if (colorResult && typeof colorResult === 'object' && 'r' in colorResult) {
                        colorValue.setRGB(colorResult.r, colorResult.g, colorResult.b);
                    }
                }
                colors.push(colorValue.r, colorValue.g, colorValue.b);
            }
        }

        // Générer les indices pour les triangles
        // Les vertices sont générés dans l'ordre: pour chaque ligne i, de j=0 à j=resolution-i
        // Calculer l'index de base pour chaque ligne
        let vertexCount = 0;
        const rowStarts = [];
        for (let i = 0; i <= resolution; i++) {
            rowStarts.push(vertexCount);
            vertexCount += (resolution - i + 1);
        }

        // Générer les triangles
        for (let i = 0; i < resolution; i++) {
            const rowStart = rowStarts[i];
            const nextRowStart = rowStarts[i + 1];
            
            for (let j = 0; j <= resolution - i - 1; j++) {
                const v0 = rowStart + j;
                const v1 = rowStart + j + 1;
                
                // Premier triangle (pointant vers le haut)
                if (j <= resolution - i - 1) {
                    const v2 = nextRowStart + j;
                    indices.push(v0, v2, v1);
                    
                    // Deuxième triangle (pointant vers le bas) si on n'est pas au bord
                    if (j < resolution - i - 1) {
                        const v3 = nextRowStart + j + 1;
                        indices.push(v1, v2, v3);
                    }
                }
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        return geometry;
    }

    /**
     * Met à jour tous les chunks en fonction de la position de la caméra
     */
    update(cameraPosition) {
        if (!cameraPosition) return;

        // Limiter le nombre de mises à jour par frame pour éviter les blocages
        // Commencer avec un nombre plus faible et augmenter progressivement
        const maxUpdatesPerFrame = 2; // Réduire à 2 pour un chargement plus progressif
        let updatesThisFrame = 0;

        for (const [chunkId, chunk] of this.chunks) {
            // Mettre à jour le LOD du chunk
            const previousLOD = chunk.lodLevel;
            chunk.updateLOD(cameraPosition, this.planetRadius, {});

            // Générer ou mettre à jour la géométrie si le LOD a changé
            if (!chunk.geometry || chunk.lodLevel !== chunk.mesh?.userData?.lastLOD) {
                // Limiter les mises à jour pour cette frame
                if (updatesThisFrame >= maxUpdatesPerFrame) {
                    // Reporter à la prochaine frame
                    continue;
                }

                chunk.geometry = this.generateChunkGeometry(chunk, chunk.lodLevel);
                
                if (chunk.mesh) {
                    if (chunk.mesh.geometry && chunk.mesh.geometry !== chunk.geometry) {
                        chunk.mesh.geometry.dispose();
                    }
                    chunk.mesh.geometry = chunk.geometry;
                    chunk.mesh.userData.lastLOD = chunk.lodLevel;
                    
                    // Mettre à jour le bounding sphere pour le frustum culling
                    chunk.geometry.computeBoundingSphere();
                    chunk.boundingSphere = chunk.geometry.boundingSphere;
                } else {
                    chunk.createMesh();
                }
                
                updatesThisFrame++;
            } else if (!chunk.mesh) {
                // Créer le mesh si nécessaire
                if (updatesThisFrame < maxUpdatesPerFrame) {
                    chunk.createMesh();
                    updatesThisFrame++;
                }
            }

            // Le frustum culling est géré automatiquement par Three.js
            // grâce à frustumCulled = true sur le mesh
        }
    }

    /**
     * Définit la fonction de génération de couleur pour les chunks
     */
    setColorGenerator(colorGenerator) {
        this.colorGenerator = colorGenerator;
    }

    /**
     * Libère toutes les ressources
     */
    dispose() {
        for (const chunk of this.chunks.values()) {
            chunk.dispose();
        }
        this.chunks.clear();

        // Nettoyer le cache de géométries
        for (const geometry of this.geometryCache.values()) {
            geometry.dispose();
        }
        this.geometryCache.clear();
    }

    /**
     * Retourne le groupe contenant tous les chunks
     */
    getGroup() {
        return this.chunkGroup;
    }
}

