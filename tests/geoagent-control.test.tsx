import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeoAgentControl } from "../src";
import { GeoAgentControlReact } from "../src/react";
import {
  extendBounds,
  geoJsonBounds,
  geoJsonGeometryTypes,
  geojsonLayerDefs,
  geojsonLayerPaint,
  MapLibreAgentTools,
  numberArg,
  objectArg,
  slug,
  toJsonValue,
} from "../src/lib/core/maplibre-tools";

class MockMap {
  readonly mapContainer = document.createElement("div");
  readonly controlStack = document.createElement("div");
  readonly controls = new Set<unknown>();
  readonly on = vi.fn();
  readonly off = vi.fn();
  readonly once = vi.fn();
  readonly loaded = vi.fn(() => true);

  constructor(positionClass = "maplibregl-ctrl-top-left") {
    this.mapContainer.className = "map";
    this.controlStack.className = positionClass;
    this.mapContainer.appendChild(this.controlStack);
    document.body.appendChild(this.mapContainer);
  }

  getContainer() {
    return this.mapContainer;
  }

  getStyle() {
    return {
      version: 8,
      sources: {},
      layers: [],
    };
  }

  addControl(
    control: { onAdd: (map: unknown) => HTMLElement },
    _position?: string,
  ) {
    this.controls.add(control);
    this.controlStack.appendChild(control.onAdd(this));
  }

  removeControl(control: { onRemove: () => void }) {
    control.onRemove();
    this.controls.delete(control);
  }

  hasControl(control: unknown) {
    return this.controls.has(control);
  }

  cleanup() {
    this.mapContainer.remove();
  }
}

class MockAgentMap {
  sources: Record<string, Record<string, unknown>> = {};
  layers: Array<Record<string, unknown> & { id: string; type: string }> = [];
  terrain: unknown = undefined;
  sky: unknown = undefined;
  readonly loaded = vi.fn(() => true);
  readonly fitBounds = vi.fn();
  readonly easeTo = vi.fn();
  readonly flyTo = vi.fn();
  readonly jumpTo = vi.fn();
  readonly setZoom = vi.fn();
  readonly getZoom = vi.fn(() => 5);
  readonly setProjection = vi.fn();

  getStyle() {
    return {
      version: 8,
      sources: this.sources,
      layers: this.layers,
    };
  }

  getSource(sourceId: string) {
    return this.sources[sourceId];
  }

  addSource(sourceId: string, source: Record<string, unknown>) {
    const sourceRecord = { ...source };
    if (sourceRecord.type === "geojson") {
      sourceRecord.setData = (data: GeoJSON.GeoJSON) => {
        sourceRecord.data = data;
      };
    }
    this.sources[sourceId] = sourceRecord;
  }

  removeSource(sourceId: string) {
    delete this.sources[sourceId];
  }

  getLayer(layerId: string) {
    return this.layers.find((layer) => layer.id === layerId);
  }

  addLayer(
    layer: Record<string, unknown> & { id: string; type: string },
    beforeId?: string,
  ) {
    const storedLayer = { ...layer };
    const existingIndex = this.layers.findIndex((item) => item.id === layer.id);
    if (existingIndex >= 0) {
      this.layers.splice(existingIndex, 1);
    }
    const beforeIndex = beforeId
      ? this.layers.findIndex((item) => item.id === beforeId)
      : -1;
    if (beforeIndex >= 0) {
      this.layers.splice(beforeIndex, 0, storedLayer);
    } else {
      this.layers.push(storedLayer);
    }
  }

  removeLayer(layerId: string) {
    this.layers = this.layers.filter((layer) => layer.id !== layerId);
  }

  moveLayer(layerId: string, beforeId?: string) {
    const layer = this.getLayer(layerId);
    if (!layer) {
      return;
    }
    this.removeLayer(layerId);
    this.addLayer(layer, beforeId);
  }

  setPaintProperty(layerId: string, property: string, value: unknown) {
    const layer = this.getLayer(layerId);
    if (layer) {
      layer.paint = {
        ...((layer.paint as Record<string, unknown>) ?? {}),
        [property]: value,
      };
    }
  }

