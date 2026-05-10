import {
  tool,
  type JSONValue,
  type Tool,
} from '@strands-agents/sdk';
import maplibregl, {
  type LayerSpecification,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type ProjectionSpecification,
  type StyleSpecification,
} from 'maplibre-gl';
import { LayerControl } from 'maplibre-gl-layer-control';
import { z } from 'zod';

export type JsonObject = Record<string, unknown>;
export type BBox = [number, number, number, number];

interface GeoJsonLayerDefinition {
  id: string;
  suffix: string;
  type: 'fill' | 'line' | 'circle';
  filter: unknown[];
  paint: JsonObject;
}

interface Overlay {
  kind: 'geojson' | 'raster' | 'marker';
  name: string;
  sourceIds: string[];
  layerIds: string[];
  marker?: maplibregl.Marker;
  data?: GeoJSON.GeoJSON;
  url?: string;
  style?: JsonObject;
  attribution?: string;
}

export const DEFAULT_BASEMAPS: Record<string, string | StyleSpecification> = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  demotiles: 'https://demotiles.maplibre.org/style.json',
  openstreetmap: 'osm',
  osm: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: 'OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  },
};

export function numberArg(args: JsonObject, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`Expected numeric argument: ${key}`);
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`Expected finite numeric argument: ${key}`);
  }
  return numberValue;
}

export function stringArg(args: JsonObject, key: string, fallback = ''): string {
  const value = args[key];
  return typeof value === 'string' ? value : fallback;
}

export function objectArg(args: JsonObject, key: string): JsonObject {
  const value = args[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function slug(value: unknown): string {
  return (
    String(value || 'layer')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'layer'
  );
}

export function extendBounds(bounds: BBox | null, coordinate: unknown): BBox | null {
  if (!Array.isArray(coordinate) || coordinate.length < 2) {
    return bounds;
  }
  const lon = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return bounds;
  }
  if (!bounds) {
    return [lon, lat, lon, lat];
  }
  bounds[0] = Math.min(bounds[0], lon);
  bounds[1] = Math.min(bounds[1], lat);
  bounds[2] = Math.max(bounds[2], lon);
  bounds[3] = Math.max(bounds[3], lat);
  return bounds;
}

export function extendGeometryBounds(
  bounds: BBox | null,
  geometry: GeoJSON.Geometry | null | undefined,
): BBox | null {
  if (!geometry) {
    return bounds;
  }
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.reduce(
      (currentBounds, item) => extendGeometryBounds(currentBounds, item),
      bounds,
    );
  }
  const visit = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) {
      return;
    }
    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
      bounds = extendBounds(bounds, coordinates);
      return;
    }
    for (const item of coordinates) {
      visit(item);
    }
  };
  visit(geometry.coordinates);
  return bounds;
}

export function geoJsonBounds(geojson: GeoJSON.GeoJSON | undefined): BBox | null {
  if (!geojson) {
    return null;
  }
  if (Array.isArray(geojson.bbox) && geojson.bbox.length >= 4) {
    const dimension = geojson.bbox.length / 2;
    const bbox = [
      geojson.bbox[0],
      geojson.bbox[1],
      geojson.bbox[dimension],
      geojson.bbox[dimension + 1],
    ].map(Number);
    if (bbox.every(Number.isFinite)) {
      return bbox as BBox;
    }
  }
  if (geojson.type === 'FeatureCollection') {
    return geojson.features.reduce(
      (currentBounds, feature) => extendGeometryBounds(currentBounds, feature.geometry),
      null as BBox | null,
    );
  }
  if (geojson.type === 'Feature') {
    return extendGeometryBounds(null, geojson.geometry);
  }
  return extendGeometryBounds(null, geojson);
}

function collectGeometryTypes(
  types: Set<GeoJSON.GeoJsonGeometryTypes>,
  geometry: GeoJSON.Geometry | null | undefined,
): Set<GeoJSON.GeoJsonGeometryTypes> {
  if (!geometry) {
    return types;
  }
  if (geometry.type === 'GeometryCollection') {
    for (const item of geometry.geometries) {
      collectGeometryTypes(types, item);
    }
    return types;
  }
  types.add(geometry.type);
  return types;
}

