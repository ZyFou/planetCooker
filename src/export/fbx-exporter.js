import * as THREE from "three";

const HEADER = "; FBX 7.4.0 project file\n";

function toFbxTimeStamp(date = new Date()) {
  return {
    Year: date.getUTCFullYear(),
    Month: date.getUTCMonth() + 1,
    Day: date.getUTCDate(),
    Hour: date.getUTCHours(),
    Minute: date.getUTCMinutes(),
    Second: date.getUTCSeconds(),
    Millisecond: date.getUTCMilliseconds()
  };
}

class FBXBuilder {
  constructor() {
    this.lines = [HEADER.trimEnd()];
    this.level = 0;
  }

  write(line = "") {
    if (line.length === 0) {
      this.lines.push("");
    } else {
      this.lines.push(`${"  ".repeat(this.level)}${line}`);
    }
  }

  open(line) {
    this.write(`${line} {`);
    this.level += 1;
  }

  close() {
    this.level = Math.max(0, this.level - 1);
    this.write("}");
  }

  toString() {
    return this.lines.join("\n");
  }
}

function formatFloat(value) {
  return Number.parseFloat(value).toFixed(6);
}

function collectMeshData(root) {
  const meshes = [];
  root.updateMatrixWorld(true);

  root.traverse((object) => {
    if (!object.isMesh) return;
    if (!object.geometry?.getAttribute("position")) return;

    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    const buffer = geometry.toNonIndexed();

    if (!buffer.getAttribute("normal")) {
      buffer.computeVertexNormals();
    }

    const position = buffer.getAttribute("position");
    const normal = buffer.getAttribute("normal");
    const colorAttr = buffer.getAttribute("color");

    const vertexCount = position.count;
    const vertices = new Array(vertexCount * 3);
    const normals = new Array(vertexCount * 3);
    const colors = new Array(vertexCount * 4);

    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    const baseColor = material?.color ? material.color.clone() : new THREE.Color(0.8, 0.8, 0.8);
    const opacity = material?.opacity ?? 1;

    for (let i = 0; i < vertexCount; i += 1) {
      vertices[i * 3 + 0] = position.getX(i);
      vertices[i * 3 + 1] = position.getY(i);
      vertices[i * 3 + 2] = position.getZ(i);

      normals[i * 3 + 0] = normal.getX(i);
      normals[i * 3 + 1] = normal.getY(i);
      normals[i * 3 + 2] = normal.getZ(i);

      if (colorAttr) {
        colors[i * 4 + 0] = colorAttr.getX(i);
        colors[i * 4 + 1] = colorAttr.getY(i);
        colors[i * 4 + 2] = colorAttr.getZ(i);
        colors[i * 4 + 3] = colorAttr.itemSize > 3 ? colorAttr.getW(i) : opacity;
      } else {
        colors[i * 4 + 0] = baseColor.r;
        colors[i * 4 + 1] = baseColor.g;
        colors[i * 4 + 2] = baseColor.b;
        colors[i * 4 + 3] = opacity;
      }
    }

    const polygons = [];
    for (let i = 0; i < vertexCount; i += 3) {
      polygons.push(i, i + 1, -((i + 2) + 1));
    }

    meshes.push({
      name: object.name || `Mesh_${meshes.length + 1}`,
      vertices,
      normals,
      colors,
      polygons,
      material
    });
  });

  return meshes;
}

function arrayToFbxString(array) {
  const formatted = new Array(array.length);
  for (let i = 0; i < array.length; i += 1) {
    formatted[i] = formatFloat(array[i]);
  }
  return formatted.join(",");
}

function colorsToFbxString(array) {
  const parts = [];
  for (let i = 0; i < array.length; i += 4) {
    parts.push(
      `${formatFloat(array[i])},${formatFloat(array[i + 1])},${formatFloat(array[i + 2])},${formatFloat(array[i + 3])}`
    );
  }
  return parts.join(",");
}

