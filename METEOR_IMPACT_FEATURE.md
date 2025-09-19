# Meteor Impact System with Animated Voxel Destruction

## Overview
This feature adds a dynamic meteor impact system to the planet generator with animated voxel destruction instead of instant block removal. When meteors hit the planet, they create realistic craters and animated particle effects that simulate the destruction of terrain voxels.

## Features

### Meteor System
- **Automatic Spawning**: Meteors spawn at configurable intervals around the planet
- **Realistic Trajectories**: Meteors follow curved paths toward the planet with some randomness
- **Visual Trails**: Each meteor has a glowing trail that follows its path
- **Impact Detection**: Accurate collision detection with the planet surface

### Voxel Destruction Animation
- **Particle-Based Destruction**: Instead of instantly removing blocks, the system creates animated particles
- **Realistic Physics**: Particles follow gravity and have realistic movement
- **Terrain-Based Colors**: Destruction particles use colors sampled from the terrain
- **Configurable Animation**: Duration, particle count, size, and speed are all adjustable

### Crater Generation
- **Realistic Craters**: Meteors create craters with proper depth and rim height
- **Directional Impact**: Craters are elongated based on impact angle and velocity
- **Configurable Parameters**: Crater depth, radius, and rim height can be adjusted

## Controls

### Meteor Settings
- **Enable Meteors**: Toggle the meteor system on/off
- **Spawn Frequency**: How often meteors appear (0.01 to 1.0)
- **Meteor Size**: Size of individual meteors (0.05 to 0.5)
- **Meteor Speed**: How fast meteors travel (2 to 20)
- **Meteor Color**: Color of the meteor and trail
- **Trail Length**: Number of trail segments (5 to 50)
- **Trail Opacity**: Transparency of the trail (0.1 to 1.0)

### Voxel Destruction Settings
- **Enable Voxel Destruction**: Toggle animated destruction on/off
- **Voxel Size**: Size of individual voxel particles (0.01 to 0.1)
- **Animation Duration**: How long the destruction animation lasts (0.5 to 5 seconds)
- **Particle Count**: Number of destruction particles (10 to 200)
- **Particle Size**: Size of destruction particles (0.005 to 0.05)
- **Particle Speed**: Initial velocity of particles (1 to 10)
- **Particle Lifetime**: How long particles remain visible (0.5 to 3 seconds)

### Crater Generation Settings
- **Depth Multiplier**: How deep craters are (0.1 to 3.0)
- **Radius Multiplier**: How wide craters are (0.1 to 3.0)
- **Rim Height**: Height of crater rims (0.005 to 0.1)

## Usage

1. Open the planet generator
2. Navigate to the "Environment" section in the controls
3. Expand "Explosions" and then "Meteor Impacts"
4. Enable meteors and adjust the settings as desired
5. Watch as meteors spawn and impact the planet, creating animated destruction effects

## Testing

For testing purposes, you can manually spawn meteors by opening the browser console and running:
```javascript
spawnTestMeteor();
```

## Technical Details

- Meteors are spawned at random positions around the planet
- Impact detection uses distance-based collision detection
- Voxel destruction particles use Three.js PointsMaterial for performance
- Crater generation modifies the planet's geometry in real-time
- All animations are integrated into the main render loop

## Performance Considerations

- The system is designed to be performant with configurable particle counts
- Meteors and destruction particles are automatically cleaned up after their lifetime expires
- The voxel grid system is lightweight and doesn't store actual voxel data
- Particle systems use instanced rendering for efficiency