  setLayoutProperty(layerId: string, property: string, value: unknown) {
    const layer = this.getLayer(layerId);
    if (layer) {
      layer.layout = {
        ...((layer.layout as Record<string, unknown>) ?? {}),
        [property]: value,
      };
    }
  }

  setFilter(layerId: string, filter: unknown) {
    const layer = this.getLayer(layerId);
    if (layer) {
      if (filter == null) {
        delete layer.filter;
      } else {
        layer.filter = filter;
      }
    }
  }

  querySourceFeatures(sourceId: string) {
    const source = this.sources[sourceId];
    const data = source?.data as GeoJSON.GeoJSON | undefined;
    if (!data) {
      return [];
    }
    if (data.type === "FeatureCollection") {
      return data.features;
    }
    if (data.type === "Feature") {
      return [data];
    }
    return [{ type: "Feature", properties: {}, geometry: data }];
  }

  setStyle(style: unknown) {
    if (
      style &&
      typeof style === "object" &&
      "sources" in style &&
      "layers" in style
    ) {
      const styleObject = style as {
        sources?: Record<string, Record<string, unknown>>;
        layers?: Array<Record<string, unknown> & { id: string; type: string }>;
      };
      this.sources = { ...(styleObject.sources ?? {}) };
      this.layers = [...(styleObject.layers ?? [])];
    } else {
      this.sources = {};
      this.layers = [];
    }
  }

  once(_event: string, callback: () => void) {
    callback();
  }

  setTerrain(terrain: unknown) {
    this.terrain = terrain;
  }

  setSky(sky: unknown) {
    this.sky = sky;
  }
}