export function geoJsonGeometryTypes(
  geojson: GeoJSON.GeoJSON | undefined,
): Set<GeoJSON.GeoJsonGeometryTypes> {
  const types = new Set<GeoJSON.GeoJsonGeometryTypes>();
  if (!geojson) {
    return types;
  }
  if (geojson.type === 'FeatureCollection') {
    for (const feature of geojson.features) {
      collectGeometryTypes(types, feature.geometry);
    }
    return types;
  }
  if (geojson.type === 'Feature') {
    return collectGeometryTypes(types, geojson.geometry);
  }
  return collectGeometryTypes(types, geojson);
}

export function geojsonLayerPaint(style: JsonObject): {
  fill: JsonObject;
  line: JsonObject;
  circle: JsonObject;
} {
  const color =
    stringArg(style, 'color') || stringArg(style, 'line-color') || '#1c7ed6';
  const fillColor = stringArg(style, 'fill-color', stringArg(style, 'fillColor', color));
  const lineColor = stringArg(style, 'line-color', stringArg(style, 'lineColor', color));
  const circleColor = stringArg(
    style,
    'circle-color',
    stringArg(style, 'circleColor', color),
  );
  const opacity = Number(style.opacity ?? style['fill-opacity'] ?? 0.35);
  return {
    fill: {
      'fill-color': fillColor,
      'fill-outline-color': lineColor,
      'fill-opacity': Math.max(0, Math.min(1, opacity)),
    },
    line: {
      'line-color': lineColor,
      'line-width': Number(style['line-width'] ?? style.lineWidth ?? 2),
    },
    circle: {
      'circle-color': circleColor,
      'circle-radius': Number(style['circle-radius'] ?? style.radius ?? 6),
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  };
}

export function geojsonLayerDefs(
  baseId: string,
  paint: ReturnType<typeof geojsonLayerPaint>,
  geojson: GeoJSON.GeoJSON | undefined,
): GeoJsonLayerDefinition[] {
  const geometryTypes = geoJsonGeometryTypes(geojson);
  const hasKnownTypes = geometryTypes.size > 0;
  const hasPolygons =
    !hasKnownTypes ||
    geometryTypes.has('Polygon') ||
    geometryTypes.has('MultiPolygon');
  const hasLines =
    !hasKnownTypes ||
    geometryTypes.has('LineString') ||
    geometryTypes.has('MultiLineString');
  const hasPoints =
    !hasKnownTypes ||
    geometryTypes.has('Point') ||
    geometryTypes.has('MultiPoint');
  const layerDefs: GeoJsonLayerDefinition[] = [];
  if (hasPolygons) {
    layerDefs.push({
      id: `${baseId}-fill`,
      suffix: '-fill',
      type: 'fill',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: paint.fill,
    });
  }
  if (hasLines) {
    layerDefs.push({
      id: `${baseId}-line`,
      suffix: '-line',
      type: 'line',
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: paint.line,
    });
  }
  if (hasPoints) {
    layerDefs.push({
      id: `${baseId}-point`,
      suffix: '-point',
      type: 'circle',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: paint.circle,
    });
  }
  return layerDefs;
}

export function toJsonValue(value: unknown): JSONValue {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as JSONValue;
  } catch {
    return String(value);
  }
}

function basemapStyleUrl(style: string | StyleSpecification): string | undefined {
  return typeof style === 'string' && /^https?:\/\//.test(style) ? style : undefined;
}

export interface MapLibreAgentToolsOptions {
  basemaps?: Record<string, string | StyleSpecification>;
  allowCodeExecution: () => boolean;
  allowDestructiveTools: () => boolean;
}

export class MapLibreAgentTools {
  private readonly map: MapLibreMap;
  private readonly basemaps: Record<string, string | StyleSpecification>;
  private readonly allowCodeExecution: () => boolean;
  private readonly allowDestructiveTools: () => boolean;
  private readonly overlays = new globalThis.Map<string, Overlay>();
  private layerControl: LayerControl | null = null;

