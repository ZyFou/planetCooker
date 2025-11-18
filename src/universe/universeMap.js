import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export class UniverseMap {
  constructor(container, universeManager, shipPositionGetter, onTrackChange) {
    this.container = container;
    this.universeManager = universeManager;
    this.shipPositionGetter = shipPositionGetter;
    this.onTrackChange = onTrackChange;
    this.isVisible = false;
    this.trackedSystem = null;
    this.selectedSystem = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.systemMarkers = new Map();
    this.markerMeshes = []; // Cache for raycasting
    this.shipMarker = null;
    this.trackingLine = null;
    
    // Shared geometry for all system markers to save memory
    this.markerGeometry = new THREE.IcosahedronGeometry(400, 1);

    // Create map scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010203);
    
    // Add some ambient light so we can see objects
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // Create map camera (perspective for 3D navigation)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 1, 500000);
    this.camera.position.set(0, 30000, 30000);
    this.camera.lookAt(0, 0, 0);

    // Create map renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.top = "0";
    this.renderer.domElement.style.left = "0";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.zIndex = "10";
    this.renderer.domElement.style.pointerEvents = "none";
    this.renderer.domElement.style.backgroundColor = "transparent";
    container.appendChild(this.renderer.domElement);
    
    // Add orbit controls for 3D navigation (after renderer is created)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0.8;
    this.controls.minDistance = 1000;
    this.controls.maxDistance = 200000;
    this.controls.enablePan = true;
    this.controls.enabled = false; // Disabled by default until map is shown
    
    // Prevent OrbitControls from blocking clicks
    this.controls.addEventListener('start', () => {
      // Allow clicks to work even when dragging
    });

    // Create ship marker
    this._createShipMarker();
    
    // Create tracking line for map
    this._createTrackingLine();

    // Setup event listeners
    this._setupEventListeners();

    // Get UI elements
    this.infoPanel = document.getElementById("map-info-panel");
    this.infoName = document.getElementById("map-info-name");
    this.infoDistance = document.getElementById("map-info-distance");
    this.infoPlanets = document.getElementById("map-info-planets");
    this.infoStar = document.getElementById("map-info-star");
    this.trackButton = document.getElementById("map-track-button");
    this.closeButton = document.getElementById("map-close-button");

    if (this.trackButton) {
      this.trackButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._toggleTrack();
      });
    }
    if (this.closeButton) {
      this.closeButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      });
    }
  }

  _createShipMarker() {
    const geometry = new THREE.SphereGeometry(200, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      emissive: 0x0077ff,
      emissiveIntensity: 0.5
    });
    this.shipMarker = new THREE.Mesh(geometry, material);
    this.scene.add(this.shipMarker);
  }
  
  _createTrackingLine() {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.6,
      linewidth: 2
    });
    this.trackingLine = new THREE.Line(geometry, material);
    this.trackingLine.visible = false;
    this.scene.add(this.trackingLine);
  }

  _setupEventListeners() {
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onResize = this._onResize.bind(this);

    this.renderer.domElement.addEventListener("mousemove", this._onMouseMove);
    this.renderer.domElement.addEventListener("mousedown", this._onMouseDown);
    this.renderer.domElement.addEventListener("click", this._onClick, true); // Use capture phase
    window.addEventListener("resize", this._onResize);
  }
  
  _onMouseDown(event) {
    if (!this.isVisible) return;
    
    // Check if clicking on a system before OrbitControls handles it
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Use cached array
    const intersects = this.raycaster.intersectObjects(this.markerMeshes, false);

    if (intersects.length > 0) {
      // Temporarily disable OrbitControls to allow click
      if (this.controls) {
        this.controls.enabled = false;
        setTimeout(() => {
          if (this.isVisible && this.controls) {
            this.controls.enabled = true;
          }
        }, 50);
      }
    }
  }

  _onMouseMove(event) {
    if (!this.isVisible) return;
    // Optional: throttling mouse move could also help if we had hover effects
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onClick(event) {
    if (!this.isVisible) return;
    
    // Don't handle clicks on UI elements
    if (event.target.closest('.map-info-panel') || event.target.closest('.map-close-button') || event.target.closest('.map-track-button')) {
      return;
    }
    
    // Update mouse position
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // console.log("Click on map canvas, mouse coords:", this.mouse);

    // Update raycaster with current camera and mouse position
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Use cached array
    // console.log("Checking intersection with", this.markerMeshes.length, "markers");
    const intersects = this.raycaster.intersectObjects(this.markerMeshes, false);

    // console.log("Click detected, intersects:", intersects.length);
    if (intersects.length > 0) {
      // Prevent orbit controls from panning when clicking on a system
      event.preventDefault();
      event.stopPropagation();
      const marker = intersects[0].object.userData.marker;
      this._selectSystem(marker.systemData);
    }
  }

  _onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  _createSystemMarker(systemData) {
    // Use shared geometry
    const material = new THREE.MeshBasicMaterial({
      color: systemData.star?.color ?? 0xffffff,
      emissive: systemData.star?.color ?? 0xffffff,
      emissiveIntensity: 0.5
    });
    const mesh = new THREE.Mesh(this.markerGeometry, material);
    mesh.userData.marker = { systemData };
    mesh.position.copy(systemData.position);
    
    // Make sure the mesh is pickable
    mesh.raycast = THREE.Mesh.prototype.raycast;

    // console.log("Created marker for system:", systemData.name, "at position:", systemData.position);
    return { mesh, systemData };
  }

  _selectSystem(systemData) {
    this.selectedSystem = systemData;
    this._updateInfoPanel();
    
    // Automatically track the selected system
    if (this.trackedSystem?.key !== systemData.key) {
      this.trackedSystem = systemData;
      if (this.onTrackChange) {
        this.onTrackChange(this.trackedSystem);
      }
      this._updateInfoPanel(); // Update button state
    }
  }

  _updateInfoPanel() {
    if (!this.infoPanel || !this.selectedSystem) {
      return;
    }

    const shipPos = this.shipPositionGetter();
    const distance = shipPos.distanceTo(this.selectedSystem.position);

    if (this.infoName) {
      this.infoName.textContent = this.selectedSystem.name;
    }
    if (this.infoDistance) {
      this.infoDistance.textContent = this._formatDistance(distance);
    }
    if (this.infoPlanets) {
      this.infoPlanets.textContent = `${this.selectedSystem.planetCount} planet${
        this.selectedSystem.planetCount !== 1 ? "s" : ""
      }`;
    }
    if (this.infoStar) {
      const star = this.selectedSystem.star;
      if (star) {
        this.infoStar.textContent = `Star: ${star.colorHex ?? "#ffffff"}`;
        this.infoStar.style.color = star.colorHex ?? "#ffffff";
      }
    }
    if (this.trackButton) {
      const isTracked = this.trackedSystem?.key === this.selectedSystem.key;
      this.trackButton.textContent = isTracked ? "Untrack" : "Track";
      this.trackButton.classList.toggle("map-track-button--tracked", isTracked);
    }

    this.infoPanel.classList.add("map-info-panel--visible");
  }

  _formatDistance(km) {
    if (km < 1) return `${(km * 1000).toFixed(0)} m`;
    if (km < 100) return `${km.toFixed(1)} km`;
    if (km < 100000) return `${km.toFixed(0)} km`;
    return `${(km / 1000).toFixed(1)}k km`;
  }

  _toggleTrack() {
    if (!this.selectedSystem) return;

    if (this.trackedSystem?.key === this.selectedSystem.key) {
      // Untrack
      this.trackedSystem = null;
    } else {
      // Track
      this.trackedSystem = this.selectedSystem;
    }

    if (this.onTrackChange) {
      this.onTrackChange(this.trackedSystem);
    }

    this._updateInfoPanel();
  }

  update() {
    if (!this.isVisible) return;

    // Update ship marker position
    const shipPos = this.shipPositionGetter();
    this.shipMarker.position.copy(shipPos);

    // Update system markers
    const systems = this.universeManager.getAllSystems();
    const currentKeys = new Set(systems.map(s => s.key));

    // Remove markers for systems that no longer exist
    for (const [key, marker] of this.systemMarkers.entries()) {
      if (!currentKeys.has(key)) {
        this.scene.remove(marker.mesh);
        // geometry is shared, don't dispose it here
        marker.mesh.material.dispose();
        this.systemMarkers.delete(key);
      }
    }

    // Add/update markers for current systems
    let markersChanged = false;
    for (const systemData of systems) {
      if (this.systemMarkers.has(systemData.key)) {
        // Update existing marker position
        const marker = this.systemMarkers.get(systemData.key);
        marker.mesh.position.copy(systemData.position);
        marker.systemData = systemData;
      } else {
        // Create new marker
        const marker = this._createSystemMarker(systemData);
        this.scene.add(marker.mesh);
        this.systemMarkers.set(systemData.key, marker);
        markersChanged = true;
      }
    }
    
    if (markersChanged || this.markerMeshes.length !== this.systemMarkers.size) {
      this.markerMeshes = Array.from(this.systemMarkers.values()).map(m => m.mesh);
    }

    // Update controls target to ship position (but allow user to override)
    if (this.controls) {
      const shipPosForCamera = shipPos.clone();
      // Only update target if user hasn't manually moved camera
      if (!this.controls.enabled || this.controls.getDistance() > 50000) {
        this.controls.target.lerp(shipPosForCamera, 0.05);
      }
      this.controls.update();
    }
    
    // Update tracking line in map
    if (this.trackingLine && this.trackedSystem) {
      const targetPos = this.trackedSystem.position;
      const positions = new Float32Array([
        shipPos.x, shipPos.y, shipPos.z,
        targetPos.x, targetPos.y, targetPos.z
      ]);
      this.trackingLine.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
      );
      this.trackingLine.geometry.attributes.position.needsUpdate = true;
      this.trackingLine.visible = true;
    } else if (this.trackingLine) {
      this.trackingLine.visible = false;
    }

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  show() {
    this.isVisible = true;
    
    // Force visibility styles directly
    this.container.style.opacity = "1";
    this.container.style.pointerEvents = "auto";
    this.container.style.display = "block";
    this.container.classList.add("map-overlay--visible");
    
    this.renderer.domElement.style.pointerEvents = "auto";
    this.renderer.domElement.style.display = "block";
    
    // Enable controls
    if (this.controls) {
      this.controls.enabled = true;
    }
    
    // Initialize camera position to show ship
    const shipPos = this.shipPositionGetter();
    this.camera.position.set(
      shipPos.x,
      shipPos.y + 30000,
      shipPos.z + 30000
    );
    if (this.controls) {
      this.controls.target.copy(shipPos);
      this.controls.update();
    }
    
    this._updateSystemMarkers();
    
    // Force an immediate render to ensure the map is visible
    this.update();
  }

  hide() {
    this.isVisible = false;
    this.container.style.opacity = "0";
    this.container.style.pointerEvents = "none";
    this.container.classList.remove("map-overlay--visible");
    this.renderer.domElement.style.pointerEvents = "none";
    
    // Disable controls
    if (this.controls) {
      this.controls.enabled = false;
    }
    
    if (this.infoPanel) {
      this.infoPanel.classList.remove("map-info-panel--visible");
    }
    this.selectedSystem = null;
  }

  _updateSystemMarkers() {
    const systems = this.universeManager.getAllSystems();
    for (const systemData of systems) {
      if (!this.systemMarkers.has(systemData.key)) {
        const marker = this._createSystemMarker(systemData);
        this.scene.add(marker.mesh);
        this.systemMarkers.set(systemData.key, marker);
      }
    }
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    if (this.renderer.domElement) {
      this.renderer.domElement.removeEventListener("mousemove", this._onMouseMove);
      this.renderer.domElement.removeEventListener("click", this._onClick);
    }
    
    if (this.controls) {
      this.controls.dispose();
    }

    for (const marker of this.systemMarkers.values()) {
      this.scene.remove(marker.mesh);
      // Geometry shared, not disposed
      marker.mesh.material.dispose();
    }
    this.systemMarkers.clear();
    this.markerMeshes = [];
    if (this.markerGeometry) {
      this.markerGeometry.dispose();
    }

    if (this.shipMarker) {
      this.scene.remove(this.shipMarker);
      this.shipMarker.geometry.dispose();
      this.shipMarker.material.dispose();
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