describe("GeoAgentControl", () => {
  it("adds a MapLibre control button and floating panel", () => {
    const map = new MockMap();
    const control = new GeoAgentControl({ title: "GeoAgent Test" });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);

    expect(container.className).toContain("geoagent-control");
    expect(map.mapContainer.querySelector(".geoagent-panel")).toBeTruthy();
    expect(control.getState()).toMatchObject({
      collapsed: true,
      panelWidth: 390,
      providerId: "openai-responses",
      allowCodeExecution: true,
      allowDestructiveTools: true,
    });
    expect(
      map.mapContainer.querySelector<HTMLElement>(".geoagent-toggle-row")
        ?.hidden,
    ).toBe(true);

    control.onRemove();
    expect(map.mapContainer.querySelector(".geoagent-panel")).toBeNull();
    expect(container.parentNode).toBeNull();
    map.cleanup();
  });

  it("can show permission toggles during initialization", () => {
    const map = new MockMap();
    const control = new GeoAgentControl({ showPermissionToggles: true });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);

    expect(
      map.mapContainer.querySelector<HTMLElement>(".geoagent-toggle-row")
        ?.hidden,
    ).toBe(false);
    expect(
      map.mapContainer.querySelector<HTMLInputElement>(".geoagent-allow-code")
        ?.checked,
    ).toBe(true);
    expect(
      map.mapContainer.querySelector<HTMLInputElement>(
        ".geoagent-allow-destructive",
      )?.checked,
    ).toBe(true);

    control.onRemove();
    map.cleanup();
  });

  it("uses host-provided initial API keys when no session key is stored", () => {
    const storagePrefix = "geoagent.initial.keys";
    sessionStorage.removeItem(`${storagePrefix}.anthropic.api_key`);
    const map = new MockMap();
    const control = new GeoAgentControl({
      storagePrefix,
      defaultProvider: "anthropic",
      apiKeys: {
        anthropic: "env-anthropic-key",
      },
    });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const apiKeyInput = map.mapContainer.querySelector<HTMLInputElement>(
      ".geoagent-api-key",
    );

    expect(apiKeyInput?.value).toBe("env-anthropic-key");
    expect(sessionStorage.getItem(`${storagePrefix}.anthropic.api_key`)).toBe(
      null,
    );

    control.onRemove();
    map.cleanup();
  });

  it("prefers a stored API key over a host-provided initial API key", () => {
    const storagePrefix = "geoagent.stored.keys";
    sessionStorage.setItem(
      `${storagePrefix}.google.api_key`,
      "stored-google-key",
    );
    const map = new MockMap();
    const control = new GeoAgentControl({
      storagePrefix,
      defaultProvider: "google",
      apiKeys: {
        google: "env-google-key",
      },
    });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const apiKeyInput = map.mapContainer.querySelector<HTMLInputElement>(
      ".geoagent-api-key",
    );

    expect(apiKeyInput?.value).toBe("stored-google-key");

    control.onRemove();
    map.cleanup();
  });

  it("shows Earth Engine settings in the main panel when enabled", () => {
    const storagePrefix = "geoagent.ee.panel";
    sessionStorage.removeItem(`${storagePrefix}.earthEngine.projectId`);
    const map = new MockMap();
    const control = new GeoAgentControl({
      storagePrefix,
      earthEngine: {
        oauthClientId: "initial-client",
        projectId: "initial-project",
      },
    });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const details = map.mapContainer.querySelector<HTMLDetailsElement>(
      ".geoagent-earth-engine",
    );
    const clientInput = map.mapContainer.querySelector<HTMLInputElement>(
      ".geoagent-ee-client-id",
    );
    const projectInput = map.mapContainer.querySelector<HTMLInputElement>(
      ".geoagent-ee-project-id",
    );

    expect(details?.hidden).toBe(false);
    expect(details?.open).toBe(false);
    expect(clientInput?.type).toBe("hidden");
    expect(clientInput?.value).toBe("initial-client");
    expect(projectInput?.value).toBe("initial-project");

    projectInput!.value = "updated-project";
    projectInput?.dispatchEvent(new Event("input", { bubbles: true }));

    expect(
      sessionStorage.getItem(`${storagePrefix}.earthEngine.projectId`),
    ).toBe("updated-project");

    control.onRemove();
    map.cleanup();
  });

  it("opens Earth Engine settings when credentials are missing", () => {
    const map = new MockMap();
    const control = new GeoAgentControl({
      storagePrefix: "geoagent.ee.missing",
      earthEngine: {},
    });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const details = map.mapContainer.querySelector<HTMLDetailsElement>(
      ".geoagent-earth-engine",
    );
    const status = map.mapContainer.querySelector<HTMLDivElement>(
      ".geoagent-earth-engine-status",
    );

    expect(details?.hidden).toBe(false);
    expect(details?.open).toBe(true);
    expect(status?.textContent).toContain("OAuth Client ID or access token");

    control.onRemove();
    map.cleanup();
  });

  it("accepts an Earth Engine access token without an OAuth client id", () => {
    const map = new MockMap();
    const control = new GeoAgentControl({
      storagePrefix: "geoagent.ee.token",
      earthEngine: {
        accessToken: "python-token",
        projectId: "project",
      },
    });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const details = map.mapContainer.querySelector<HTMLDetailsElement>(
      ".geoagent-earth-engine",
    );
    const status = map.mapContainer.querySelector<HTMLDivElement>(
      ".geoagent-earth-engine-status",
    );

    expect(details?.hidden).toBe(false);
    expect(details?.open).toBe(false);
    expect(status?.textContent).toContain("Initialized:");

    control.onRemove();
    map.cleanup();
  });

  it("shows and persists the Bedrock region field for the Bedrock provider", () => {
    const map = new MockMap();
    const control = new GeoAgentControl({ defaultProvider: "bedrock" });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const providerSelect =
      map.mapContainer.querySelector<HTMLSelectElement>(".geoagent-provider");
    const regionRow = map.mapContainer.querySelector<HTMLLabelElement>(
      ".geoagent-bedrock-region-row",
    );
    const regionInput = map.mapContainer.querySelector<HTMLInputElement>(
      ".geoagent-bedrock-region",
    );

    expect(providerSelect?.value).toBe("bedrock");
    expect(regionRow?.hidden).toBe(false);
    expect(regionInput?.value).toBe("us-west-2");
    expect(control.getState()).toMatchObject({
      providerId: "bedrock",
      modelId: "global.anthropic.claude-sonnet-4-6",
      bedrockRegion: "us-west-2",
    });

    regionInput!.value = "us-east-1";
    regionInput?.dispatchEvent(new Event("input", { bubbles: true }));

    expect(control.getState().bedrockRegion).toBe("us-east-1");
    expect(sessionStorage.getItem("geoagent.maplibre.bedrock.region")).toBe(
      "us-east-1",
    );

    providerSelect!.value = "openai-responses";
    providerSelect?.dispatchEvent(new Event("change", { bubbles: true }));

    expect(regionRow?.hidden).toBe(true);

    control.onRemove();
    map.cleanup();
  });

  it("copies the visible conversation as markdown", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const map = new MockMap();
    const control = new GeoAgentControl();
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const copyButton =
      map.mapContainer.querySelector<HTMLButtonElement>(".geoagent-copy");

    copyButton?.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));

    expect(writeText).toHaveBeenCalledWith(
      "## System\n\nBrowser-only Strands MapLibre agent ready.",
    );

    control.onRemove();
    map.cleanup();
  });

  it("sends prompts with Enter and leaves Ctrl+Enter for new lines", async () => {
    const map = new MockMap();
    const control = new GeoAgentControl();
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const prompt =
      map.mapContainer.querySelector<HTMLTextAreaElement>(".geoagent-prompt")!;

    prompt.value = "line one";
    prompt.dispatchEvent(new Event("input", { bubbles: true }));
    const ctrlEnterAllowed = prompt.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(ctrlEnterAllowed).toBe(false);
    expect(prompt.value).toBe("line one\n");
    expect(prompt.selectionStart).toBe(prompt.value.length);

    const enterAllowed = prompt.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(enterAllowed).toBe(false);
    expect(prompt.value).toBe("");
    await vi.waitFor(() => expect(control.getState().busy).toBe(false));

    control.onRemove();
    map.cleanup();
  });

  it("cycles through prompt history with up and down arrows", async () => {
    const map = new MockMap();
    const control = new GeoAgentControl();
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const prompt =
      map.mapContainer.querySelector<HTMLTextAreaElement>(".geoagent-prompt")!;
    const form =
      map.mapContainer.querySelector<HTMLFormElement>(".geoagent-form")!;

    prompt.value = "first prompt";
    prompt.dispatchEvent(new Event("input", { bubbles: true }));
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(control.getState().busy).toBe(false));

    prompt.value = "second prompt";
    prompt.dispatchEvent(new Event("input", { bubbles: true }));
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(control.getState().busy).toBe(false));

    prompt.value = "draft";
    prompt.setSelectionRange(0, 0);
    prompt.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(prompt.value).toBe("second prompt");

    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
    prompt.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );
    expect(prompt.value).toBe("first prompt");

    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
    prompt.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(prompt.value).toBe("second prompt");

    prompt.setSelectionRange(prompt.value.length, prompt.value.length);
    prompt.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(prompt.value).toBe("draft");

    control.onRemove();
    map.cleanup();
  });

  it("resizes width and height with the bottom-right corner handle and clamps", () => {
    const map = new MockMap();
    const control = new GeoAgentControl({
      panelWidth: 430,
      panelMinWidth: 360,
      panelMaxWidth: 500,
      panelHeight: 400,
      panelMinHeight: 300,
      panelMaxHeight: 600,
    });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const handle = map.mapContainer.querySelector<HTMLElement>(
      ".geoagent-panel-resize-handle-br",
    );

    handle?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, clientX: 100, clientY: 100 }),
    );
    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 200, clientY: 300 }),
    );

    // Dragging the bottom-right corner right and down grows both dimensions,
    // clamped to the maximum width and within the height bounds.
    expect(control.getState().panelWidth).toBe(500);
    expect(control.getPanel()?.style.width).toBe("500px");
    expect(control.getState().panelHeight).toBe(600);
    expect(control.getPanel()?.style.height).toBe("600px");

    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: -200, clientY: -200 }),
    );

    expect(control.getState().panelWidth).toBe(360);
    expect(control.getPanel()?.style.width).toBe("360px");
    expect(control.getState().panelHeight).toBe(300);
    expect(control.getPanel()?.style.height).toBe("300px");

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(document.body.classList.contains("geoagent-panel-resizing")).toBe(
      false,
    );

    control.onRemove();
    map.cleanup();
  });

  it("grows width to the left when dragging the bottom-left corner handle", () => {
    const map = new MockMap();
    const control = new GeoAgentControl({
      panelWidth: 400,
      panelMinWidth: 320,
      panelMaxWidth: 520,
    });
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const handle = map.mapContainer.querySelector<HTMLElement>(
      ".geoagent-panel-resize-handle-bl",
    );

    handle?.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, clientX: 200, clientY: 100 }),
    );
    // Dragging the bottom-left corner left (decreasing clientX) widens the panel.
    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 120, clientY: 100 }),
    );

    expect(control.getState().panelWidth).toBe(480);
    expect(control.getPanel()?.style.width).toBe("480px");

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    control.onRemove();
    map.cleanup();
  });

  it("stays open on outside click and closes only via the close button", () => {
    const map = new MockMap();
    const control = new GeoAgentControl();
    const container = control.onAdd(map as never);
    map.controlStack.appendChild(container);
    const events: string[] = [];
    control.on("expand", (event) => events.push(event.type));
    control.on("collapse", (event) => events.push(event.type));

    control.expand();
    expect(control.getState().collapsed).toBe(false);
    expect(control.getPanel()?.classList.contains("expanded")).toBe(true);

    // Clicking outside the panel must NOT collapse it.
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(control.getState().collapsed).toBe(false);
    expect(control.getPanel()?.classList.contains("expanded")).toBe(true);

    // The header close button collapses the panel.
    const closeButton = map.mapContainer.querySelector<HTMLButtonElement>(
      ".geoagent-panel-header .geoagent-icon-button",
    );
    closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(control.getState().collapsed).toBe(true);
    expect(control.getPanel()?.classList.contains("expanded")).toBe(false);
    expect(events).toEqual(["expand", "collapse"]);

    control.onRemove();
    map.cleanup();
  });
});

