import * as THREE from "three";
import GUI from "lil-gui";

// Rocky planet presets
const rockyPlanetPresets = {
    'Earth': {
        seaLevel: 0.52,
        continentSize: 1.5,
        mountainHeight: 0.4,
        roughness: 0.55,
        detail: 6.0,
        iceCapThreshold: 0.9,
        colorDeepWater: "#002b4d",
        colorShallowWater: "#006994",
        colorBeach: "#d4c6a3",
        colorGrass: "#2a602a",
        colorForest: "#1a381a",
        colorMountain: "#666666",
        colorMountainHigh: "#888888",
        colorSnow: "#ffffff",
        atmosphereDensity: 0.3,
        atmosphereColor: "#3a9eff"
    },
    'Mars': {
        seaLevel: 0.0,
        continentSize: 2.0,
        mountainHeight: 0.83,
        roughness: 0.7,
        detail: 7.0,
        iceCapThreshold: 0.85,
        colorDeepWater: "#3d2817",
        colorShallowWater: "#5a3d2a",
        colorBeach: "#8b6f47",
        colorGrass: "#a0522d",
        colorForest: "#8b4513",
        colorMountain: "#cd853f",
        colorMountainHigh: "#daa520",
        colorSnow: "#ff6347",
        atmosphereDensity: 0.1,
        atmosphereColor: "#ff6b47"
    },
    'Venus': {
        seaLevel: 0.0,
        continentSize: 1.8,
        mountainHeight: 0.6,
        roughness: 0.65,
        detail: 6.5,
        iceCapThreshold: 1.0,
        colorDeepWater: "#4a2c1a",
        colorShallowWater: "#6b4423",
        colorBeach: "#d2b48c",
        colorGrass: "#daa520",
        colorForest: "#b8860b",
        colorMountain: "#cd853f",
        colorMountainHigh: "#daa520",
        colorSnow: "#f0e68c",
        atmosphereDensity: 0.8,
        atmosphereColor: "#ffa500"
    },
    'Moon': {
        seaLevel: 0.0,
        continentSize: 3.0,
        mountainHeight: 1.0,
        roughness: 0.8,
        detail: 8.0,
        iceCapThreshold: 1.0,
        colorDeepWater: "#2f2f2f",
        colorShallowWater: "#3f3f3f",
        colorBeach: "#696969",
        colorGrass: "#808080",
        colorForest: "#708090",
        colorMountain: "#a9a9a9",
        colorMountainHigh: "#c0c0c0",
        colorSnow: "#d3d3d3",
        atmosphereDensity: 0.0,
        atmosphereColor: "#000000"
    },
    'Ocean World': {
        seaLevel: 0.85,
        continentSize: 0.8,
        mountainHeight: 0.27,
        roughness: 0.4,
        detail: 5.0,
        iceCapThreshold: 0.9,
        colorDeepWater: "#001122",
        colorShallowWater: "#003366",
        colorBeach: "#8b7355",
        colorGrass: "#228b22",
        colorForest: "#006400",
        colorMountain: "#556b2f",
        colorMountainHigh: "#6b8e23",
        colorSnow: "#ffffff",
        atmosphereDensity: 0.4,
        atmosphereColor: "#4a9eff"
    },
    'Desert Planet': {
        seaLevel: 0.1,
        continentSize: 2.5,
        mountainHeight: 0.5,
        roughness: 0.6,
        detail: 6.5,
        iceCapThreshold: 1.0,
        colorDeepWater: "#8b7355",
        colorShallowWater: "#a0826d",
        colorBeach: "#daa520",
        colorGrass: "#daa520",
        colorForest: "#b8860b",
        colorMountain: "#cd853f",
        colorMountainHigh: "#daa520",
        colorSnow: "#f5deb3",
        atmosphereDensity: 0.2,
        atmosphereColor: "#ffd700"
    }
};

