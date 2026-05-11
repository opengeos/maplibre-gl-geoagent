import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapLibreAgentTools } from "../src/lib/core/maplibre-tools";
import {
  EarthEngineService,
  parseCommunityGeeCatalog,
  parseOfficialGeeCatalog,
} from "../src/lib/core/earth-engine";

class MockEeObject {
  constructor(
    readonly kind: string,
    readonly value?: unknown,
    readonly ops: string[] = [],
  ) {}

  serialize() {
    return JSON.stringify({ kind: this.kind, value: this.value, ops: this.ops });
  }

  getMap(visParams: Record<string, unknown>, callback?: (value: unknown) => void) {
    const result = {
      tile_fetcher: {
        url_format: `https://earthengine.test/${this.kind}/{z}/{x}/{y}.png?vis=${encodeURIComponent(JSON.stringify(visParams))}`,
      },
    };
    callback?.(result);
    return result;
  }

  evaluate(success: (value: unknown) => void) {
    success({ band_mean: 42 });
  }

  getInfo() {
    return { type: this.kind };
  }

  chain(method: string, ...args: unknown[]) {
    return new MockEeObject(this.kind, this.value, [
      ...this.ops,
      `${method}:${JSON.stringify(args)}`,
    ]);
  }

  filterDate(...args: unknown[]) {
    return this.chain("filterDate", ...args);
  }

  filterBounds(...args: unknown[]) {
    return this.chain("filterBounds", ...args);
  }

  filter(...args: unknown[]) {
    return this.chain("filter", ...args);
  }

  map(...args: unknown[]) {
    return this.chain("map", args.length);
  }

  reduce(...args: unknown[]) {
    return this.chain("reduce", ...args);
  }

  mosaic() {
    return this.chain("mosaic");
  }

  median() {
    return this.chain("median");
  }

  mean() {
    return this.chain("mean");
  }

  min() {
    return this.chain("min");
  }

  max() {
    return this.chain("max");
  }

  first() {
    return this.chain("first");
  }

  select(...args: unknown[]) {
    return this.chain("select", ...args);
  }

  updateMask(...args: unknown[]) {
    return this.chain("updateMask", ...args);
  }

  lt(...args: unknown[]) {
    return this.chain("lt", ...args);
  }

  neq(...args: unknown[]) {
    return this.chain("neq", ...args);
  }

  remap(...args: unknown[]) {
    return this.chain("remap", ...args);
  }

  rename(...args: unknown[]) {
    return this.chain("rename", ...args);
  }

  clipToCollection(...args: unknown[]) {
    return this.chain("clipToCollection", ...args);
  }

  normalizedDifference(...args: unknown[]) {
    return this.chain("normalizedDifference", ...args);
  }

  geometry() {
    return this.chain("geometry");
  }

  reduceRegion(...args: unknown[]) {
    return new MockEeObject("Dictionary", args);
  }

  style(...args: unknown[]) {
    return this.chain("style", ...args);
  }

  combine(...args: unknown[]) {
    return this.chain("combine", ...args);
  }
}

const mockEe = {
  data: {
    authenticateViaOauth: vi.fn(
      (
        _clientId: string,
        success?: () => void,
        _failure?: (error: unknown) => void,
      ) => success?.(),
    ),
    authenticateViaPopup: vi.fn((success?: () => void) => success?.()),
    getAsset: vi.fn(
      (
        _assetId: string,
        success?: (asset: Record<string, unknown>) => void,
      ) => success?.({ type: "IMAGE_COLLECTION" }),
    ),
    getAuthToken: vi.fn(() => null as string | null),
    getAuthClientId: vi.fn(() => null as string | null),
    clearAuthToken: vi.fn(),
  },
  initialize: vi.fn(
    (
      _baseUrl?: string | null,
      _tileUrl?: string | null,
      success?: () => void,
    ) => success?.(),
  ),
  Image: function Image(asset: unknown) {
    return new MockEeObject("Image", asset);
  },
  ImageCollection: function ImageCollection(asset: unknown) {
    return new MockEeObject("ImageCollection", asset);
  },
  FeatureCollection: function FeatureCollection(asset: unknown) {
    return new MockEeObject("FeatureCollection", asset);
  },
  Geometry: {
    Rectangle: (bbox: number[]) => new MockEeObject("Geometry", bbox),
  },
  Filter: {
    eq: (property: string, value: unknown) =>
      new MockEeObject("Filter", { op: "eq", property, value }),
    lt: (property: string, value: unknown) =>
      new MockEeObject("Filter", { op: "lt", property, value }),
  },
  Reducer: {
    mean: () => new MockEeObject("Reducer", "mean"),
    min: () => new MockEeObject("Reducer", "min"),
    max: () => new MockEeObject("Reducer", "max"),
    median: () => new MockEeObject("Reducer", "median"),
    stdDev: () => new MockEeObject("Reducer", "stdDev"),
    sum: () => new MockEeObject("Reducer", "sum"),
    count: () => new MockEeObject("Reducer", "count"),
    mode: () => new MockEeObject("Reducer", "mode"),
  },
};