describe("GeoAgentControlReact", () => {
  it("mounts and removes the GeoAgent control", () => {
    const map = new MockMap();
    const onStateChange = vi.fn();
    const result = render(
      <GeoAgentControlReact
        map={map as never}
        collapsed={false}
        onStateChange={onStateChange}
      />,
    );

    expect(map.controls.size).toBe(1);
    expect(
      map.mapContainer.querySelector(".geoagent-panel.expanded"),
    ).toBeTruthy();

    result.unmount();
    expect(map.controls.size).toBe(0);
    expect(map.mapContainer.querySelector(".geoagent-panel")).toBeNull();
    map.cleanup();
  });
});

describe("MapLibre GeoAgent helpers", () => {
  it("normalizes layer names into stable slugs", () => {
    expect(slug("US Counties 2026!")).toBe("us-counties-2026");
    expect(slug("")).toBe("layer");
  });

  it("computes GeoJSON bounds and geometry-specific layer definitions", () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Point",
            coordinates: [-83.92, 35.96],
          },
        },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [-84, 36],
              [-83, 35],
            ],
          },
        },
      ],
    };

    expect(geoJsonBounds(geojson)).toEqual([-84, 35, -83, 36]);
    expect(Array.from(geoJsonGeometryTypes(geojson)).sort()).toEqual([
      "LineString",
      "Point",
    ]);

    const layerDefs = geojsonLayerDefs(
      "test",
      geojsonLayerPaint({ color: "#ff0000" }),
      geojson,
    );
    expect(layerDefs.map((layer) => layer.id)).toEqual([
      "test-line",
      "test-point",
    ]);
  });

  it("parses numeric and object arguments with sensible fallbacks", () => {
    expect(numberArg({ zoom: 4 }, "zoom")).toBe(4);
    expect(numberArg({ zoom: "7.5" }, "zoom")).toBe(7.5);
    expect(() => numberArg({}, "zoom")).toThrow(/numeric argument/);
    expect(() => numberArg({ zoom: "abc" }, "zoom")).toThrow(/finite numeric/);

    expect(objectArg({ style: { color: "#000" } }, "style")).toEqual({
      color: "#000",
    });
    expect(objectArg({ style: "no" }, "style")).toEqual({});
    expect(objectArg({ style: [1, 2] }, "style")).toEqual({});
  });

  it("produces fill, line, and circle paint defaults that respect overrides", () => {
    const paint = geojsonLayerPaint({});
    expect(paint.fill["fill-color"]).toBe("#1c7ed6");
    expect(paint.fill["fill-opacity"]).toBeCloseTo(0.35);
    expect(paint.line["line-width"]).toBe(2);
    expect(paint.circle["circle-radius"]).toBe(6);

    const overridden = geojsonLayerPaint({
      color: "#ff0000",
      "line-width": 5,
      "circle-radius": 10,
      opacity: 2,
    });
    expect(overridden.fill["fill-color"]).toBe("#ff0000");
    expect(overridden.fill["fill-opacity"]).toBe(1);
    expect(overridden.line["line-width"]).toBe(5);
    expect(overridden.circle["circle-radius"]).toBe(10);
  });

  it("emits only the polygon layer when source has polygons, and all layers when geometries are unknown", () => {
    const polygonOnly: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    expect(
      geojsonLayerDefs("poly", geojsonLayerPaint({}), polygonOnly).map(
        (layer) => layer.id,
      ),
    ).toEqual(["poly-fill"]);

    const empty: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    expect(
      geojsonLayerDefs("any", geojsonLayerPaint({}), empty).map(
        (layer) => layer.id,
      ),
    ).toEqual(["any-fill", "any-line", "any-point"]);
  });

  it("honors precomputed GeoJSON bbox and ignores invalid coordinates when extending bounds", () => {
    const point: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      bbox: [10, 20, 30, 40],
      geometry: { type: "Point", coordinates: [0, 0] },
    };
    expect(geoJsonBounds(point)).toEqual([10, 20, 30, 40]);

    expect(geoJsonBounds(undefined)).toBeNull();
    expect(geoJsonGeometryTypes(undefined).size).toBe(0);

    expect(extendBounds(null, [Number.NaN, 1])).toBeNull();
    expect(extendBounds([0, 0, 0, 0], [5, -5])).toEqual([0, -5, 5, 0]);
  });

  it("round-trips JSON values and falls back to a string for non-serializable input", () => {
    expect(toJsonValue(undefined)).toBeNull();
    expect(toJsonValue({ a: 1, b: [2, 3] })).toEqual({ a: 1, b: [2, 3] });

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(typeof toJsonValue(cyclic)).toBe("string");
  });
});