// Gas planet presets
const gasPlanetPresets = {
    'Jupiter': {
        gasStripeSpeed: 0.02,
        gasStripeFrequency: 3.5,
        gasStripeSharpness: 2.0,
        gasTurbulence: 0.6,
        gasColor1: "#d4a574",
        gasColor2: "#8b6f47",
        gasColor3: "#ffd4a3",
        gasColor4: "#5c4a2e",
        gasColor5: "#f5e6d3"
    },
    'Saturn': {
        gasStripeSpeed: 0.015,
        gasStripeFrequency: 2.8,
        gasStripeSharpness: 1.8,
        gasTurbulence: 0.55,
        gasColor1: "#fad5a5",
        gasColor2: "#d4a574",
        gasColor3: "#ffebcd",
        gasColor4: "#b8860b",
        gasColor5: "#fff8dc"
    },
    'Neptune': {
        gasStripeSpeed: 0.025,
        gasStripeFrequency: 4.2,
        gasStripeSharpness: 2.5,
        gasTurbulence: 0.7,
        gasColor1: "#4169e1",
        gasColor2: "#1e90ff",
        gasColor3: "#87ceeb",
        gasColor4: "#0000cd",
        gasColor5: "#b0c4de"
    },
    'Uranus': {
        gasStripeSpeed: 0.022,
        gasStripeFrequency: 3.2,
        gasStripeSharpness: 2.2,
        gasTurbulence: 0.65,
        gasColor1: "#4fd0e7",
        gasColor2: "#87ceeb",
        gasColor3: "#b0e0e6",
        gasColor4: "#4682b4",
        gasColor5: "#e0f6ff"
    },
    'Exotic Purple': {
        gasStripeSpeed: 0.03,
        gasStripeFrequency: 4.8,
        gasStripeSharpness: 3.0,
        gasTurbulence: 0.85,
        gasColor1: "#9370db",
        gasColor2: "#8a2be2",
        gasColor3: "#ba55d3",
        gasColor4: "#4b0082",
        gasColor5: "#dda0dd"
    },
    'Fiery Red': {
        gasStripeSpeed: 0.028,
        gasStripeFrequency: 4.0,
        gasStripeSharpness: 2.8,
        gasTurbulence: 0.8,
        gasColor1: "#ff6347",
        gasColor2: "#dc143c",
        gasColor3: "#ff8c69",
        gasColor4: "#8b0000",
        gasColor5: "#ffa07a"
    },
    'Toxic Green': {
        gasStripeSpeed: 0.024,
        gasStripeFrequency: 4.5,
        gasStripeSharpness: 2.3,
        gasTurbulence: 0.75,
        gasColor1: "#32cd32",
        gasColor2: "#228b22",
        gasColor3: "#90ee90",
        gasColor4: "#006400",
        gasColor5: "#adff2f"
    }
};