vi.mock("@google/earthengine", () => ({ default: mockEe }));

beforeEach(() => {
  delete (globalThis as typeof globalThis & { ee?: unknown }).ee;
  mockEe.data.authenticateViaOauth.mockReset();
  mockEe.data.authenticateViaOauth.mockImplementation(
    (
      _clientId: string,
      success?: () => void,
      _failure?: (error: unknown) => void,
    ) => success?.(),
  );
  mockEe.data.authenticateViaPopup.mockReset();
  mockEe.data.authenticateViaPopup.mockImplementation(
    (success?: () => void) => success?.(),
  );
  mockEe.data.getAsset.mockReset();
  mockEe.data.getAsset.mockImplementation(
    (
      _assetId: string,
      success?: (asset: Record<string, unknown>) => void,
    ) => success?.({ type: "IMAGE_COLLECTION" }),
  );
  mockEe.data.getAuthToken.mockReset();
  mockEe.data.getAuthToken.mockReturnValue(null);
  mockEe.data.getAuthClientId.mockReset();
  mockEe.data.getAuthClientId.mockReturnValue(null);
  mockEe.data.clearAuthToken.mockReset();
  mockEe.initialize.mockReset();
  mockEe.initialize.mockImplementation(
    (
      _baseUrl?: string | null,
      _tileUrl?: string | null,
      success?: () => void,
    ) => success?.(),
  );
});

class MockAgentMap {
  sources: Record<string, Record<string, unknown>> = {};
  layers: Array<Record<string, unknown> & { id: string; type: string }> = [];
  readonly loaded = vi.fn(() => true);
  readonly once = vi.fn((_event: string, callback: () => void) => callback());
  readonly fitBounds = vi.fn();

  getStyle() {
    return { version: 8, sources: this.sources, layers: this.layers };
  }

  getSource(sourceId: string) {
    return this.sources[sourceId];
  }

  addSource(sourceId: string, source: Record<string, unknown>) {
    this.sources[sourceId] = { ...source };
  }

  removeSource(sourceId: string) {
    delete this.sources[sourceId];
  }

  getLayer(layerId: string) {
    return this.layers.find((layer) => layer.id === layerId);
  }

  addLayer(layer: Record<string, unknown> & { id: string; type: string }) {
    this.layers.push({ ...layer });
  }

  removeLayer(layerId: string) {
    this.layers = this.layers.filter((layer) => layer.id !== layerId);
  }
}

class CatalogTestService extends EarthEngineService {
  constructor(private readonly datasets: Array<{ id: string; title: string; source: "official" | "community"; type: string }>) {
    super();
  }

  override async catalog() {
    return this.datasets;
  }
}