describe("MapLibreAgentTools native tools", () => {
  const createAgent = (
    map = new MockAgentMap(),
    allowDestructiveTools = true,
  ) => ({
    map,
    agent: new MapLibreAgentTools(map as never, {
      allowCodeExecution: () => false,
      allowDestructiveTools: () => allowDestructiveTools,
    }),
  });

  const pointData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: 1,
        properties: { name: "One", kind: "park" },
        geometry: { type: "Point", coordinates: [-83.9, 35.9] },
      },
    ],
  };

  const polygonData: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { value: 10 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-84, 35],
              [-83, 35],
              [-83, 36],
              [-84, 36],
              [-84, 35],
            ],
          ],
        },
      },
    ],
  };

  it("registers the focused native MapLibre tool batch", () => {
    const { agent } = createAgent();
    const toolNames = (agent.createTools() as Array<{ name: string }>).map(
      (item) => item.name,
    );

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "add_map_source",
        "remove_map_source",
        "add_map_layer",
        "remove_map_layer",
        "move_layer",
        "set_paint_property",
        "set_layout_property",
        "set_layer_filter",
        "update_geojson_source",
        "query_source_features",
        "add_basemap",
        "add_image_layer",
        "add_terrain",
        "clear_terrain",
        "set_sky",
        "remove_sky",
        "add_cluster_layer",
        "add_choropleth_layer",
        "add_3d_buildings",
      ]),
    );
  });

  it("emits an OpenAI-compatible image coordinate schema", () => {
    const { agent } = createAgent();
    const imageTool = agent
      .createTools()
      .find((item) => item.name === "add_image_layer");
    const inputSchema = imageTool?.toolSpec.inputSchema as {
      properties?: Record<string, unknown>;
    };
    const coordinatesSchema = inputSchema.properties?.coordinates as {
      items?: {
        type?: string;
        items?: unknown;
        prefixItems?: unknown;
      };
    };

    expect(coordinatesSchema.items).toMatchObject({
      type: "array",
      items: { type: "number" },
    });
    expect(coordinatesSchema.items?.prefixItems).toBeUndefined();
  });

  it("adds and mutates generic native sources and layers", async () => {
    const { agent, map } = createAgent();

    await agent.runCommand("add_map_source", {
      source_id: "points-source",
      source: { type: "geojson", data: pointData },
    });
    await agent.runCommand("add_map_layer", {
      layer: {
        id: "labels",
        type: "symbol",
        source: "points-source",
        layout: { "text-field": ["get", "name"] },
      },
    });
    await agent.runCommand("add_map_layer", {
      layer: {
        id: "points",
        type: "circle",
        source: "points-source",
      },
      before_id: "labels",
    });

    expect(map.layers.map((layer) => layer.id)).toEqual(["points", "labels"]);

    await agent.runCommand("move_layer", {
      layer_id: "labels",
      before_id: "points",
    });
    await agent.runCommand("set_paint_property", {
      layer_id: "points",
      property: "circle-color",
      value: "#ff0000",
    });
    await agent.runCommand("set_layout_property", {
      layer_id: "labels",
      property: "visibility",
      value: "none",
    });
    await agent.runCommand("set_layer_filter", {
      layer_id: "points",
      filter: ["==", ["get", "kind"], "park"],
    });

    expect(map.layers.map((layer) => layer.id)).toEqual(["labels", "points"]);
    expect(map.getLayer("points")?.paint).toMatchObject({
      "circle-color": "#ff0000",
    });
    expect(map.getLayer("labels")?.layout).toMatchObject({
      visibility: "none",
    });
    expect(map.getLayer("points")?.filter).toEqual([
      "==",
      ["get", "kind"],
      "park",
    ]);

    const updatedData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: 2,
          properties: { name: "Two" },
          geometry: { type: "Point", coordinates: [-84, 36] },
        },
      ],
    };
    await agent.runCommand("update_geojson_source", {
      source_id: "points-source",
      data: updatedData,
    });
    const queried = await agent.runCommand("query_source_features", {
      source_id: "points-source",
    });

    expect(queried).toMatchObject({
      type: "FeatureCollection",
      features: [{ id: 2, properties: { name: "Two" } }],
    });

    await agent.runCommand("remove_map_layer", { layer_id: "points" });
    await agent.runCommand("remove_map_layer", { layer_id: "labels" });
    await agent.runCommand("remove_map_source", { source_id: "points-source" });

    expect(map.getSource("points-source")).toBeUndefined();
    expect(map.layers).toEqual([]);
  });

  it("blocks source removal while active layers still depend on it", async () => {
    const { agent } = createAgent();
    await agent.runCommand("add_map_source", {
      source_id: "blocked-source",
      source: { type: "geojson", data: pointData },
    });
    await agent.runCommand("add_map_layer", {
      layer: { id: "blocked-layer", type: "circle", source: "blocked-source" },
    });

    await expect(
      agent.runCommand("remove_map_source", { source_id: "blocked-source" }),
    ).rejects.toThrow(/active layers depend/);
  });

  it("adds native overlay helpers and restores them after basemap changes", async () => {
    const { agent, map } = createAgent();

    await agent.runCommand("add_image_layer", {
      id: "historic-map",
      url: "https://example.com/historic.png",
      coordinates: [
        [-84, 36],
        [-83, 36],
        [-83, 35],
        [-84, 35],
      ],
      opacity: 0.6,
    });
    await agent.runCommand("add_cluster_layer", {
      name: "cities",
      data: pointData,
      show_cluster_count: true,
    });
    await agent.runCommand("add_choropleth_layer", {
      name: "counties",
      data: polygonData,
      color_expression: ["step", ["get", "value"], "#f7fbff", 10, "#08306b"],
      fill_opacity: 0.5,
    });
    await agent.runCommand("add_terrain", {
      url: "https://example.com/dem/{z}/{x}/{y}.png",
      encoding: "terrarium",
      exaggeration: 1.5,
    });
    await agent.runCommand("set_sky", {
      sky: { "sky-color": "#88ccee" },
    });
    await agent.runCommand("add_3d_buildings", {
      layer_id: "buildings-3d",
      fill_extrusion_color: "#bbbbbb",
    });

    expect(map.getSource("historic-map-source")).toMatchObject({
      type: "image",
    });
    expect(map.getLayer("cities-clusters")).toBeTruthy();
    expect(map.getLayer("counties-outline")).toBeTruthy();
    expect(map.terrain).toEqual({ source: "terrain-dem", exaggeration: 1.5 });
    expect(map.sky).toEqual({ "sky-color": "#88ccee" });
    expect(map.getLayer("buildings-3d")).toBeTruthy();

    await agent.runCommand("change_basemap", { style: "osm" });

    expect(map.getLayer("osm")).toBeTruthy();
    expect(map.getSource("historic-map-source")).toMatchObject({
      type: "image",
    });
    expect(map.getLayer("cities-clusters")).toBeTruthy();
    expect(map.getLayer("counties")).toBeTruthy();
    expect(map.getSource("terrain-dem")).toMatchObject({ type: "raster-dem" });
    expect(map.terrain).toEqual({ source: "terrain-dem", exaggeration: 1.5 });
    expect(map.sky).toEqual({ "sky-color": "#88ccee" });
    expect(map.getSource("buildings-source")).toMatchObject({ type: "vector" });
    expect(map.getLayer("buildings-3d")).toBeTruthy();
  });

  it("adds raster basemaps without replacing the current style", async () => {
    const { agent, map } = createAgent();

    await agent.runCommand("add_geojson_data", {
      name: "points",
      data: pointData,
      style: { color: "#ff0000" },
    });
    const result = await agent.runCommand("add_basemap", {
      provider: "google_satellite",
    });

    expect(result).toBe("Added basemap Google Satellite.");
    expect(map.getSource("google-satellite-source")).toMatchObject({
      type: "raster",
      tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"],
    });
    expect(map.getLayer("google-satellite")).toMatchObject({
      type: "raster",
      source: "google-satellite-source",
    });
    expect(map.getLayer("points-point")).toBeTruthy();
  });

  it("surfaces a timeout error when style.load is not emitted", async () => {
    vi.useFakeTimers();
    try {
      const { agent, map } = createAgent();
      map.once = vi.fn();

      const result = agent.runCommand("change_basemap", { style: "osm" });
      const captured = result.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(9000);
      const error = await captured;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(
        /timed out waiting for style\.load/,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors destructive-tool gating for arbitrary native layer removal", async () => {
    const { agent } = createAgent(new MockAgentMap(), false);
    await agent.runCommand("add_map_source", {
      source_id: "safe-source",
      source: { type: "geojson", data: pointData },
    });
    await agent.runCommand("add_map_layer", {
      layer: { id: "safe-layer", type: "circle", source: "safe-source" },
    });

    await expect(
      agent.runCommand("remove_map_layer", { layer_id: "safe-layer" }),
    ).rejects.toThrow(/disabled/);
  });
});