export function setupPlanetControls({
    gui,
    params,
    guiControllers,
    registerFolder,
    scheduleShareUpdate,
    markPlanetDirty,
    planet
}) {
    // Store planet reference in guiControllers for later updates
    guiControllers.planet = planet;
    // Initialize locks if not present
    if (!params.locks) {
        params.locks = {
            planetSize: false,
            seaLevel: false,
            continentSize: false,
            mountainHeight: false,
            roughness: false,
            detail: false,
            iceCapThreshold: false,
            colorDeepWater: false,
            colorShallowWater: false,
            colorBeach: false,
            colorGrass: false,
            colorForest: false,
            colorMountain: false,
            colorMountainHigh: false,
            colorSnow: false,
            atmosphereDensity: false,
            atmosphereColor: false,
            gasPlanetSize: false,
            gasStripeSpeed: false,
            gasStripeFrequency: false,
            gasStripeSharpness: false,
            gasTurbulence: false,
            gasColor1: false,
            gasColor2: false,
            gasColor3: false,
            gasColor4: false,
            gasColor5: false
        };
    }

    // Store references to percentage wrappers
    const percentWrappers = {};

    // Helper function to add slider with percentage display and lock
    function addSliderWithPercentAndLock(folder, paramName, label, min, max, onChange) {
        // Create percentage wrapper object
        const percentWrapper = {
            get value() {
                return ((params[paramName] - min) / (max - min) * 100);
            },
            set value(percent) {
                params[paramName] = min + (percent / 100) * (max - min);
                if (onChange) onChange(params[paramName]);
                if (guiControllers.planet) guiControllers.planet.applyParams({ [paramName]: params[paramName] });
                if (scheduleShareUpdate) scheduleShareUpdate();
            }
        };
        
        percentWrappers[paramName] = percentWrapper;
        percentWrapper.value = percentWrapper.value;
        
        // Create slider first
        const sliderCtrl = folder.add(percentWrapper, 'value', 0, 100).name(label).onChange(v => {
            if (onChange) onChange(params[paramName]);
        });
        
        sliderCtrl.listen();
        
        // Get the slider's DOM element
        const sliderElement = sliderCtrl.domElement;
        
        // Create lock object
        const lockObj = { locked: params.locks[paramName] };
        const lockCtrl = folder.add(lockObj, 'locked').name('🔒').onChange(v => {
            params.locks[paramName] = v;
        });
        lockCtrl.name(params.locks[paramName] ? '🔒' : '🔓');
        
        // Get the lock controller's DOM element
        const lockElement = lockCtrl.domElement;
        
        // Function to update lock icon
        const updateLockIcon = (btn, isLocked) => {
            btn.textContent = isLocked ? '🔒' : '🔓';
            btn.title = isLocked ? 'Unlock' : 'Lock';
            btn.style.color = isLocked ? 'rgba(255, 100, 100, 0.9)' : 'rgba(169, 195, 237, 0.75)';
            btn.style.opacity = isLocked ? '1' : '0.7';
        };
        
        // Create a lock button element (just emoji, no container)
        const lockButton = document.createElement('button');
        lockButton.type = 'button';
        lockButton.className = 'lock-toggle';
        lockButton.style.cssText = `
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 0.9em;
            padding: 0;
            margin: 0;
            width: auto;
            height: auto;
            line-height: 1;
            color: rgba(169, 195, 237, 0.75);
            transition: color 0.2s, transform 0.1s;
            outline: none;
            flex-shrink: 0;
            display: inline-block;
        `;
        updateLockIcon(lockButton, params.locks[paramName]);
        
        // Add click handler
        lockButton.addEventListener('click', () => {
            lockObj.locked = !lockObj.locked;
            params.locks[paramName] = lockObj.locked;
            updateLockIcon(lockButton, lockObj.locked);
            // Update the original lock controller for consistency
            if (lockCtrl.object) {
                lockCtrl.object.locked = lockObj.locked;
            }
            lockCtrl.name(lockObj.locked ? '🔒' : '🔓');
        });
        
        // Find the widget container in the slider element
        // lil-gui structure: .controller > .widget (contains input)
        // We want to add the lock button to the right side, after the number input
        const sliderWidget = sliderElement.querySelector('.widget');
        if (sliderWidget) {
            // Find the number input (the text field showing the value)
            const numberInput = sliderWidget.querySelector('input[type="number"]');
            if (numberInput && numberInput.parentElement) {
                // Insert lock button after the number input
                numberInput.parentElement.insertBefore(lockButton, numberInput.nextSibling);
                // Ensure the widget uses flexbox
                if (!sliderWidget.style.display) {
                    sliderWidget.style.display = 'flex';
                    sliderWidget.style.alignItems = 'center';
                    sliderWidget.style.gap = '4px';
                }
            } else {
                // Fallback: append to widget
                sliderWidget.appendChild(lockButton);
                sliderWidget.style.display = 'flex';
                sliderWidget.style.alignItems = 'center';
                sliderWidget.style.gap = '4px';
            }
        } else {
            // Fallback: try to find the input and insert after it
            const sliderInput = sliderElement.querySelector('input[type="range"]');
            if (sliderInput && sliderInput.parentElement) {
                sliderInput.parentElement.style.display = 'flex';
                sliderInput.parentElement.style.alignItems = 'center';
                sliderInput.parentElement.style.gap = '4px';
                sliderInput.parentElement.appendChild(lockButton);
            }
        }
        
        // Hide the original lock controller
        lockElement.style.display = 'none';
        
        return { slider: sliderCtrl, lock: lockCtrl, wrapper: percentWrapper };
    }
    
    // Helper function to add color with lock
    function addColorWithLock(folder, paramName, label, onChange) {
        // Create color controller first
        const colorCtrl = folder.addColor(params, paramName).name(label).onChange(v => {
            if (onChange) onChange(v);
            if (guiControllers.planet) guiControllers.planet.applyParams({ [paramName]: v });
            if (scheduleShareUpdate) scheduleShareUpdate();
        });
        
        // Get the color controller's DOM element
        const colorElement = colorCtrl.domElement;
        
        // Create lock object
        const lockObj = { locked: params.locks[paramName] };
        const lockCtrl = folder.add(lockObj, 'locked').name('🔒').onChange(v => {
            params.locks[paramName] = v;
        });
        lockCtrl.name(params.locks[paramName] ? '🔒' : '🔓');
        
        // Get the lock controller's DOM element
        const lockElement = lockCtrl.domElement;
        
        // Function to update lock icon
        const updateLockIcon = (btn, isLocked) => {
            btn.textContent = isLocked ? '🔒' : '🔓';
            btn.title = isLocked ? 'Unlock' : 'Lock';
            btn.style.color = isLocked ? 'rgba(255, 100, 100, 0.9)' : 'rgba(169, 195, 237, 0.75)';
            btn.style.opacity = isLocked ? '1' : '0.7';
        };
        
        // Create a lock button element (just emoji, no container)
        const lockButton = document.createElement('button');
        lockButton.type = 'button';
        lockButton.className = 'lock-toggle';
        lockButton.style.cssText = `
            background: transparent;
            border: none;
            cursor: pointer;
            font-size: 0.9em;
            padding: 0;
            margin: 0;
            width: auto;
            height: auto;
            line-height: 1;
            color: rgba(169, 195, 237, 0.75);
            transition: color 0.2s, transform 0.1s;
            outline: none;
            flex-shrink: 0;
            display: inline-block;
        `;
        updateLockIcon(lockButton, params.locks[paramName]);
        
        // Add click handler
        lockButton.addEventListener('click', () => {
            lockObj.locked = !lockObj.locked;
            params.locks[paramName] = lockObj.locked;
            updateLockIcon(lockButton, lockObj.locked);
            if (lockCtrl.object) {
                lockCtrl.object.locked = lockObj.locked;
            }
            lockCtrl.name(lockObj.locked ? '🔒' : '🔓');
        });
        
        // Find the widget container in the color element
        const colorWidget = colorElement.querySelector('.widget');
        if (colorWidget) {
            // Find the color input/swatch
            const colorInput = colorWidget.querySelector('input[type="text"]') || colorWidget.querySelector('canvas');
            if (colorInput && colorInput.parentElement) {
                // Insert lock button after the color input
                colorInput.parentElement.insertBefore(lockButton, colorInput.nextSibling);
                // Ensure the widget uses flexbox
                if (!colorWidget.style.display) {
                    colorWidget.style.display = 'flex';
                    colorWidget.style.alignItems = 'center';
                    colorWidget.style.gap = '4px';
                }
            } else {
                // Fallback: append to widget
                colorWidget.appendChild(lockButton);
                colorWidget.style.display = 'flex';
                colorWidget.style.alignItems = 'center';
                colorWidget.style.gap = '4px';
            }
        }
        
        // Hide the original lock controller
        lockElement.style.display = 'none';
        
        return { color: colorCtrl, lock: lockCtrl };
    }

    // Planet Type Selector
    const planetTypeController = gui.add(params, 'planetType', { 'Earth-like': 'earth', 'Gas Planet': 'gas' }).name('Planet Type');
    planetTypeController.onChange(v => {
        if (guiControllers.planet) guiControllers.planet.setPlanetType(v);
        if (scheduleShareUpdate) scheduleShareUpdate();
    });

    // Terrain Generation folder
    const folderTerrain = registerFolder(gui.addFolder('Terrain Generation'), { close: false });

    // Planet Size
    const planetSizeCtrl = addSliderWithPercentAndLock(
        folderTerrain, 'planetSize', 'Planet Size', 0.5, 2.0,
        v => {
            if (!params.locks.detail) {
                const newDetail = 3.0 + ((v - 0.5) / 1.5) * 5.0;
                if (percentWrappers.detail) {
                    const detailPercent = ((newDetail - 3.0) / (8.0 - 3.0)) * 100;
                    percentWrappers.detail.value = detailPercent;
                } else {
                    params.detail = newDetail;
                    if (planet) planet.applyParams({ detail: newDetail });
                }
            }
        }
    );

    addSliderWithPercentAndLock(folderTerrain, 'seaLevel', 'Sea Level', 0.0, 1.0, () => {});
    addSliderWithPercentAndLock(folderTerrain, 'continentSize', 'Continent Freq', 0.1, 5.0, () => {});
    addSliderWithPercentAndLock(folderTerrain, 'mountainHeight', 'Mtn Height', 0.0, 1.0, () => {});
    addSliderWithPercentAndLock(folderTerrain, 'roughness', 'Roughness', 0.1, 0.9, () => {});
    
    const detailSliderCtrl = addSliderWithPercentAndLock(folderTerrain, 'detail', 'Detail', 3.0, 8.0, () => {});
    
    addSliderWithPercentAndLock(folderTerrain, 'iceCapThreshold', 'Ice Caps', 0.0, 1.0, () => {});

    // Rocky Planet folder
    const folderRocky = registerFolder(gui.addFolder('Rocky Planet'), { close: true });
    const rockyPresetNames = Object.keys(rockyPlanetPresets);
    folderRocky.add({preset: 'Earth'}, 'preset', rockyPresetNames).name('Planet Preset').onChange(v => {
        applyRockyPlanetPreset(v);
    });
    // Randomize button removed - now used by "Generate" button in header

    // Colors folder
    const folderColors = registerFolder(gui.addFolder('Colors'), { close: true });
    addColorWithLock(folderColors, 'colorDeepWater', 'Deep Water', () => {});
    addColorWithLock(folderColors, 'colorShallowWater', 'Shallow Water', () => {});
    addColorWithLock(folderColors, 'colorBeach', 'Beach', () => {});
    addColorWithLock(folderColors, 'colorGrass', 'Grass', () => {});
    addColorWithLock(folderColors, 'colorForest', 'Forest', () => {});
    addColorWithLock(folderColors, 'colorMountain', 'Mountain', () => {});
    addColorWithLock(folderColors, 'colorMountainHigh', 'Mountain High', () => {});
    addColorWithLock(folderColors, 'colorSnow', 'Snow', () => {});

    // Atmosphere & Misc folder
    const folderAtmo = registerFolder(gui.addFolder('Atmosphere & Misc'), { close: false });
    addSliderWithPercentAndLock(folderAtmo, 'atmosphereDensity', 'Atmo Density', 0.0, 1.0, () => {});
    addColorWithLock(folderAtmo, 'atmosphereColor', 'Atmo Color', () => {});
    folderAtmo.add(params, 'rotationSpeed', 0.0, 0.5).name('Rotation Speed').onChange(v => {
        if (scheduleShareUpdate) scheduleShareUpdate();
    });

    // Gas Planet folder
    const folderGas = registerFolder(gui.addFolder('Gas Planet'), { close: true });
    
    const gasPlanetSizeCtrl = addSliderWithPercentAndLock(
        folderGas, 'gasPlanetSize', 'Planet Size', 0.5, 2.0,
        v => {
            if (!params.locks.gasStripeFrequency) {
                const newFreq = 1.0 + ((v - 0.5) / 1.5) * 4.0;
                if (percentWrappers.gasStripeFrequency) {
                    const freqPercent = ((newFreq - 1.0) / (5.0 - 1.0)) * 100;
                    percentWrappers.gasStripeFrequency.value = freqPercent;
                } else {
                    params.gasStripeFrequency = newFreq;
                    if (planet) planet.applyParams({ gasStripeFrequency: newFreq });
                }
            }
        }
    );

    addSliderWithPercentAndLock(folderGas, 'gasStripeSpeed', 'Stripe Speed', 0.0, 0.035, () => {});
    
    const stripeFreqSliderCtrl = addSliderWithPercentAndLock(folderGas, 'gasStripeFrequency', 'Stripe Frequency', 1.0, 5.0, () => {});
    
    addSliderWithPercentAndLock(folderGas, 'gasStripeSharpness', 'Stripe Sharpness', 0.5, 5.0, () => {});
    addSliderWithPercentAndLock(folderGas, 'gasTurbulence', 'Turbulence', 0.5, 1.0, () => {});

    const presetNames = Object.keys(gasPlanetPresets);
    folderGas.add({preset: 'Jupiter'}, 'preset', presetNames).name('Style Preset').onChange(v => {
        applyGasPlanetPreset(v);
    });
    // Randomize button removed - now used by "Generate" button in header

    const colorControllers = {
        color1: addColorWithLock(folderGas, 'gasColor1', 'Color 1', () => {}),
        color2: addColorWithLock(folderGas, 'gasColor2', 'Color 2', () => {}),
        color3: addColorWithLock(folderGas, 'gasColor3', 'Color 3', () => {}),
        color4: addColorWithLock(folderGas, 'gasColor4', 'Color 4', () => {}),
        color5: addColorWithLock(folderGas, 'gasColor5', 'Color 5', () => {})
    };

    // Function to apply rocky planet preset
    function applyRockyPlanetPreset(presetName) {
        const preset = rockyPlanetPresets[presetName];
        if (!preset) return;
        
        Object.keys(preset).forEach(key => {
            if (params.hasOwnProperty(key)) {
                params[key] = preset[key];
            }
        });
        
        if (guiControllers.planet) guiControllers.planet.applyParams(preset);
        
        // Update GUI controllers
        folderTerrain.controllers.forEach(controller => {
            if (controller.property && params.hasOwnProperty(controller.property)) {
                if (controller.object) {
                    controller.object[controller.property] = params[controller.property];
                }
                if (controller.updateDisplay) controller.updateDisplay();
            }
        });
        
        folderColors.controllers.forEach(controller => {
            if (controller.property && params.hasOwnProperty(controller.property)) {
                if (controller.object) {
                    controller.object[controller.property] = params[controller.property];
                }
                if (controller.updateDisplay) controller.updateDisplay();
            }
        });
        
        folderAtmo.controllers.forEach(controller => {
            if (controller.property && params.hasOwnProperty(controller.property)) {
                if (controller.object) {
                    controller.object[controller.property] = params[controller.property];
                }
                if (controller.updateDisplay) controller.updateDisplay();
            }
        });
        
        if (scheduleShareUpdate) scheduleShareUpdate();
    }

    // Function to randomize rocky planet
    function randomizeRockyPlanet() {
        if (!params.locks.planetSize) params.planetSize = Math.random() * 1.5 + 0.5;
        if (!params.locks.seaLevel) params.seaLevel = Math.random() * 0.7 + 0.1;
        if (!params.locks.continentSize) params.continentSize = Math.random() * 3.0 + 0.5;
        if (!params.locks.mountainHeight) params.mountainHeight = Math.random();
        if (!params.locks.roughness) params.roughness = Math.random() * 0.6 + 0.2;
        if (!params.locks.detail) {
            params.detail = 3.0 + ((params.planetSize - 0.5) / 1.5) * 5.0;
        }
        if (!params.locks.iceCapThreshold) params.iceCapThreshold = Math.random() * 0.5 + 0.5;
        if (!params.locks.atmosphereDensity) params.atmosphereDensity = Math.random() * 0.8;
        if (!params.locks.atmosphereColor) {
            params.atmosphereColor = '#' + new THREE.Color().setHSL(Math.random(), 0.5 + Math.random() * 0.5, 0.4 + Math.random() * 0.4).getHexString();
        }
        
        const schemes = [
            () => {
                const waterHue = 0.5 + Math.random() * 0.15;
                const landHue = 0.15 + Math.random() * 0.2;
                return {
                    colorDeepWater: '#' + new THREE.Color().setHSL(waterHue, 0.6 + Math.random() * 0.3, 0.1 + Math.random() * 0.15).getHexString(),
                    colorShallowWater: '#' + new THREE.Color().setHSL(waterHue, 0.5 + Math.random() * 0.3, 0.2 + Math.random() * 0.2).getHexString(),
                    colorBeach: '#' + new THREE.Color().setHSL(landHue, 0.2 + Math.random() * 0.3, 0.6 + Math.random() * 0.2).getHexString(),
                    colorGrass: '#' + new THREE.Color().setHSL(landHue + (Math.random() - 0.5) * 0.1, 0.5 + Math.random() * 0.3, 0.25 + Math.random() * 0.2).getHexString(),
                    colorForest: '#' + new THREE.Color().setHSL(landHue + (Math.random() - 0.5) * 0.05, 0.6 + Math.random() * 0.3, 0.15 + Math.random() * 0.15).getHexString(),
                    colorMountain: '#' + new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 0.15 + Math.random() * 0.2, 0.35 + Math.random() * 0.2).getHexString(),
                    colorMountainHigh: '#' + new THREE.Color().setHSL(0.05 + Math.random() * 0.1, 0.1 + Math.random() * 0.15, 0.45 + Math.random() * 0.2).getHexString(),
                    colorSnow: '#' + new THREE.Color().setHSL(Math.random() * 0.1, Math.random() * 0.1, 0.85 + Math.random() * 0.1).getHexString()
                };
            },
            () => {
                const h = 0.05 + Math.random() * 0.15;
                const variation = (Math.random() - 0.5) * 0.1;
                return {
                    colorDeepWater: '#' + new THREE.Color().setHSL(h + variation, 0.3 + Math.random() * 0.3, 0.2 + Math.random() * 0.2).getHexString(),
                    colorShallowWater: '#' + new THREE.Color().setHSL(h + variation, 0.25 + Math.random() * 0.3, 0.3 + Math.random() * 0.2).getHexString(),
                    colorBeach: '#' + new THREE.Color().setHSL(h + variation * 0.5, 0.25 + Math.random() * 0.3, 0.6 + Math.random() * 0.2).getHexString(),
                    colorGrass: '#' + new THREE.Color().setHSL(h + variation * 0.3, 0.4 + Math.random() * 0.4, 0.4 + Math.random() * 0.3).getHexString(),
                    colorForest: '#' + new THREE.Color().setHSL(h + variation * 0.2, 0.5 + Math.random() * 0.3, 0.3 + Math.random() * 0.2).getHexString(),
                    colorMountain: '#' + new THREE.Color().setHSL(h + variation * 0.4, 0.3 + Math.random() * 0.3, 0.35 + Math.random() * 0.25).getHexString(),
                    colorMountainHigh: '#' + new THREE.Color().setHSL(h + variation * 0.3, 0.25 + Math.random() * 0.25, 0.5 + Math.random() * 0.25).getHexString(),
                    colorSnow: '#' + new THREE.Color().setHSL(h + variation * 0.2, 0.15 + Math.random() * 0.2, 0.75 + Math.random() * 0.15).getHexString()
                };
            },
            () => {
                const h = 0.65 + Math.random() * 0.3;
                const variation = (Math.random() - 0.5) * 0.15;
                return {
                    colorDeepWater: '#' + new THREE.Color().setHSL((h + variation) % 1, 0.5 + Math.random() * 0.4, 0.15 + Math.random() * 0.15).getHexString(),
                    colorShallowWater: '#' + new THREE.Color().setHSL((h + variation * 0.8) % 1, 0.4 + Math.random() * 0.4, 0.25 + Math.random() * 0.15).getHexString(),
                    colorBeach: '#' + new THREE.Color().setHSL((h + variation * 0.6 + 0.1) % 1, 0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.2).getHexString(),
                    colorGrass: '#' + new THREE.Color().setHSL((h + variation * 0.4 + 0.05) % 1, 0.6 + Math.random() * 0.3, 0.35 + Math.random() * 0.25).getHexString(),
                    colorForest: '#' + new THREE.Color().setHSL((h + variation * 0.3) % 1, 0.7 + Math.random() * 0.2, 0.25 + Math.random() * 0.15).getHexString(),
                    colorMountain: '#' + new THREE.Color().setHSL((h + variation * 0.5 + 0.1) % 1, 0.4 + Math.random() * 0.3, 0.35 + Math.random() * 0.2).getHexString(),
                    colorMountainHigh: '#' + new THREE.Color().setHSL((h + variation * 0.4 + 0.1) % 1, 0.3 + Math.random() * 0.3, 0.45 + Math.random() * 0.2).getHexString(),
                    colorSnow: '#' + new THREE.Color().setHSL((h + variation * 0.2 + 0.15) % 1, 0.2 + Math.random() * 0.3, 0.8 + Math.random() * 0.15).getHexString()
                };
            },
            () => {
                const h = 0.0 + Math.random() * 0.1;
                return {
                    colorDeepWater: '#' + new THREE.Color().setHSL(h, 0.4 + Math.random() * 0.3, 0.1 + Math.random() * 0.1).getHexString(),
                    colorShallowWater: '#' + new THREE.Color().setHSL(h, 0.3 + Math.random() * 0.3, 0.2 + Math.random() * 0.15).getHexString(),
                    colorBeach: '#' + new THREE.Color().setHSL(h + Math.random() * 0.05, 0.3 + Math.random() * 0.3, 0.4 + Math.random() * 0.2).getHexString(),
                    colorGrass: '#' + new THREE.Color().setHSL(h + Math.random() * 0.08, 0.5 + Math.random() * 0.3, 0.3 + Math.random() * 0.2).getHexString(),
                    colorForest: '#' + new THREE.Color().setHSL(h + Math.random() * 0.05, 0.6 + Math.random() * 0.2, 0.2 + Math.random() * 0.15).getHexString(),
                    colorMountain: '#' + new THREE.Color().setHSL(h + Math.random() * 0.1, 0.2 + Math.random() * 0.3, 0.25 + Math.random() * 0.2).getHexString(),
                    colorMountainHigh: '#' + new THREE.Color().setHSL(h + Math.random() * 0.08, 0.15 + Math.random() * 0.25, 0.35 + Math.random() * 0.25).getHexString(),
                    colorSnow: '#' + new THREE.Color().setHSL(h + Math.random() * 0.05, 0.1 + Math.random() * 0.2, 0.7 + Math.random() * 0.2).getHexString()
                };
            },
            () => {
                const h = 0.5 + Math.random() * 0.2;
                return {
                    colorDeepWater: '#' + new THREE.Color().setHSL(h, 0.4 + Math.random() * 0.4, 0.2 + Math.random() * 0.2).getHexString(),
                    colorShallowWater: '#' + new THREE.Color().setHSL(h, 0.3 + Math.random() * 0.4, 0.35 + Math.random() * 0.2).getHexString(),
                    colorBeach: '#' + new THREE.Color().setHSL(h + (Math.random() - 0.5) * 0.1, 0.2 + Math.random() * 0.3, 0.6 + Math.random() * 0.2).getHexString(),
                    colorGrass: '#' + new THREE.Color().setHSL(h + (Math.random() - 0.5) * 0.15, 0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.25).getHexString(),
                    colorForest: '#' + new THREE.Color().setHSL(h + (Math.random() - 0.5) * 0.1, 0.4 + Math.random() * 0.3, 0.3 + Math.random() * 0.2).getHexString(),
                    colorMountain: '#' + new THREE.Color().setHSL(h + (Math.random() - 0.5) * 0.2, 0.2 + Math.random() * 0.3, 0.4 + Math.random() * 0.25).getHexString(),
                    colorMountainHigh: '#' + new THREE.Color().setHSL(h + (Math.random() - 0.5) * 0.15, 0.15 + Math.random() * 0.25, 0.5 + Math.random() * 0.25).getHexString(),
                    colorSnow: '#' + new THREE.Color().setHSL(h + (Math.random() - 0.5) * 0.1, 0.1 + Math.random() * 0.2, 0.8 + Math.random() * 0.15).getHexString()
                };
            },
            () => {
                const primaryHue = Math.random();
                const secondaryHue = (primaryHue + 0.3 + Math.random() * 0.4) % 1;
                return {
                    colorDeepWater: '#' + new THREE.Color().setHSL(primaryHue, 0.6 + Math.random() * 0.3, 0.15 + Math.random() * 0.15).getHexString(),
                    colorShallowWater: '#' + new THREE.Color().setHSL(primaryHue, 0.5 + Math.random() * 0.3, 0.25 + Math.random() * 0.2).getHexString(),
                    colorBeach: '#' + new THREE.Color().setHSL(secondaryHue, 0.4 + Math.random() * 0.4, 0.55 + Math.random() * 0.25).getHexString(),
                    colorGrass: '#' + new THREE.Color().setHSL((primaryHue + secondaryHue) / 2 + (Math.random() - 0.5) * 0.1, 0.6 + Math.random() * 0.3, 0.35 + Math.random() * 0.25).getHexString(),
                    colorForest: '#' + new THREE.Color().setHSL(secondaryHue, 0.7 + Math.random() * 0.2, 0.25 + Math.random() * 0.2).getHexString(),
                    colorMountain: '#' + new THREE.Color().setHSL((primaryHue + Math.random() * 0.2) % 1, 0.3 + Math.random() * 0.4, 0.35 + Math.random() * 0.25).getHexString(),
                    colorMountainHigh: '#' + new THREE.Color().setHSL((secondaryHue + Math.random() * 0.2) % 1, 0.25 + Math.random() * 0.35, 0.45 + Math.random() * 0.25).getHexString(),
                    colorSnow: '#' + new THREE.Color().setHSL((primaryHue + secondaryHue) / 2, 0.2 + Math.random() * 0.3, 0.75 + Math.random() * 0.2).getHexString()
                };
            }
        ];
        
        const colorScheme = schemes[Math.floor(Math.random() * schemes.length)]();
        Object.keys(colorScheme).forEach(key => {
            if (!params.locks[key]) {
                params[key] = colorScheme[key];
            }
        });
        
        if (guiControllers.planet) guiControllers.planet.applyParams(params);
        
        // Update GUI controllers
        folderTerrain.controllers.forEach(controller => {
            if (controller.property && params.hasOwnProperty(controller.property)) {
                if (controller.object) {
                    controller.object[controller.property] = params[controller.property];
                }
                if (controller.updateDisplay) controller.updateDisplay();
            }
        });
        
        folderColors.controllers.forEach(controller => {
            if (controller.property && params.hasOwnProperty(controller.property)) {
                if (controller.object) {
                    controller.object[controller.property] = params[controller.property];
                }
                if (controller.updateDisplay) controller.updateDisplay();
            }
        });
        
        folderAtmo.controllers.forEach(controller => {
            if (controller.property && params.hasOwnProperty(controller.property)) {
                if (controller.object) {
                    controller.object[controller.property] = params[controller.property];
                }
                if (controller.updateDisplay) controller.updateDisplay();
            }
        });
        
        if (scheduleShareUpdate) scheduleShareUpdate();
    }

    // Function to apply gas planet preset
    function applyGasPlanetPreset(presetName) {
        const preset = gasPlanetPresets[presetName];
        if (!preset) return;
        
        Object.keys(preset).forEach(key => {
            if (params.hasOwnProperty(key)) {
                params[key] = preset[key];
            }
        });
        
        if (guiControllers.planet) guiControllers.planet.applyParams(preset);
        
        folderGas.controllers.forEach(controller => {
            if (controller.property && params.hasOwnProperty(controller.property)) {
                if (controller.object) {
                    controller.object[controller.property] = params[controller.property];
                }
                if (controller.updateDisplay) controller.updateDisplay();
            }
        });
        
        if (scheduleShareUpdate) scheduleShareUpdate();
    }

    // Function to randomize gas planet
    function randomizeGasPlanet() {
        if (!params.locks.gasPlanetSize) params.gasPlanetSize = Math.random() * 1.5 + 0.5;
        if (!params.locks.gasStripeSpeed) params.gasStripeSpeed = Math.random() * 0.035;
        if (!params.locks.gasStripeFrequency) {
            params.gasStripeFrequency = 1.0 + ((params.gasPlanetSize - 0.5) / 1.5) * 4.0;
        }
        if (!params.locks.gasStripeSharpness) params.gasStripeSharpness = Math.random() * 3.0 + 1.0;
        if (!params.locks.gasTurbulence) params.gasTurbulence = Math.random() * 0.5 + 0.5;
        
        const schemes = [
            () => {
                const baseHue = Math.random();
                const sat = 0.6 + Math.random() * 0.4;
                const light = 0.3 + Math.random() * 0.4;
                return Array.from({length: 5}, (_, i) => {
                    const l = light + (Math.random() - 0.5) * 0.3;
                    return new THREE.Color().setHSL(baseHue, sat, l);
                });
            },
            () => {
                const baseHue = Math.random();
                return Array.from({length: 5}, (_, i) => {
                    const h = (baseHue + (i - 2) * 0.1 + 1) % 1;
                    return new THREE.Color().setHSL(h, 0.7, 0.4 + Math.random() * 0.3);
                });
            },
            () => {
                const hue1 = Math.random();
                const hue2 = (hue1 + 0.5) % 1;
                return Array.from({length: 5}, (_, i) => {
                    const h = i < 2 ? hue1 : hue2;
                    return new THREE.Color().setHSL(h, 0.6 + Math.random() * 0.3, 0.4 + Math.random() * 0.3);
                });
            }
        ];
        
        const colorScheme = schemes[Math.floor(Math.random() * schemes.length)]();
        const colors = colorScheme.map(c => '#' + c.getHexString());
        
        if (!params.locks.gasColor1) params.gasColor1 = colors[0];
        if (!params.locks.gasColor2) params.gasColor2 = colors[1];
        if (!params.locks.gasColor3) params.gasColor3 = colors[2];
        if (!params.locks.gasColor4) params.gasColor4 = colors[3];
        if (!params.locks.gasColor5) params.gasColor5 = colors[4];
        
        if (guiControllers.planet) guiControllers.planet.applyParams(params);
        
        folderGas.controllers.forEach(controller => {
            if (controller.property && params.hasOwnProperty(controller.property)) {
                if (controller.object) {
                    controller.object[controller.property] = params[controller.property];
                }
                if (controller.updateDisplay) controller.updateDisplay();
            }
        });
        
        if (scheduleShareUpdate) scheduleShareUpdate();
    }

    // Store percentWrappers in guiControllers for external access
    guiControllers.percentWrappers = percentWrappers;
    
    // Export randomize functions for use in main.js
    guiControllers.randomizeRockyPlanet = randomizeRockyPlanet;
    guiControllers.randomizeGasPlanet = randomizeGasPlanet;
}