describe("Earth Engine catalog helpers", () => {
  it("parses official and community catalog formats", () => {
    const official = parseOfficialGeeCatalog(
      JSON.stringify([
        {
          id: "NASA/SRTMGL1_003",
          title: "SRTM Digital Elevation",
          type: "image",
          category: "elevation-topography",
          keywords: ["dem"],
        },
        { id: "DEPRECATED", deprecated: true },
      ]),
      "json",
    );
    const community = parseCommunityGeeCatalog(
      "id,title,type,provider\nusers/example/water,Water Map,Image,Example",
      "csv",
    );

    expect(official).toHaveLength(1);
    expect(official[0]).toMatchObject({
      id: "NASA/SRTMGL1_003",
      type: "Image",
      category: "Elevation & Topography",
      source: "official",
    });
    expect(community[0]).toMatchObject({
      id: "users/example/water",
      type: "Image",
      source: "community",
    });
  });

  it("ranks search results and prefers official datasets on ties", async () => {
    const service = new CatalogTestService([
      {
        id: "COPERNICUS/S2_SR_HARMONIZED",
        title: "Sentinel-2 Surface Reflectance",
        source: "official",
        type: "ImageCollection",
      },
      {
        id: "users/example/custom",
        title: "Sentinel-2 Surface Reflectance",
        source: "community",
        type: "ImageCollection",
      },
    ]);

    const result = await service.searchDatasets({
      query: "sentinel surface reflectance",
      max_results: 2,
    });

    expect(result.count).toBe(2);
    expect(result.datasets[0].source).toBe("official");
  });

  it("surfaces Earth Engine getMapId callback errors", async () => {
    const service = new EarthEngineService();
    await expect(
      service.getTileUrl(
        {
          getMap: (_visParams, callback) => {
            callback?.(undefined, "Permission denied");
          },
        },
        {},
      ),
    ).rejects.toThrow(/Permission denied/);
  });

  it("reuses an existing Earth Engine auth token without opening OAuth", async () => {
    mockEe.data.getAuthToken.mockReturnValue("Bearer existing-token");
    mockEe.data.getAuthClientId.mockReturnValue("client");
    const service = new EarthEngineService({
      oauthClientId: "client",
      projectId: "project",
    });

    await service.initialize();
    await service.initialize();

    expect(mockEe.data.authenticateViaOauth).not.toHaveBeenCalled();
    expect(mockEe.data.authenticateViaPopup).not.toHaveBeenCalled();
    expect(mockEe.initialize).toHaveBeenCalledTimes(1);
  });

  it("does not reuse an Earth Engine auth token from a different OAuth client", async () => {
    mockEe.data.getAuthToken.mockReturnValue("Bearer existing-token");
    mockEe.data.getAuthClientId.mockReturnValue("home-assistant-client");
    const service = new EarthEngineService({
      oauthClientId: "gee-agent-client",
      projectId: "project",
    });

    await service.initialize();

    expect(mockEe.data.clearAuthToken).toHaveBeenCalledTimes(1);
    expect(mockEe.data.authenticateViaOauth).toHaveBeenCalledWith(
      "gee-agent-client",
      expect.any(Function),
      expect.any(Function),
      undefined,
      expect.any(Function),
    );
  });

  it("deduplicates concurrent Earth Engine initialization", async () => {
    let resolveOauth: (() => void) | undefined;
    mockEe.data.authenticateViaOauth.mockImplementation(
      (
        _clientId: string,
        success?: () => void,
      ) => {
        resolveOauth = success;
      },
    );
    const service = new EarthEngineService({
      oauthClientId: "client",
      projectId: "project",
    });

    const first = service.initialize();
    const second = service.initialize();
    for (let attempt = 0; attempt < 10 && !resolveOauth; attempt += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    expect(resolveOauth).toBeTypeOf("function");
    resolveOauth?.();
    await Promise.all([first, second]);

    expect(mockEe.data.authenticateViaOauth).toHaveBeenCalledTimes(1);
    expect(mockEe.initialize).toHaveBeenCalledTimes(1);
  });

  it("adds setup guidance to the Earth Engine Classifier initialization error", async () => {
    mockEe.data.getAuthToken.mockReturnValue("Bearer existing-token");
    mockEe.initialize.mockImplementation(
      (
        _baseUrl?: string | null,
        _tileUrl?: string | null,
        _success?: () => void,
        failure?: (error: unknown) => void,
      ) => {
        failure?.(
          new Error("Cannot use 'in' operator to search for 'Classifier' in undefined"),
        );
      },
    );
    const service = new EarthEngineService({
      oauthClientId: "client",
      projectId: "project",
    });

    await expect(service.initialize()).rejects.toThrow(
      /Earth Engine initialization failed while loading the API algorithms registry/,
    );
  });

  it("exposes the module import as global ee before initialization", async () => {
    mockEe.data.getAuthToken.mockReturnValue("Bearer existing-token");
    mockEe.initialize.mockImplementation(
      (
        _baseUrl?: string | null,
        _tileUrl?: string | null,
        success?: () => void,
        failure?: (error: unknown) => void,
      ) => {
        if ((globalThis as typeof globalThis & { ee?: unknown }).ee === mockEe) {
          success?.();
          return;
        }
        failure?.(
          new Error("Cannot use 'in' operator to search for 'Classifier' in undefined"),
        );
      },
    );
    const service = new EarthEngineService({
      oauthClientId: "client",
      projectId: "project",
    });

    await expect(service.initialize()).resolves.toMatchObject({
      success: true,
      project_id: "project",
    });
    expect((globalThis as typeof globalThis & { ee?: unknown }).ee).toBe(mockEe);
  });
});

describe("MapLibreAgentTools Earth Engine tools", () => {
  it("registers Earth Engine tools when configured", () => {
    const agent = new MapLibreAgentTools(new MockAgentMap() as never, {
      allowCodeExecution: () => true,
      allowDestructiveTools: () => true,
      earthEngine: { oauthClientId: "client", projectId: "project" },
    });

    const names = (agent.createTools() as Array<{ name: string }>).map(
      (item) => item.name,
    );

    expect(names).toEqual(
      expect.arrayContaining([
        "initialize_earth_engine",
        "search_gee_datasets",
        "load_gee_dataset",
        "calculate_gee_normalized_difference",
        "run_gee_javascript_snippet",
      ]),
    );
  });

  it("loads, restyles, lists, and removes Earth Engine raster overlays", async () => {
    const map = new MockAgentMap();
    const onStateDataChange = vi.fn();
    const agent = new MapLibreAgentTools(map as never, {
      allowCodeExecution: () => true,
      allowDestructiveTools: () => true,
      earthEngine: { oauthClientId: "client", projectId: "project" },
      onStateDataChange,
    });

    await agent.runCommand("initialize_earth_engine", {});
    const loaded = await agent.runCommand("load_gee_dataset", {
      asset_id: "NASA/SRTMGL1_003",
      asset_type: "Image",
      layer_name: "SRTM",
      min_value: 0,
      max_value: 3000,
      palette: "terrain",
    });

    expect(loaded).toMatchObject({
      success: true,
      layer_name: "SRTM",
      asset_type: "Image",
    });
    expect(map.getSource("srtm-source")).toMatchObject({
      type: "raster",
      tileSize: 256,
    });

    const listed = await agent.runCommand("list_loaded_gee_layers");
    expect(listed).toMatchObject({ count: 1 });

    const styled = await agent.runCommand("set_gee_layer_visualization", {
      layer_name: "SRTM",
      palette: "viridis",
    });
    expect(styled).toMatchObject({ success: true, layer_name: "SRTM" });

    await agent.runCommand("remove_layer", { name: "SRTM" });
    const afterRemove = await agent.runCommand("list_loaded_gee_layers");
    expect(afterRemove).toMatchObject({ count: 0 });
    expect(onStateDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        earthEngine: expect.objectContaining({ initialized: true }),
      }),
    );
  });

  it("runs Earth Engine snippets and calculates mocked statistics", async () => {
    const map = new MockAgentMap();
    const agent = new MapLibreAgentTools(map as never, {
      allowCodeExecution: () => true,
      allowDestructiveTools: () => true,
      earthEngine: { oauthClientId: "client", projectId: "project" },
    });

    const snippet = await agent.runCommand("run_gee_javascript_snippet", {
      code: "await addLayer(new ee.Image('SRTM'), {min: 0, max: 1}, 'Snippet SRTM');",
    });
    expect(snippet).toMatchObject({
      success: true,
      layers_added: [{ name: "Snippet SRTM" }],
    });

    const statistics = await agent.runCommand("calculate_gee_layer_statistics", {
      layer_name: "Snippet SRTM",
      statistics: "mean",
      scale: 1000,
    });
    expect(statistics).toMatchObject({
      success: true,
      layer_name: "Snippet SRTM",
      values: { band_mean: 42 },
      mean: 42,
    });
  });
});