  constructor(map: MapLibreMap, options: MapLibreAgentToolsOptions) {
    this.map = map;
    this.basemaps = { ...DEFAULT_BASEMAPS, ...options.basemaps };
    this.allowCodeExecution = options.allowCodeExecution;
    this.allowDestructiveTools = options.allowDestructiveTools;
  }

  destroy(): void {
    this.clearOverlays();
    this.removeLayerControl();
  }

  createTools(): Tool[] {
    const optionalStyleSchema = z
      .record(z.string(), z.any())
      .optional()
      .describe('Optional MapLibre-compatible paint/style values.');
    const tools: Tool[] = [
      tool({
        name: 'list_layers',
        description: 'List layers currently present in the browser MapLibre map.',
        inputSchema: z.object({}),
        callback: () => this.runCommand('list_layers'),
      }),
      tool({
        name: 'get_map_state',
        description: 'Return the browser map camera state, bounds, pitch, bearing, and user layers.',
        inputSchema: z.object({}),
        callback: () => this.runCommand('get_map_state'),
      }),
      tool({
        name: 'set_center',
        description: 'Center the browser map on a latitude/longitude coordinate.',
        inputSchema: z.object({
          lat: z.number().describe('Latitude in decimal degrees.'),
          lon: z.number().describe('Longitude in decimal degrees.'),
          zoom: z.number().optional().describe('Optional zoom level.'),
        }),
        callback: (input) => this.runCommand('set_center', input),
      }),
      tool({
        name: 'fly_to',
        description: 'Animate the browser map to a latitude/longitude coordinate.',
        inputSchema: z.object({
          lat: z.number().describe('Latitude in decimal degrees.'),
          lon: z.number().describe('Longitude in decimal degrees.'),
          zoom: z.number().optional().describe('Optional zoom level.'),
        }),
        callback: (input) => this.runCommand('fly_to', input),
      }),
      tool({
        name: 'set_zoom',
        description: 'Set the browser map zoom level.',
        inputSchema: z.object({
          zoom: z.number().describe('MapLibre zoom level.'),
        }),
        callback: (input) => this.runCommand('set_zoom', input),
      }),
      tool({
        name: 'set_projection',
        description: 'Switch the browser MapLibre map projection between globe and mercator.',
        inputSchema: z.object({
          projection: z
            .enum(['globe', 'mercator'])
            .describe('Projection to use. Use globe for a 3D earth view or mercator for the standard flat map.'),
        }),
        callback: (input) => this.runCommand('set_projection', input),
      }),
      tool({
        name: 'zoom_to_bounds',
        description: 'Zoom the browser map to a west/south/east/north bounding box.',
        inputSchema: z.object({
          west: z.number(),
          south: z.number(),
          east: z.number(),
          north: z.number(),
        }),
        callback: (input) => this.runCommand('zoom_to_bounds', input),
      }),
      tool({
        name: 'change_basemap',
        description: 'Change the browser MapLibre basemap style by URL or known style id.',
        inputSchema: z.object({
          style: z.string().describe('Known style id or MapLibre style URL.'),
        }),
        callback: (input) => this.runCommand('change_basemap', input),
      }),
      tool({
        name: 'add_marker',
        description: 'Add a marker to the browser map.',
        inputSchema: z.object({
          lat: z.number(),
          lon: z.number(),
          popup: z.string().optional(),
          tooltip: z.string().optional(),
          name: z.string().optional(),
          color: z.string().optional(),
        }),
        callback: (input) => this.runCommand('add_marker', input),
      }),
      tool({
        name: 'add_geojson_data',
        description: 'Add an in-memory GeoJSON object to the browser map.',
        inputSchema: z.object({
          data: z.any().describe('GeoJSON Feature, FeatureCollection, or Geometry object.'),
          name: z.string().describe('Layer name.'),
          style: optionalStyleSchema,
        }),
        callback: (input) => this.runCommand('add_geojson_data', input),
      }),
      tool({
        name: 'add_vector_data',
        description: 'Add a GeoJSON URL to the browser map.',
        inputSchema: z.object({
          url: z.string().url().describe('URL to a GeoJSON document.'),
          name: z.string().describe('Layer name.'),
          style: optionalStyleSchema,
        }),
        callback: (input) => this.runCommand('add_vector_data', input),
      }),
      tool({
        name: 'add_xyz_tile_layer',
        description: 'Add an XYZ raster tile layer to the browser map.',
        inputSchema: z.object({
          url: z.string().describe('XYZ tile URL template.'),
          name: z.string().describe('Layer name.'),
          attribution: z.string().optional(),
        }),
        callback: (input) => this.runCommand('add_xyz_tile_layer', input),
      }),
      tool({
        name: 'set_layer_visibility',
        description: 'Show or hide a browser map layer.',
        inputSchema: z.object({
          name: z.string().describe('Layer or overlay name.'),
          visible: z.boolean(),
        }),
        callback: (input) => this.runCommand('set_layer_visibility', input),
      }),
      tool({
        name: 'set_layer_opacity',
        description: 'Set browser map layer opacity between 0 and 1.',
        inputSchema: z.object({
          name: z.string().describe('Layer or overlay name.'),
          opacity: z.number().min(0).max(1),
        }),
        callback: (input) => this.runCommand('set_layer_opacity', input),
      }),
      tool({
        name: 'query_rendered_features',
        description: 'Query rendered features from the browser map.',
        inputSchema: z.object({
          layers: z.array(z.string()).optional(),
          x: z.number().optional().describe('Canvas x coordinate; defaults to map center.'),
          y: z.number().optional().describe('Canvas y coordinate; defaults to map center.'),
        }),
        callback: (input) => this.runCommand('query_rendered_features', input),
      }),
      tool({
        name: 'screenshot_map',
        description: 'Capture the browser map canvas as a PNG data URL.',
        inputSchema: z.object({}),
        callback: () => this.runCommand('screenshot_map'),
      }),
      tool({
        name: 'remove_layer',
        description: 'Remove a user-added layer from the browser map.',
        inputSchema: z.object({
          name: z.string().describe('User-added layer name.'),
        }),
        callback: (input) => {
          this.requireDestructiveApproval('Layer removal');
          return this.runCommand('remove_layer', input);
        },
      }),
      tool({
        name: 'clear_layers',
        description: 'Remove all user-added layers from the browser map.',
        inputSchema: z.object({}),
        callback: () => {
          this.requireDestructiveApproval('Clearing layers');
          return this.runCommand('clear_layers');
        },
      }),
    ];

    if (this.allowCodeExecution()) {
      tools.push(
        tool({
          name: 'run_maplibre_script',
          description:
            'Run a short JavaScript snippet against the live browser MapLibre map when no dedicated tool fits.',
          inputSchema: z.object({
            code: z.string().describe('JavaScript code to execute against map, maplibregl, and helpers.'),
            description: z.string().optional(),
          }),
          callback: (input) => this.runCommand('run_maplibre_script', input),
        }),
      );
    }

    return tools;
  }

