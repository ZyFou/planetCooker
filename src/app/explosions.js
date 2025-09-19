// Explosion and destruction animation system
import * as THREE from "three";

export class ExplosionSystem {
  constructor(scene, planetMesh) {
    this.scene = scene;
    this.planetMesh = planetMesh;
    this.explosions = [];
    this.particleGeometry = new THREE.BufferGeometry();
    this.particleMaterial = new THREE.PointsMaterial({
      size: 0.1,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      vertexColors: true
    });
    this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.scene.add(this.particleSystem);
    
    // Voxel destruction data
    this.destructionData = new Map(); // position -> destruction progress
    this.maxDestructionTime = 2.0; // seconds
  }

  // Create an explosion at the given position
  createExplosion(position, intensity = 1.0, color = 0xffaa66) {
    const explosion = {
      position: position.clone(),
      intensity,
      color: new THREE.Color(color),
      time: 0,
      lifetime: 2.0,
      particles: [],
      active: true
    };

    // Create particle burst
    const particleCount = Math.floor(50 * intensity);
    for (let i = 0; i < particleCount; i++) {
      const particle = this.createParticle(explosion);
      explosion.particles.push(particle);
    }

    this.explosions.push(explosion);

    // Start voxel destruction
    this.startVoxelDestruction(position, intensity);
  }

  createParticle(explosion) {
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    ).normalize().multiplyScalar(Math.random() * 3 + 1);

    return {
      position: explosion.position.clone(),
      velocity,
      life: 1.0,
      maxLife: 1.0 + Math.random() * 0.5,
      size: Math.random() * 0.2 + 0.1,
      color: explosion.color.clone().lerp(
        new THREE.Color(0xff0000),
        Math.random() * 0.3
      )
    };
  }

  // Start voxel destruction at impact point
  startVoxelDestruction(position, intensity) {
    const radius = intensity * 0.5;
    const positions = this.getVoxelPositionsInRadius(position, radius);
    
    positions.forEach(pos => {
      this.destructionData.set(pos, {
        startTime: performance.now() / 1000,
        intensity: intensity * (1 - pos.distanceTo(position) / radius),
        originalPosition: pos.clone()
      });
    });
  }

  // Get voxel positions within destruction radius
  getVoxelPositionsInRadius(center, radius) {
    const positions = [];
    const voxelSize = 0.1;
    const steps = Math.ceil(radius / voxelSize);
    
    for (let x = -steps; x <= steps; x++) {
      for (let y = -steps; y <= steps; y++) {
        for (let z = -steps; z <= steps; z++) {
          const pos = new THREE.Vector3(
            center.x + x * voxelSize,
            center.y + y * voxelSize,
            center.z + z * voxelSize
          );
          
          if (pos.distanceTo(center) <= radius) {
            positions.push(pos);
          }
        }
      }
    }
    
    return positions;
  }

  // Update explosion system
  update(deltaTime) {
    this.updateExplosions(deltaTime);
    this.updateParticles(deltaTime);
    this.updateVoxelDestruction(deltaTime);
  }

  updateExplosions(deltaTime) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.time += deltaTime;
      
      if (explosion.time >= explosion.lifetime) {
        this.explosions.splice(i, 1);
      }
    }
  }

  updateParticles(deltaTime) {
    const positions = [];
    const colors = [];
    const sizes = [];
    
    this.explosions.forEach(explosion => {
      explosion.particles.forEach(particle => {
        // Update particle physics
        particle.position.add(
          particle.velocity.clone().multiplyScalar(deltaTime)
        );
        
        // Apply gravity
        particle.velocity.y -= 9.81 * deltaTime;
        
        // Update life
        particle.life -= deltaTime / particle.maxLife;
        
        if (particle.life > 0) {
          positions.push(particle.position.x, particle.position.y, particle.position.z);
          colors.push(particle.color.r, particle.color.g, particle.color.b);
          sizes.push(particle.size * particle.life);
        }
      });
    });
    
    // Update particle system
    if (positions.length > 0) {
      this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      this.particleGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
      this.particleGeometry.attributes.position.needsUpdate = true;
      this.particleGeometry.attributes.color.needsUpdate = true;
      this.particleGeometry.attributes.size.needsUpdate = true;
    } else {
      this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      this.particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
      this.particleGeometry.setAttribute('size', new THREE.Float32BufferAttribute([], 1));
    }
  }

  updateVoxelDestruction(deltaTime) {
    const currentTime = performance.now() / 1000;
    const positions = [];
    const colors = [];
    const sizes = [];
    
    for (const [pos, data] of this.destructionData) {
      const elapsed = currentTime - data.startTime;
      const progress = Math.min(elapsed / this.maxDestructionTime, 1.0);
      
      if (progress >= 1.0) {
        this.destructionData.delete(pos);
        continue;
      }
      
      // Animate voxel destruction
      const destructionOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ).multiplyScalar(progress * data.intensity);
      
      const currentPos = data.originalPosition.clone().add(destructionOffset);
      positions.push(currentPos.x, currentPos.y, currentPos.z);
      
      // Color based on destruction progress
      const color = new THREE.Color(0x8B4513).lerp(
        new THREE.Color(0xff0000),
        progress
      );
      colors.push(color.r, color.g, color.b);
      
      // Size decreases over time
      const size = (1 - progress) * 0.1;
      sizes.push(size);
    }
    
    // Update destruction particle system
    if (positions.length > 0) {
      this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      this.particleGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
      this.particleGeometry.attributes.position.needsUpdate = true;
      this.particleGeometry.attributes.color.needsUpdate = true;
      this.particleGeometry.attributes.size.needsUpdate = true;
    }
  }

  // Trigger explosion from meteor impact
  triggerMeteorImpact(position, velocity, mass) {
    const intensity = Math.min(mass * 0.1, 2.0);
    const color = new THREE.Color().setHSL(0.1, 0.8, 0.6);
    this.createExplosion(position, intensity, color);
  }

  // Clear all explosions
  clear() {
    this.explosions = [];
    this.destructionData.clear();
    this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
    this.particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute([], 3));
    this.particleGeometry.setAttribute('size', new THREE.Float32BufferAttribute([], 1));
  }

  // Dispose of resources
  dispose() {
    this.scene.remove(this.particleSystem);
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.clear();
  }
}

// Voxel destruction shader for more realistic effects
export const voxelDestructionVertexShader = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vAlpha;
  
  void main() {
    vColor = color;
    vAlpha = size;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * 100.0;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const voxelDestructionFragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;