function buildFBX(root, sceneName = "Scene") {
  const meshes = collectMeshData(root);
  const builder = new FBXBuilder();
  const timestamp = toFbxTimeStamp();

  builder.open("FBXHeaderExtension:");
  builder.write("FBXHeaderVersion: 1003");
  builder.write("FBXVersion: 7400");
  builder.write('Creator: "Procedural Planet Studio"');
  builder.open("CreationTimeStamp:");
  builder.write("Version: 1000");
  builder.write(`Year: ${timestamp.Year}`);
  builder.write(`Month: ${timestamp.Month}`);
  builder.write(`Day: ${timestamp.Day}`);
  builder.write(`Hour: ${timestamp.Hour}`);
  builder.write(`Minute: ${timestamp.Minute}`);
  builder.write(`Second: ${timestamp.Second}`);
  builder.write(`Millisecond: ${timestamp.Millisecond}`);
  builder.close();
  builder.close();

  builder.open("GlobalSettings:");
  builder.write("Version: 1000");
  builder.open("Properties70:");
  builder.write('P: "UpAxis", "int", "Integer", "",1');
  builder.write('P: "UpAxisSign", "int", "Integer", "",1');
  builder.write('P: "FrontAxis", "int", "Integer", "",2');
  builder.write('P: "FrontAxisSign", "int", "Integer", "",1');
  builder.write('P: "CoordAxis", "int", "Integer", "",0');
  builder.write('P: "CoordAxisSign", "int", "Integer", "",1');
  builder.write('P: "UnitScaleFactor", "double", "Number", "",1');
  builder.close();
  builder.close();

  builder.open("Documents:");
  builder.open(`Document: 0, \"Document::${sceneName}\", \"\"`);
  builder.write("Version: 100");
  builder.write("RootNode: 0");
  builder.close();
  builder.close();

  builder.open("Definitions:");
  builder.write("Version: 100");
  builder.write(`Count: ${meshes.length * 3 + 1}`);

  builder.open('ObjectType: "Model"');
  builder.write(`Count: ${meshes.length + 1}`);
  builder.close();

  builder.open('ObjectType: "Geometry"');
  builder.write(`Count: ${meshes.length}`);
  builder.close();

  builder.open('ObjectType: "Material"');
  builder.write(`Count: ${meshes.length}`);
  builder.close();

  builder.close();

  const rootModelId = 5000000;
  const connections = [["OO", rootModelId, 0]];

  builder.open("Objects:");
  builder.open(`Model: ${rootModelId}, \"Model::${sceneName}\", \"Null\"`);
  builder.write("Version: 232");
  builder.open("Properties70:");
  builder.write('P: "RotationOrder", "enum", "", "",0');
  builder.write('P: "DefaultAttributeIndex", "int", "Integer", "",0');
  builder.close();
  builder.write("Shading: T");
  builder.write('Culling: "CullingOff"');
  builder.close();

  meshes.forEach((mesh, index) => {
    const geometryId = 6000000 + index;
    const modelId = 7000000 + index;
    const materialId = 8000000 + index;

    builder.open(`Geometry: ${geometryId}, \"Geometry::${mesh.name}\", \"Mesh\"`);
    builder.write(`Vertices: *${mesh.vertices.length} { a: ${arrayToFbxString(mesh.vertices)} }`);
    builder.write(`PolygonVertexIndex: *${mesh.polygons.length} { a: ${mesh.polygons.join(",")} }`);
    builder.write("GeometryVersion: 124");

    builder.open("LayerElementNormal: 0");
    builder.write("Version: 101");
    builder.write('Name: ""');
    builder.write('MappingInformationType: "ByVertice"');
    builder.write('ReferenceInformationType: "Direct"');
    builder.write(`Normals: *${mesh.normals.length} { a: ${arrayToFbxString(mesh.normals)} }`);
    builder.close();

    builder.open("LayerElementColor: 0");
    builder.write("Version: 101");
    builder.write('Name: ""');
    builder.write('MappingInformationType: "ByVertice"');
    builder.write('ReferenceInformationType: "Direct"');
    builder.write(`Colors: *${mesh.colors.length} { a: ${colorsToFbxString(mesh.colors)} }`);
    builder.close();

    builder.open("LayerElementMaterial: 0");
    builder.write("Version: 101");
    builder.write('Name: ""');
    builder.write('MappingInformationType: "AllSame"');
    builder.write('ReferenceInformationType: "IndexToDirect"');
    builder.write("Materials: *1 { a: 0 }");
    builder.close();

    builder.open("Layer: 0");
    builder.write("Version: 100");
    builder.open("LayerElement");
    builder.write('Type: "LayerElementNormal"');
    builder.write("TypedIndex: 0");
    builder.close();
    builder.open("LayerElement");
    builder.write('Type: "LayerElementColor"');
    builder.write("TypedIndex: 0");
    builder.close();
    builder.open("LayerElement");
    builder.write('Type: "LayerElementMaterial"');
    builder.write("TypedIndex: 0");
    builder.close();
    builder.close();

    builder.close();

    builder.open(`Model: ${modelId}, \"Model::${mesh.name}\", \"Mesh\"`);
    builder.write("Version: 232");
    builder.open("Properties70:");
    builder.write('P: "RotationOrder", "enum", "", "",0');
    builder.write('P: "InheritType", "enum", "", "",1');
    builder.write('P: "DefaultAttributeIndex", "int", "Integer", "",0');
    builder.close();
    builder.write("Shading: T");
    builder.write('Culling: "CullingOff"');
    builder.close();

    builder.open(`Material: ${materialId}, \"Material::${mesh.name}\", \"Lambert\"`);
    builder.write("Version: 102");
    builder.write('ShadingModel: "lambert"');
    builder.open("Properties70:");
    const matColor = mesh.material?.color || new THREE.Color(0.8, 0.8, 0.8);
    builder.write(`P: "DiffuseColor", "Color", "", "",${formatFloat(matColor.r)},${formatFloat(matColor.g)},${formatFloat(matColor.b)}`);
    builder.write('P: "DiffuseFactor", "Number", "", "",1');
    builder.write('P: "TransparencyFactor", "Number", "", "",0');
    builder.write('P: "AmbientColor", "Color", "", "",0,0,0');
    builder.close();
    builder.close();

    connections.push(["OO", geometryId, modelId]);
    connections.push(["OO", materialId, modelId]);
    connections.push(["OO", modelId, rootModelId]);
  });

  builder.close();

  builder.open("Connections:");
  connections.forEach(([type, from, to]) => {
    builder.write(`C: \"${type}\",${from},${to}`);
  });
  builder.close();

  return builder.toString();
}

export function exportFBX(root, { sceneName = "PlanetSystem" } = {}) {
  const content = buildFBX(root, sceneName);
  return new Blob([content], { type: "application/octet-stream" });
}