  async runCommand(command: string, args: unknown = {}): Promise<JSONValue> {
    return toJsonValue(await this.executeCommand(command, (args ?? {}) as JsonObject));
  }

  private async executeCommand(command: string, args: JsonObject = {}): Promise<unknown> {
    await this.waitForMapIdle();

    if (command === 'list_layers') {
      const styleLayers = (this.map.getStyle().layers ?? []).map((layer) => ({
        id: layer.id,
        type: layer.type,
        source: 'source' in layer ? layer.source : null,
        visible: layer.layout?.visibility !== 'none',
        user_added: this.isOverlayLayerId(layer.id),
      }));
      const markerLayers = Array.from(this.overlays.values())
        .filter((overlay) => overlay.kind === 'marker')
        .map((overlay) => ({
          id: overlay.name,
          type: 'marker',
          source: null,
          visible: true,
          user_added: true,
        }));
      return [...styleLayers, ...markerLayers];
    }

    if (command === 'get_map_state') {
      const center = this.map.getCenter();
      const bounds = this.map.getBounds();
      const projection = this.map.getProjection();
      return {
        center: [center.lng, center.lat],
        zoom: this.map.getZoom(),
        bearing: this.map.getBearing(),
        pitch: this.map.getPitch(),
        projection: projection?.type ?? 'mercator',
        bounds: {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        user_layers: Array.from(this.overlays.keys()),
      };
    }

    if (command === 'set_center') {
      this.map.jumpTo({
        center: [numberArg(args, 'lon'), numberArg(args, 'lat')],
        zoom: args.zoom == null ? this.map.getZoom() : Number(args.zoom),
      });
      return 'Centered map.';
    }

    if (command === 'fly_to') {
      this.map.flyTo({
        center: [numberArg(args, 'lon'), numberArg(args, 'lat')],
        zoom: args.zoom == null ? this.map.getZoom() : Number(args.zoom),
      });
      return 'Moved map.';
    }

    if (command === 'set_zoom') {
      this.map.setZoom(numberArg(args, 'zoom'));
      return 'Zoom updated.';
    }

    if (command === 'set_projection') {
      const projection = stringArg(args, 'projection', 'mercator').trim().toLowerCase();
      if (projection !== 'globe' && projection !== 'mercator') {
        throw new Error(`Unsupported projection: ${projection}. Use globe or mercator.`);
      }
      this.map.setProjection({ type: projection } as ProjectionSpecification);
      return `Projection changed to ${projection}.`;
    }

    if (command === 'zoom_to_bounds') {
      this.map.fitBounds(
        [
          [numberArg(args, 'west'), numberArg(args, 'south')],
          [numberArg(args, 'east'), numberArg(args, 'north')],
        ],
        { padding: 48, maxZoom: 16 },
      );
      return 'Zoomed to bounds.';
    }

    if (command === 'change_basemap') {
      const rawStyle = stringArg(args, 'style', 'liberty').trim();
      let style = this.basemaps[rawStyle.toLowerCase()] ?? rawStyle;
      if (typeof style === 'string' && this.basemaps[style]) {
        style = this.basemaps[style];
      }
      this.removeLayerControl();
      this.map.setStyle(style);
      await new Promise<void>((resolve) => this.map.once('style.load', () => resolve()));
      await this.restoreOverlaysAfterStyleChange();
      this.installLayerControl(style);
      return `Basemap changed to ${rawStyle}.`;
    }

    if (command === 'add_marker') {
      const name = this.addMarkerOverlay(args);
      return `Added marker ${name}.`;
    }

    if (command === 'add_geojson_data') {
      await this.addGeoJsonOverlay({
        name: stringArg(args, 'name', 'geojson'),
        data: args.data as GeoJSON.GeoJSON,
        style: objectArg(args, 'style'),
        zoomTo: true,
      });
      return `Added GeoJSON layer ${stringArg(args, 'name', 'geojson')}.`;
    }

    if (command === 'add_vector_data') {
      await this.addGeoJsonOverlay({
        name: stringArg(args, 'name', 'vector-data'),
        url: stringArg(args, 'url'),
        style: objectArg(args, 'style'),
        zoomTo: true,
      });
      return `Added GeoJSON URL layer ${stringArg(args, 'name', 'vector-data')}.`;
    }

    if (command === 'add_xyz_tile_layer') {
      await this.addRasterOverlay({
        name: stringArg(args, 'name', 'xyz-tiles'),
        url: stringArg(args, 'url'),
        attribution: stringArg(args, 'attribution'),
      });
      return `Added XYZ tile layer ${stringArg(args, 'name', 'xyz-tiles')}.`;
    }

    if (command === 'set_layer_visibility') {
      const name = stringArg(args, 'name');
      const overlay = this.overlays.get(name);
      const visibility = args.visible ? 'visible' : 'none';
      if (overlay) {
        for (const layerId of overlay.layerIds) {
          if (this.map.getLayer(layerId)) {
            this.map.setLayoutProperty(layerId, 'visibility', visibility);
          }
        }
        return `Layer ${name} visibility updated.`;
      }
      if (this.map.getLayer(name)) {
        this.map.setLayoutProperty(name, 'visibility', visibility);
        return `Layer ${name} visibility updated.`;
      }
      throw new Error(`Layer not found: ${name}`);
    }

    if (command === 'set_layer_opacity') {
      const name = stringArg(args, 'name');
      const opacity = Math.max(0, Math.min(1, numberArg(args, 'opacity')));
      const overlay = this.overlays.get(name);
      const layerIds = overlay ? overlay.layerIds : [name];
      let changed = false;
      for (const layerId of layerIds) {
        const layer = this.map.getLayer(layerId);
        if (!layer) {
          continue;
        }
        const prop =
          layer.type === 'raster'
            ? 'raster-opacity'
            : layer.type === 'fill'
              ? 'fill-opacity'
              : layer.type === 'line'
                ? 'line-opacity'
                : layer.type === 'circle'
                  ? 'circle-opacity'
                  : null;
        if (prop) {
          this.map.setPaintProperty(layerId, prop, opacity);
          changed = true;
        }
      }
      if (!changed) {
        throw new Error(`Layer not found or opacity unsupported: ${name}`);
      }
      return `Layer ${name} opacity updated.`;
    }

    if (command === 'query_rendered_features') {
      const canvas = this.map.getCanvas();
      const point: [number, number] =
        args.x == null || args.y == null
          ? [canvas.clientWidth / 2, canvas.clientHeight / 2]
          : [Number(args.x), Number(args.y)];
      const layers: string[] = [];
      if (Array.isArray(args.layers)) {
        for (const requested of args.layers) {
          const layerName = String(requested);
          const overlay = this.overlays.get(layerName);
          if (overlay) {
            layers.push(...overlay.layerIds);
          } else if (this.map.getLayer(layerName)) {
            layers.push(layerName);
          }
        }
      }
      return this.map
        .queryRenderedFeatures(point, layers.length ? { layers } : {})
        .slice(0, 50)
        .map(this.serializableFeature);
    }

    if (command === 'screenshot_map') {
      return {
        data_url: this.map.getCanvas().toDataURL('image/png'),
        width: this.map.getCanvas().width,
        height: this.map.getCanvas().height,
      };
    }

    if (command === 'remove_layer') {
      const name = stringArg(args, 'name');
      if (!this.removeOverlay(name)) {
        throw new Error(`User-added layer not found: ${name}`);
      }
      return `Removed layer ${name}.`;
    }

    if (command === 'clear_layers') {
      this.clearOverlays();
      return 'Cleared user-added layers.';
    }

    if (command === 'run_maplibre_script') {
      if (!this.allowCodeExecution()) {
        throw new Error('MapLibre JavaScript execution is disabled.');
      }
      return this.runMapLibreScript(args);
    }

    throw new Error(`Unsupported command: ${command}`);
  }

  private waitForMapIdle(): Promise<void> {
    return new Promise((resolve) => {
      if (this.map.loaded()) {
        resolve();
        return;
      }
      this.map.once('idle', () => resolve());
    });
  }

  private uniqueSourceId(baseId: string): string {
    let sourceId = baseId;
    let index = 2;
    while (this.map.getSource(sourceId)) {
      sourceId = `${baseId}-${index}`;
      index += 1;
    }
    return sourceId;
  }

  private uniqueLayerBaseId(baseId: string, suffixes: string[]): string {
    let layerBaseId = baseId;
    let index = 2;
    while (suffixes.some((suffix) => this.map.getLayer(`${layerBaseId}${suffix}`))) {
      layerBaseId = `${baseId}-${index}`;
      index += 1;
    }
    return layerBaseId;
  }

  private isOverlayLayerId(layerId: string): boolean {
    return Array.from(this.overlays.values()).some((overlay) =>
      overlay.layerIds.includes(layerId),
    );
  }

  private removeOverlay(name: string): boolean {
    const key = Array.from(this.overlays.keys()).find(
      (item) => item === name || slug(item) === slug(name),
    );
    if (!key) {
      return false;
    }
    const overlay = this.overlays.get(key);
    if (!overlay) {
      return false;
    }
    for (const layerId of overlay.layerIds) {
      if (this.map.getLayer(layerId)) {
        this.map.removeLayer(layerId);
      }
    }
    for (const sourceId of overlay.sourceIds) {
      if (this.map.getSource(sourceId)) {
        this.map.removeSource(sourceId);
      }
    }
    overlay.marker?.remove();
    this.overlays.delete(key);
    return true;
  }

  private clearOverlays(): void {
    for (const name of Array.from(this.overlays.keys())) {
      this.removeOverlay(name);
    }
  }

  private serializableFeature(feature: MapGeoJSONFeature): JsonObject {
    return {
      type: 'Feature',
      geometry: feature.geometry ?? null,
      properties: feature.properties ?? {},
      layer: feature.layer
        ? {
            id: feature.layer.id,
            type: feature.layer.type,
            source: feature.layer.source,
          }
        : undefined,
    };
  }

  private async fetchGeoJson(url: string): Promise<GeoJSON.GeoJSON> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not fetch GeoJSON (${response.status}) from ${url}`);
    }
    return (await response.json()) as GeoJSON.GeoJSON;
  }

  private zoomToGeoJsonBounds(bounds: BBox | null): boolean {
    if (!bounds) {
      return false;
    }
    const [west, south, east, north] = bounds;
    if (![west, south, east, north].every(Number.isFinite)) {
      return false;
    }
    if (west === east && south === north) {
      this.map.easeTo({
        center: [west, south],
        zoom: Math.max(this.map.getZoom(), 12),
      });
      return true;
    }
    this.map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 48, maxZoom: 16 },
    );
    return true;
  }

  private async addGeoJsonOverlay(overlay: {
    name: string;
    data?: GeoJSON.GeoJSON;
    url?: string;
    style?: JsonObject;
    zoomTo?: boolean;
  }): Promise<void> {
    await this.waitForMapIdle();
    this.removeOverlay(overlay.name);
    const sourceId = this.uniqueSourceId(`${slug(overlay.name)}-source`);
    const style = overlay.style ?? {};
    const paint = geojsonLayerPaint(style);
    let sourceData = overlay.data;
    if (!sourceData && overlay.url) {
      try {
        sourceData = await this.fetchGeoJson(overlay.url);
      } catch (error) {
        console.warn(error);
      }
    }
    const initialLayerDefs = geojsonLayerDefs(slug(overlay.name), paint, sourceData);
    const baseId = this.uniqueLayerBaseId(
      slug(overlay.name),
      initialLayerDefs.map((item) => item.suffix),
    );
    const layerDefs = geojsonLayerDefs(baseId, paint, sourceData);
    this.map.addSource(sourceId, {
      type: 'geojson',
      data:
        sourceData ??
        overlay.url ??
        ({ type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection),
    });
    for (const layer of layerDefs) {
      const { suffix: _suffix, ...layerDefinition } = layer;
      this.map.addLayer({
        ...layerDefinition,
        source: sourceId,
      } as LayerSpecification);
    }
    this.overlays.set(overlay.name, {
      kind: 'geojson',
      name: overlay.name,
      data: overlay.data,
      url: overlay.url,
      style,
      sourceIds: [sourceId],
      layerIds: layerDefs.map((item) => item.id),
    });
    if (overlay.zoomTo) {
      this.zoomToGeoJsonBounds(geoJsonBounds(sourceData ?? overlay.data));
    }
  }

  private async addRasterOverlay(overlay: {
    name: string;
    url: string;
    attribution?: string;
  }): Promise<void> {
    await this.waitForMapIdle();
    this.removeOverlay(overlay.name);
    const sourceId = this.uniqueSourceId(`${slug(overlay.name)}-source`);
    const layerId = this.uniqueLayerBaseId(slug(overlay.name), ['']);
    this.map.addSource(sourceId, {
      type: 'raster',
      tiles: [overlay.url],
      tileSize: 256,
      attribution: overlay.attribution ?? '',
    });
    this.map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
    });
    this.overlays.set(overlay.name, {
      kind: 'raster',
      name: overlay.name,
      url: overlay.url,
      attribution: overlay.attribution,
      sourceIds: [sourceId],
      layerIds: [layerId],
    });
  }

  private addMarkerOverlay(args: JsonObject): string {
    const name = stringArg(args, 'name', `marker-${this.overlays.size + 1}`);
    this.removeOverlay(name);
    const marker = new maplibregl.Marker({
      color: stringArg(args, 'color', '#3388ff'),
    })
      .setLngLat([numberArg(args, 'lon'), numberArg(args, 'lat')])
      .addTo(this.map);
    marker.getElement().title =
      stringArg(args, 'tooltip') || stringArg(args, 'popup') || name;
    const popup = stringArg(args, 'popup');
    if (popup) {
      marker.setPopup(new maplibregl.Popup().setText(popup));
    }
    this.overlays.set(name, {
      kind: 'marker',
      name,
      marker,
      sourceIds: [],
      layerIds: [],
    });
    return name;
  }

  private async runMapLibreScript(args: JsonObject): Promise<JsonObject> {
    const code = stringArg(args, 'code').trim();
    if (!code) {
      throw new Error('No MapLibre JavaScript code was provided.');
    }
    const description = stringArg(args, 'description');
    const helpers = Object.freeze({
      overlayNames: () => Array.from(this.overlays.keys()),
      waitForMapIdle: () => this.waitForMapIdle(),
      slug,
      removeOverlay: (name: string) => {
        this.requireDestructiveApproval('Layer removal');
        return this.removeOverlay(name);
      },
      addGeoJsonOverlay: (overlay: {
        name: string;
        data?: GeoJSON.GeoJSON;
        url?: string;
        style?: JsonObject;
        zoomTo?: boolean;
      }) => this.addGeoJsonOverlay(overlay),
      addRasterOverlay: (overlay: { name: string; url: string; attribution?: string }) =>
        this.addRasterOverlay(overlay),
      addMarkerOverlay: (input: JsonObject) => this.addMarkerOverlay(input),
      serializeScriptResult: toJsonValue,
    });
    const fn = new Function(
      'map',
      'maplibregl',
      'helpers',
      `"use strict"; return (async () => {\n${code}\n})()`,
    ) as (
      map: MapLibreMap,
      maplibreglApi: typeof maplibregl,
      helpersArg: Record<string, unknown>,
    ) => Promise<unknown>;
    const result = await fn(this.map, maplibregl, helpers);
    return {
      success: true,
      message: description || 'MapLibre script executed.',
      result: toJsonValue(result),
      description,
      maplibre_script: code,
    };
  }

  private async restoreOverlaysAfterStyleChange(): Promise<void> {
    const saved = Array.from(this.overlays.values()).map((overlay) => ({ ...overlay }));
    this.overlays.clear();
    for (const overlay of saved) {
      if (overlay.kind === 'geojson') {
        await this.addGeoJsonOverlay({
          name: overlay.name,
          data: overlay.data,
          url: overlay.url,
          style: overlay.style,
        });
      } else if (overlay.kind === 'raster' && overlay.url) {
        await this.addRasterOverlay({
          name: overlay.name,
          url: overlay.url,
          attribution: overlay.attribution,
        });
      } else if (overlay.kind === 'marker' && overlay.marker) {
        overlay.marker.addTo(this.map);
        this.overlays.set(overlay.name, overlay);
      }
    }
  }

  private installLayerControl(style: string | StyleSpecification): void {
    const styleUrl = basemapStyleUrl(style);
    if (!styleUrl) {
      return;
    }
    this.layerControl = new LayerControl({
      collapsed: true,
      basemapStyleUrl: styleUrl,
      panelWidth: 320,
      panelMinWidth: 240,
      panelMaxWidth: 420,
    });
    this.map.addControl(this.layerControl, 'top-right');
  }

  private removeLayerControl(): void {
    if (!this.layerControl) {
      return;
    }
    this.map.removeControl(this.layerControl);
    this.layerControl = null;
  }

  private requireDestructiveApproval(action: string): void {
    if (!this.allowDestructiveTools()) {
      throw new Error(`${action} is disabled. Enable layer removal first.`);
    }
  }
}
