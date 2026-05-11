import {
  Agent,
  type AgentStreamEvent,
  type Model,
} from '@strands-agents/sdk';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import {
  DEFAULT_BASEMAPS,
  MapLibreAgentTools,
} from './maplibre-tools';
import type {
  GeoAgentControlEvent,
  GeoAgentControlEventHandler,
  GeoAgentControlOptions,
  GeoAgentProviderConfig,
  GeoAgentProviderId,
  GeoAgentState,
} from './types';

const DEFAULT_PROVIDER: GeoAgentProviderId = 'openai-responses';
const DEFAULT_STORAGE_PREFIX = 'geoagent.maplibre';

const BASE_PROVIDER_CONFIGS: Record<
  GeoAgentProviderId,
  Omit<GeoAgentProviderConfig, 'storageKey'>
> = {
  'openai-responses': {
    id: 'openai-responses',
    label: 'OpenAI Responses',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    defaultModel: 'gpt-5.5',
  },
  'openai-chat': {
    id: 'openai-chat',
    label: 'OpenAI Chat',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    defaultModel: 'gpt-5.5',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
    defaultModel: 'claude-sonnet-4-6',
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    keyLabel: 'Gemini API Key',
    keyPlaceholder: 'AIza...',
    defaultModel: 'gemini-3.1-pro-preview',
  },
  bedrock: {
    id: 'bedrock',
    label: 'Amazon Bedrock',
    keyLabel: 'Bedrock API Key',
    keyPlaceholder: 'bedrock-api-key...',
    defaultModel: 'global.anthropic.claude-sonnet-4-6',
    defaultRegion: 'us-west-2',
  },
};

const BROWSER_MAPLIBRE_SYSTEM_PROMPT = `You are an AI assistant embedded in a browser web app with direct access to a live MapLibre map through dedicated browser tools.

Workflow guidance:
- Use browser map tools for map navigation, layer inspection, marker creation, GeoJSON display, layer visibility, feature queries, and screenshots.
- Use add_basemap for requests to add satellite imagery or another raster background, including Google satellite. Use change_basemap only when the user explicitly asks to replace the whole map style.
- When the user asks for Google Earth Engine data, GEE catalog data, SRTM from GEE, Sentinel/Landsat/MODIS/GEE assets, NDVI, or Earth Engine statistics, use the dedicated Earth Engine tools first.
- Do not silently replace a requested Earth Engine layer with unrelated public XYZ, terrain, or basemap tiles. If an Earth Engine tool fails, report the exact tool error and ask for the missing credential/project/asset detail.
- Coordinates in user-facing prompts are latitude/longitude, but browser map internals use longitude/latitude. Use the tool parameter names exactly.
- Do not ask the user to paste JavaScript or run Python for actions that the browser map tools can perform.
- Keep responses concise and include layer names, locations, and tool results when useful.`;

const BROWSER_MAPLIBRE_CODE_SYSTEM_PROMPT = `Browser JavaScript code execution is enabled for this local session. This tool runs arbitrary JavaScript in the page context and is not a safety boundary; treat it as a trusted, local-only escape hatch.

When no dedicated browser map tool can perform the requested MapLibre operation, write a short JavaScript snippet and run it with run_maplibre_script. The snippet executes in the browser with these names in scope: map, maplibregl, and helpers. Prefer MapLibre GL JS API calls, keep code focused on map operations, and avoid credential handling, storage access, unrelated DOM manipulation, or broad network operations.`;

interface GeoAgentUi {
  status: HTMLSpanElement;
  providerSelect: HTMLSelectElement;
  apiKeyLabel: HTMLSpanElement;
  apiKeyInput: HTMLInputElement;
  modelIdInput: HTMLInputElement;
  bedrockRegionLabel: HTMLLabelElement;
  bedrockRegionInput: HTMLInputElement;
  earthEngineDetails: HTMLDetailsElement;
  earthEngineClientIdInput: HTMLInputElement;
  earthEngineProjectIdInput: HTMLInputElement;
  earthEngineStatus: HTMLDivElement;
  permissionRow: HTMLDivElement;
  allowCodeInput: HTMLInputElement;
  allowDestructiveInput: HTMLInputElement;
  log: HTMLDivElement;
  form: HTMLFormElement;
  prompt: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  clearButton: HTMLButtonElement;
  copyButton: HTMLButtonElement;
  resizeHandle: HTMLDivElement;
  closeButton: HTMLButtonElement;
}

type EventHandlersMap = globalThis.Map<
  GeoAgentControlEvent,
  Set<GeoAgentControlEventHandler>
>;

function storageGet(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, value);
  } catch {
    // Ignore storage failures in private or restricted browser contexts.
  }
}

function storageRemove(key: string): void {
  try {
    globalThis.sessionStorage?.removeItem(key);
  } catch {
    // Ignore storage failures in private or restricted browser contexts.
  }
}

function firstValue(...values: Array<string | undefined | null>): string {
  return values.find((value) => value?.trim())?.trim() ?? '';
}

function defaultModelFor(
  providerId: GeoAgentProviderId,
  defaultModel: GeoAgentControlOptions['defaultModel'],
): string {
  if (typeof defaultModel === 'string') {
    return defaultModel;
  }
  return defaultModel?.[providerId] ?? BASE_PROVIDER_CONFIGS[providerId].defaultModel;
}

function markdownHeading(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

export class GeoAgentControl implements IControl {
  private readonly options: Required<
    Omit<GeoAgentControlOptions, 'defaultModel' | 'basemaps' | 'earthEngine'>
  > &
    Pick<GeoAgentControlOptions, 'defaultModel' | 'basemaps' | 'earthEngine'>;
  private map?: MapLibreMap;
  private mapContainer?: HTMLElement;
  private container?: HTMLElement;
  private panel?: HTMLElement;
  private ui?: GeoAgentUi;
  private tools?: MapLibreAgentTools;
  private agent: Agent | null = null;
  private agentSignature = '';
  private streamingAssistantTextEl: HTMLDivElement | null = null;
  private streamingAssistantText = '';
  private promptHistory: string[] = [];
  private promptHistoryIndex = -1;
  private promptHistoryDraft = '';
  private state: GeoAgentState;
  private eventHandlers: EventHandlersMap = new globalThis.Map();
  private resizeHandler: (() => void) | null = null;
  private mapResizeHandler: (() => void) | null = null;
  private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private panelResizeMoveHandler: ((e: MouseEvent) => void) | null = null;
  private panelResizeUpHandler: (() => void) | null = null;
  private activeAbortController: AbortController | null = null;
  private cancelRequested = false;

  constructor(options: GeoAgentControlOptions = {}) {
    this.options = {
      collapsed: options.collapsed ?? true,
      position: options.position ?? 'top-right',
      title: options.title ?? 'GeoAgent',
      panelWidth: options.panelWidth ?? 390,
      panelMinWidth: options.panelMinWidth ?? 320,
      panelMaxWidth: options.panelMaxWidth ?? 720,
      className: options.className ?? '',
      defaultProvider: options.defaultProvider ?? DEFAULT_PROVIDER,
      storagePrefix: options.storagePrefix ?? DEFAULT_STORAGE_PREFIX,
      allowCodeExecutionDefault: options.allowCodeExecutionDefault ?? true,
      allowDestructiveToolsDefault: options.allowDestructiveToolsDefault ?? true,
      showPermissionToggles: options.showPermissionToggles ?? false,
      defaultModel: options.defaultModel,
      basemaps: options.basemaps,
      earthEngine: options.earthEngine,
    };
    const providerId = this.initialProviderId();
    this.state = {
      collapsed: this.options.collapsed,
      panelWidth: this.constrainPanelWidth(this.options.panelWidth),
      busy: false,
      providerId,
      modelId: this.initialModelId(providerId),
      bedrockRegion: this.initialBedrockRegion(),
      allowCodeExecution: this.options.allowCodeExecutionDefault,
      allowDestructiveTools: this.options.allowDestructiveToolsDefault,
      data: {},
    };
  }

  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map;
    this.mapContainer = map.getContainer();
    this.container = this.createContainer();
    this.panel = this.createPanel();
    this.mapContainer.appendChild(this.panel);
    this.tools = new MapLibreAgentTools(map, {
      basemaps: { ...DEFAULT_BASEMAPS, ...this.options.basemaps },
      allowCodeExecution: () => this.state.allowCodeExecution,
      allowDestructiveTools: () => this.state.allowDestructiveTools,
      earthEngine: this.options.earthEngine,
      onStateDataChange: (data) => {
        this.state.data = { ...(this.state.data ?? {}), ...data };
        this.updateEarthEngineStatus();
        this.emit('statechange');
      },
    });
    this.setupEventListeners();
    this.loadProviderSettings();
    this.setStatus('Ready', 'connected');
    this.appendLog('system', 'Browser-only Strands MapLibre agent ready.');
    this.updateControls();

    if (!this.state.collapsed) {
      this.panel.classList.add('expanded');
      requestAnimationFrame(() => this.updatePanelPosition());
    }

    return this.container;
  }

  onRemove(): void {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.mapResizeHandler && this.map) {
      this.map.off('resize', this.mapResizeHandler);
      this.mapResizeHandler = null;
    }
    if (this.clickOutsideHandler) {
      document.removeEventListener('click', this.clickOutsideHandler);
      this.clickOutsideHandler = null;
    }
    this.stopPanelResize();
    this.activeAbortController?.abort();
    this.agent?.cancel();
    this.activeAbortController = null;
    this.cancelRequested = false;

    this.tools?.destroy();
    this.tools = undefined;
    this.panel?.parentNode?.removeChild(this.panel);
    this.container?.parentNode?.removeChild(this.container);
    this.map = undefined;
    this.mapContainer = undefined;
    this.container = undefined;
    this.panel = undefined;
    this.ui = undefined;
    this.agent = null;
    this.agentSignature = '';
    this.streamingAssistantTextEl = null;
    this.streamingAssistantText = '';
    this.promptHistory = [];
    this.promptHistoryIndex = -1;
    this.promptHistoryDraft = '';
    this.eventHandlers.clear();
  }

  getState(): GeoAgentState {
    return {
      ...this.state,
      data: { ...this.state.data },
    };
  }

  setState(newState: Partial<GeoAgentState>): void {
    const collapsedChanged =
      newState.collapsed !== undefined && newState.collapsed !== this.state.collapsed;
    const agentInvalidating =
      (newState.providerId !== undefined && newState.providerId !== this.state.providerId) ||
      (newState.modelId !== undefined && newState.modelId !== this.state.modelId) ||
      (newState.allowCodeExecution !== undefined &&
        newState.allowCodeExecution !== this.state.allowCodeExecution);
    this.state = { ...this.state, ...newState };
    if (newState.panelWidth !== undefined && this.panel) {
      const panelWidth = this.constrainPanelWidth(newState.panelWidth);
      this.state.panelWidth = panelWidth;
      this.panel.style.width = `${panelWidth}px`;
    }
    if (collapsedChanged) {
      if (this.state.collapsed) {
        this.panel?.classList.remove('expanded');
        this.emit('collapse');
      } else {
        this.panel?.classList.add('expanded');
        this.updatePanelPosition();
        this.emit('expand');
      }
    }
    if (agentInvalidating) {
      this.invalidateAgent();
    }
    this.syncUiFromState();
    this.emit('statechange');
  }

  toggle(): void {
    this.setState({ collapsed: !this.state.collapsed });
  }

  expand(): void {
    if (this.state.collapsed) {
      this.toggle();
    }
  }

  collapse(): void {
    if (!this.state.collapsed) {
      this.toggle();
    }
  }

  on(event: GeoAgentControlEvent, handler: GeoAgentControlEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: GeoAgentControlEvent, handler: GeoAgentControlEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  getMap(): MapLibreMap | undefined {
    return this.map;
  }

  getContainer(): HTMLElement | undefined {
    return this.container;
  }

  getPanel(): HTMLElement | undefined {
    return this.panel;
  }

  private emit(event: GeoAgentControlEvent): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) {
      return;
    }
    const eventData = { type: event, state: this.getState() };
    handlers.forEach((handler) => handler(eventData));
  }

  private providerConfigs(): Record<GeoAgentProviderId, GeoAgentProviderConfig> {
    return {
      'openai-responses': this.providerConfig('openai-responses'),
      'openai-chat': this.providerConfig('openai-chat'),
      anthropic: this.providerConfig('anthropic'),
      google: this.providerConfig('google'),
      bedrock: this.providerConfig('bedrock'),
    };
  }

  private providerConfig(providerId: GeoAgentProviderId): GeoAgentProviderConfig {
    const base = BASE_PROVIDER_CONFIGS[providerId];
    return {
      ...base,
      storageKey: `${this.options.storagePrefix}.${providerId}.api_key`,
      defaultModel: defaultModelFor(providerId, this.options.defaultModel),
    };
  }

  private initialProviderId(): GeoAgentProviderId {
    const storedProvider = storageGet(`${this.options.storagePrefix}.provider`);
    if (storedProvider && storedProvider in BASE_PROVIDER_CONFIGS) {
      return storedProvider as GeoAgentProviderId;
    }
    return this.options.defaultProvider;
  }

  private initialModelId(providerId: GeoAgentProviderId): string {
    return (
      storageGet(this.modelStorageKey(providerId)) ||
      defaultModelFor(providerId, this.options.defaultModel)
    );
  }

  private modelStorageKey(providerId: GeoAgentProviderId): string {
    return `${this.options.storagePrefix}.model.${providerId}`;
  }

  private bedrockRegionStorageKey(): string {
    return `${this.options.storagePrefix}.bedrock.region`;
  }

  private earthEngineClientIdStorageKey(): string {
    return `${this.options.storagePrefix}.earthEngine.oauthClientId`;
  }

  private earthEngineProjectIdStorageKey(): string {
    return `${this.options.storagePrefix}.earthEngine.projectId`;
  }

  private initialBedrockRegion(): string {
    return (
      storageGet(this.bedrockRegionStorageKey()) ||
      BASE_PROVIDER_CONFIGS.bedrock.defaultRegion ||
      'us-west-2'
    );
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = `maplibregl-ctrl maplibregl-ctrl-group geoagent-control${
      this.options.className ? ` ${this.options.className}` : ''
    }`;

    const toggleButton = document.createElement('button');
    toggleButton.className = 'geoagent-control-toggle';
    toggleButton.type = 'button';
    toggleButton.title = this.options.title;
    toggleButton.setAttribute('aria-label', this.options.title);
    toggleButton.setAttribute('aria-expanded', String(!this.state.collapsed));
    toggleButton.innerHTML = `
      <span class="geoagent-control-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 6V3"></path>
          <path d="M9 3h6"></path>
          <rect x="4" y="6" width="16" height="12" rx="4"></rect>
          <path d="M8 18 6 21v-3"></path>
          <path d="M9 12h.01"></path>
          <path d="M15 12h.01"></path>
          <path d="M9 15h6"></path>
        </svg>
      </span>
    `;
    toggleButton.addEventListener('click', () => this.toggle());
    container.appendChild(toggleButton);
    return container;
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'geoagent-panel';
    panel.style.width = `${this.state.panelWidth}px`;

    const header = document.createElement('div');
    header.className = 'geoagent-panel-header';

    const title = document.createElement('span');
    title.className = 'geoagent-panel-title';
    title.textContent = this.options.title;

    const headerActions = document.createElement('div');
    headerActions.className = 'geoagent-title-actions';

    const status = document.createElement('span');
    status.className = 'geoagent-status connected';
    status.textContent = 'Ready';

    const closeButton = document.createElement('button');
    closeButton.className = 'geoagent-icon-button';
    closeButton.type = 'button';
    closeButton.title = 'Collapse panel';
    closeButton.setAttribute('aria-label', 'Collapse panel');
    closeButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m18 15-6-6-6 6"></path>
      </svg>
    `;
    closeButton.addEventListener('click', () => this.collapse());

    headerActions.append(status, closeButton);
    header.append(title, headerActions);

    const content = document.createElement('div');
    content.className = 'geoagent-panel-content';
    content.innerHTML = `
      <div class="geoagent-settings-grid">
        <label>
          Provider
          <select class="geoagent-provider"></select>
        </label>
        <label>
          <span class="geoagent-api-key-label">API Key</span>
          <input class="geoagent-api-key" type="password" autocomplete="off" placeholder="sk-..." />
        </label>
        <label>
          Model
          <input class="geoagent-model-id" />
        </label>
        <label class="geoagent-bedrock-region-row" hidden>
          Region
          <input class="geoagent-bedrock-region" autocomplete="off" placeholder="us-west-2" />
        </label>
      </div>

      <details class="geoagent-earth-engine">
        <summary>Earth Engine</summary>
        <div class="geoagent-earth-engine-grid">
          <label>
            OAuth Client ID
            <input class="geoagent-ee-client-id" autocomplete="off" placeholder="Google OAuth client ID" />
          </label>
          <label>
            Project ID
            <input class="geoagent-ee-project-id" autocomplete="off" placeholder="Earth Engine project" />
          </label>
        </div>
        <div class="geoagent-earth-engine-status"></div>
      </details>

      <div class="geoagent-toggle-row" aria-label="Agent permissions">
        <label class="geoagent-checkbox-row">
          <input class="geoagent-allow-code" type="checkbox" />
          <span>MapLibre JS</span>
        </label>
        <label class="geoagent-checkbox-row">
          <input class="geoagent-allow-destructive" type="checkbox" />
          <span>Layer removal</span>
        </label>
      </div>

      <div class="geoagent-log" aria-live="polite"></div>

      <form class="geoagent-form">
        <label>
          Prompt
          <textarea class="geoagent-prompt" placeholder="Add a red marker for San Francisco and zoom to it."></textarea>
        </label>
        <div class="geoagent-actions">
          <button class="geoagent-send" type="submit" disabled>Send</button>
          <button class="geoagent-cancel secondary" type="button" disabled>Cancel</button>
          <button class="geoagent-copy secondary" type="button">Copy Markdown</button>
          <button class="geoagent-clear secondary" type="button">Clear</button>
        </div>
      </form>
    `;

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'geoagent-panel-resize-handle';
    resizeHandle.setAttribute('role', 'separator');
    resizeHandle.setAttribute('aria-orientation', 'vertical');
    resizeHandle.setAttribute('aria-label', 'Resize GeoAgent panel');
    resizeHandle.addEventListener('mousedown', (event) => this.startPanelResize(event));

    panel.append(header, content, resizeHandle);
    this.ui = {
      status,
      providerSelect: this.requiredElement(content, '.geoagent-provider'),
      apiKeyLabel: this.requiredElement(content, '.geoagent-api-key-label'),
      apiKeyInput: this.requiredElement(content, '.geoagent-api-key'),
      modelIdInput: this.requiredElement(content, '.geoagent-model-id'),
      bedrockRegionLabel: this.requiredElement(content, '.geoagent-bedrock-region-row'),
      bedrockRegionInput: this.requiredElement(content, '.geoagent-bedrock-region'),
      earthEngineDetails: this.requiredElement(content, '.geoagent-earth-engine'),
      earthEngineClientIdInput: this.requiredElement(content, '.geoagent-ee-client-id'),
      earthEngineProjectIdInput: this.requiredElement(content, '.geoagent-ee-project-id'),
      earthEngineStatus: this.requiredElement(content, '.geoagent-earth-engine-status'),
      permissionRow: this.requiredElement(content, '.geoagent-toggle-row'),
      allowCodeInput: this.requiredElement(content, '.geoagent-allow-code'),
      allowDestructiveInput: this.requiredElement(content, '.geoagent-allow-destructive'),
      log: this.requiredElement(content, '.geoagent-log'),
      form: this.requiredElement(content, '.geoagent-form'),
      prompt: this.requiredElement(content, '.geoagent-prompt'),
      sendButton: this.requiredElement(content, '.geoagent-send'),
      cancelButton: this.requiredElement(content, '.geoagent-cancel'),
      clearButton: this.requiredElement(content, '.geoagent-clear'),
      copyButton: this.requiredElement(content, '.geoagent-copy'),
      resizeHandle,
      closeButton,
    };
    this.ui.permissionRow.hidden = !this.options.showPermissionToggles;
    this.setupEarthEngineControls();
    this.populateProviderOptions();
    this.wireUiEvents();
    this.syncUiFromState();
    return panel;
  }

  private requiredElement<T extends Element>(parent: ParentNode, selector: string): T {
    const element = parent.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing required element: ${selector}`);
    }
    return element;
  }

  private populateProviderOptions(): void {
    if (!this.ui) {
      return;
    }
    this.ui.providerSelect.replaceChildren();
    for (const provider of Object.values(this.providerConfigs())) {
      const option = document.createElement('option');
      option.value = provider.id;
      option.textContent = provider.label;
      this.ui.providerSelect.appendChild(option);
    }
  }

  private setupEarthEngineControls(): void {
    if (!this.ui) {
      return;
    }
    const enabled =
      !!this.options.earthEngine && this.options.earthEngine.enabled !== false;
    this.ui.earthEngineDetails.hidden = !enabled;
    if (!enabled) {
      return;
    }
    const oauthClientId = firstValue(
      storageGet(this.earthEngineClientIdStorageKey()),
      this.options.earthEngine?.oauthClientId,
    );
    const projectId = firstValue(
      storageGet(this.earthEngineProjectIdStorageKey()),
      this.options.earthEngine?.projectId,
    );
    this.ui.earthEngineClientIdInput.value = oauthClientId;
    this.ui.earthEngineProjectIdInput.value = projectId;
    this.ui.earthEngineDetails.open = !oauthClientId || !projectId;
    this.applyEarthEngineSettings();
  }

  private applyEarthEngineSettings(): void {
    if (!this.ui || !this.options.earthEngine) {
      return;
    }
    const oauthClientId = this.ui.earthEngineClientIdInput.value.trim();
    const projectId = this.ui.earthEngineProjectIdInput.value.trim();
    if (oauthClientId) {
      storageSet(this.earthEngineClientIdStorageKey(), oauthClientId);
    } else {
      storageRemove(this.earthEngineClientIdStorageKey());
    }
    if (projectId) {
      storageSet(this.earthEngineProjectIdStorageKey(), projectId);
    } else {
      storageRemove(this.earthEngineProjectIdStorageKey());
    }
    this.options.earthEngine = {
      ...this.options.earthEngine,
      oauthClientId,
      projectId,
    };
    this.tools?.updateEarthEngineOptions(this.options.earthEngine);
    this.updateEarthEngineStatus();
    this.emit('statechange');
  }

  private updateEarthEngineStatus(): void {
    if (!this.ui || this.ui.earthEngineDetails.hidden) {
      return;
    }
    const oauthClientId = this.ui.earthEngineClientIdInput.value.trim();
    const projectId = this.ui.earthEngineProjectIdInput.value.trim();
    const earthEngine = this.state.data?.earthEngine as
      | { initialized?: boolean; layerCount?: number }
      | undefined;
    if (!oauthClientId || !projectId) {
      this.ui.earthEngineStatus.textContent =
        'Enter OAuth and project values before running Earth Engine tools.';
      return;
    }
    this.ui.earthEngineStatus.textContent = earthEngine
      ? `Initialized: ${earthEngine.initialized ? 'yes' : 'no'}; layers: ${earthEngine.layerCount ?? 0}.`
      : 'Earth Engine tools configured.';
  }

  private wireUiEvents(): void {
    const ui = this.ui;
    if (!ui) {
      return;
    }
    ui.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.sendPrompt();
    });
    ui.providerSelect.addEventListener('change', () => {
      const providerId = this.currentProviderId();
      storageSet(`${this.options.storagePrefix}.provider`, providerId);
      this.state.providerId = providerId;
      this.state.modelId = this.initialModelId(providerId);
      this.loadProviderSettings();
      this.invalidateAgent();
      this.updateControls();
      this.emit('statechange');
    });
    ui.apiKeyInput.addEventListener('input', () => {
      const apiKey = ui.apiKeyInput.value.trim();
      const storageKey = this.currentProviderConfig().storageKey;
      if (apiKey) {
        storageSet(storageKey, apiKey);
      } else {
        storageRemove(storageKey);
      }
      this.invalidateAgent();
      this.updateControls();
    });
    ui.modelIdInput.addEventListener('input', () => {
      const modelId = ui.modelIdInput.value.trim();
      this.state.modelId = modelId;
      if (modelId) {
        storageSet(this.modelStorageKey(this.state.providerId), modelId);
      } else {
        storageRemove(this.modelStorageKey(this.state.providerId));
      }
      this.invalidateAgent();
      this.updateControls();
      this.emit('statechange');
    });
    ui.bedrockRegionInput.addEventListener('input', () => {
      const region = ui.bedrockRegionInput.value.trim();
      this.state.bedrockRegion = region;
      if (region) {
        storageSet(this.bedrockRegionStorageKey(), region);
      } else {
        storageRemove(this.bedrockRegionStorageKey());
      }
      this.invalidateAgent();
      this.updateControls();
      this.emit('statechange');
    });
    ui.earthEngineClientIdInput.addEventListener('input', () => {
      this.applyEarthEngineSettings();
    });
    ui.earthEngineProjectIdInput.addEventListener('input', () => {
      this.applyEarthEngineSettings();
    });
    ui.allowCodeInput.addEventListener('change', () => {
      this.state.allowCodeExecution = ui.allowCodeInput.checked;
      this.invalidateAgent();
      this.emit('statechange');
    });
    ui.allowDestructiveInput.addEventListener('change', () => {
      this.state.allowDestructiveTools = ui.allowDestructiveInput.checked;
      this.emit('statechange');
    });
    ui.prompt.addEventListener('input', () => this.updateControls());
    ui.prompt.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.ctrlKey && !event.isComposing) {
        event.preventDefault();
        ui.prompt.setRangeText(
          '\n',
          ui.prompt.selectionStart,
          ui.prompt.selectionEnd,
          'end',
        );
        ui.prompt.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (
        event.key === 'Enter' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        void this.sendPrompt();
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        this.handlePromptHistoryKey(event);
      }
    });
    ui.clearButton.addEventListener('click', () => {
      if (this.state.busy) {
        return;
      }
      ui.log.replaceChildren();
      this.streamingAssistantTextEl = null;
      this.streamingAssistantText = '';
      this.invalidateAgent();
      this.appendLog('system', 'Chat cleared.');
    });
    ui.copyButton.addEventListener('click', () => {
      void this.copyConversationAsMarkdown();
    });
    ui.cancelButton.addEventListener('click', () => this.cancelActiveRun());
  }

  private setupEventListeners(): void {
    this.clickOutsideHandler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        this.container &&
        this.panel &&
        !this.container.contains(target) &&
        !this.panel.contains(target)
      ) {
        this.collapse();
      }
    };
    document.addEventListener('click', this.clickOutsideHandler);

    this.resizeHandler = () => {
      if (!this.state.collapsed) {
        this.updatePanelPosition();
      }
    };
    window.addEventListener('resize', this.resizeHandler);

    this.mapResizeHandler = () => {
      if (!this.state.collapsed) {
        this.updatePanelPosition();
      }
    };
    this.map?.on('resize', this.mapResizeHandler);
  }

  private rememberPrompt(text: string): void {
    if (this.promptHistory[this.promptHistory.length - 1] !== text) {
      this.promptHistory.push(text);
    }
    this.promptHistoryIndex = -1;
    this.promptHistoryDraft = '';
  }

  private applyPromptHistoryValue(value: string): void {
    if (!this.ui) {
      return;
    }
    this.ui.prompt.value = value;
    this.updateControls();
    requestAnimationFrame(() => {
      this.ui?.prompt.setSelectionRange(value.length, value.length);
    });
  }

  private handlePromptHistoryKey(event: KeyboardEvent): void {
    if (!this.ui || this.promptHistory.length === 0) {
      return;
    }
    const prompt = this.ui.prompt;
    const beforeSelection = prompt.value.slice(0, prompt.selectionStart);
    const afterSelection = prompt.value.slice(prompt.selectionEnd);
    const onFirstLine = !beforeSelection.includes('\n');
    const onLastLine = !afterSelection.includes('\n');
    if (event.key === 'ArrowUp' && !onFirstLine) {
      return;
    }
    if (event.key === 'ArrowDown' && !onLastLine) {
      return;
    }

    event.preventDefault();

    if (this.promptHistoryIndex === -1) {
      this.promptHistoryDraft = prompt.value;
    }

    if (event.key === 'ArrowUp') {
      this.promptHistoryIndex =
        this.promptHistoryIndex === -1
          ? this.promptHistory.length - 1
          : Math.max(0, this.promptHistoryIndex - 1);
      this.applyPromptHistoryValue(this.promptHistory[this.promptHistoryIndex]);
      return;
    }

    if (this.promptHistoryIndex === -1) {
      return;
    }
    this.promptHistoryIndex += 1;
    if (this.promptHistoryIndex >= this.promptHistory.length) {
      this.promptHistoryIndex = -1;
      this.applyPromptHistoryValue(this.promptHistoryDraft);
      return;
    }
    this.applyPromptHistoryValue(this.promptHistory[this.promptHistoryIndex]);
  }

  private constrainPanelWidth(width: number): number {
    return Math.max(
      this.options.panelMinWidth,
      Math.min(this.options.panelMaxWidth, Math.round(width)),
    );
  }

  private startPanelResize(event: MouseEvent): void {
    if (!this.panel) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const position = this.getControlPosition();
    const resizeDirection =
      position === 'top-left' || position === 'bottom-left' ? 1 : -1;
    const startX = event.clientX;
    const startWidth = this.panel.getBoundingClientRect().width || this.state.panelWidth;

    this.stopPanelResize();
    this.panel.classList.add('resizing');
    document.body.classList.add('geoagent-panel-resizing');

    this.panelResizeMoveHandler = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const nextWidth = startWidth + (moveEvent.clientX - startX) * resizeDirection;
      this.setState({ panelWidth: nextWidth });
    };
    this.panelResizeUpHandler = () => this.stopPanelResize();

    document.addEventListener('mousemove', this.panelResizeMoveHandler);
    document.addEventListener('mouseup', this.panelResizeUpHandler);
  }

  private stopPanelResize(): void {
    if (this.panelResizeMoveHandler) {
      document.removeEventListener('mousemove', this.panelResizeMoveHandler);
      this.panelResizeMoveHandler = null;
    }
    if (this.panelResizeUpHandler) {
      document.removeEventListener('mouseup', this.panelResizeUpHandler);
      this.panelResizeUpHandler = null;
    }
    this.panel?.classList.remove('resizing');
    document.body.classList.remove('geoagent-panel-resizing');
  }

  private syncUiFromState(): void {
    if (!this.ui || !this.container) {
      return;
    }
    const toggleButton = this.container.querySelector<HTMLButtonElement>('.geoagent-control-toggle');
    toggleButton?.setAttribute('aria-expanded', String(!this.state.collapsed));
    this.ui.providerSelect.value = this.state.providerId;
    this.ui.modelIdInput.value = this.state.modelId;
    this.ui.bedrockRegionInput.value = this.state.bedrockRegion;
    this.ui.bedrockRegionLabel.hidden = this.state.providerId !== 'bedrock';
    this.ui.allowCodeInput.checked = this.state.allowCodeExecution;
    this.ui.allowDestructiveInput.checked = this.state.allowDestructiveTools;
    this.ui.closeButton.setAttribute('aria-expanded', String(!this.state.collapsed));
  }

  private currentProviderId(): GeoAgentProviderId {
    const providerId = this.ui?.providerSelect.value;
    return providerId && providerId in BASE_PROVIDER_CONFIGS
      ? (providerId as GeoAgentProviderId)
      : this.state.providerId;
  }

  private currentProviderConfig(): GeoAgentProviderConfig {
    return this.providerConfig(this.currentProviderId());
  }

  private loadProviderSettings(): void {
    if (!this.ui) {
      return;
    }
    const provider = this.currentProviderConfig();
    this.state.providerId = provider.id;
    this.state.modelId =
      storageGet(this.modelStorageKey(provider.id)) || provider.defaultModel;
    this.ui.providerSelect.value = provider.id;
    this.ui.apiKeyLabel.textContent = provider.keyLabel;
    this.ui.apiKeyInput.placeholder = provider.keyPlaceholder;
    this.ui.apiKeyInput.value = storageGet(provider.storageKey) || '';
    this.ui.modelIdInput.value = this.state.modelId;
    this.ui.modelIdInput.placeholder = provider.defaultModel;
    this.state.bedrockRegion = this.initialBedrockRegion();
    this.ui.bedrockRegionInput.value = this.state.bedrockRegion;
    this.ui.bedrockRegionInput.placeholder = provider.defaultRegion || 'us-west-2';
    this.ui.bedrockRegionLabel.hidden = provider.id !== 'bedrock';
    this.updateEarthEngineStatus();
  }

  private setStatus(text: string, kind = ''): void {
    if (!this.ui) {
      return;
    }
    this.ui.status.textContent = text;
    this.ui.status.className = `geoagent-status ${kind}`.trim();
  }

  private appendLog(role: string, text: string, markdown = text): HTMLDivElement {
    if (!this.ui) {
      throw new Error('GeoAgent control UI is not mounted.');
    }
    const entry = document.createElement('div');
    entry.className = 'geoagent-entry';
    entry.dataset.role = role;
    entry.dataset.markdown = markdown;
    const roleEl = document.createElement('div');
    roleEl.className = 'geoagent-role';
    roleEl.textContent = role;
    const textEl = document.createElement('div');
    textEl.className = 'geoagent-text';
    textEl.textContent = text;
    entry.append(roleEl, textEl);
    this.ui.log.append(entry);
    this.ui.log.scrollTop = this.ui.log.scrollHeight;
    this.updateControls();
    return textEl;
  }

  private renderAssistantMarkdown(element: HTMLElement, markdown: string): void {
    const html = marked(markdown || '', {
      async: false,
      breaks: false,
      gfm: true,
    });
    element.innerHTML = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
    });
    for (const link of element.querySelectorAll('a')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  }

  private appendAssistantLog(markdown: string): HTMLDivElement {
    const textEl = this.appendLog('assistant', '', markdown);
    textEl.classList.add('markdown');
    this.renderAssistantMarkdown(textEl, markdown);
    return textEl;
  }

  private conversationMarkdown(): string {
    if (!this.ui) {
      return '';
    }
    return Array.from(this.ui.log.querySelectorAll<HTMLElement>('.geoagent-entry'))
      .map((entry) => {
        const role =
          entry.dataset.role ||
          entry.querySelector<HTMLElement>('.geoagent-role')?.textContent ||
          'message';
        const markdown =
          entry.dataset.markdown ??
          entry.querySelector<HTMLElement>('.geoagent-text')?.textContent ??
          '';
        return `## ${markdownHeading(role)}\n\n${markdown.trim()}`;
      })
      .filter((section) => section.trim().length > 0)
      .join('\n\n');
  }

  private async copyConversationAsMarkdown(): Promise<void> {
    const markdown = this.conversationMarkdown();
    if (!markdown) {
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API is unavailable.');
      }
      await navigator.clipboard.writeText(markdown);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = markdown;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    this.setStatus('Copied', 'connected');
    window.setTimeout(() => this.setStatus('Ready', 'connected'), 1200);
  }

  private updateControls(): void {
    if (!this.ui) {
      return;
    }
    this.ui.sendButton.disabled =
      this.state.busy ||
      !this.ui.prompt.value.trim() ||
      !this.ui.apiKeyInput.value.trim() ||
      !this.ui.modelIdInput.value.trim() ||
      (this.state.providerId === 'bedrock' && !this.ui.bedrockRegionInput.value.trim());
    this.ui.cancelButton.disabled = !this.state.busy || this.cancelRequested;
    this.ui.clearButton.disabled = this.state.busy;
    this.ui.copyButton.disabled = this.ui.log.childElementCount === 0;
  }

  private invalidateAgent(): void {
    this.agent = null;
    this.agentSignature = '';
  }

  private cancelActiveRun(): void {
    if (!this.state.busy || this.cancelRequested) {
      return;
    }
    this.cancelRequested = true;
    this.activeAbortController?.abort();
    this.agent?.cancel();
    this.setStatus('Cancelling', 'connected');
    this.appendLog('system', 'Cancellation requested.');
    this.updateControls();
  }

  private async createProviderModel(
    providerId: GeoAgentProviderId,
    modelId: string,
    apiKey: string,
    bedrockRegion: string,
  ): Promise<Model> {
    if (providerId === 'openai-responses' || providerId === 'openai-chat') {
      const { OpenAIModel } = await import('@strands-agents/sdk/models/openai');
      return new OpenAIModel({
        api: providerId === 'openai-responses' ? 'responses' : 'chat',
        modelId,
        apiKey,
        clientConfig: {
          dangerouslyAllowBrowser: true,
        },
      });
    }
    if (providerId === 'anthropic') {
      const { AnthropicModel } = await import('@strands-agents/sdk/models/anthropic');
      return new AnthropicModel({
        modelId,
        apiKey,
        clientConfig: {
          dangerouslyAllowBrowser: true,
        },
      });
    }
    if (providerId === 'google') {
      const { GoogleModel } = await import('@strands-agents/sdk/models/google');
      return new GoogleModel({
        modelId,
        apiKey,
      });
    }
    if (providerId === 'bedrock') {
      const { BedrockModel } = await import('@strands-agents/sdk/models/bedrock');
      return new BedrockModel({
        region: bedrockRegion,
        modelId,
        apiKey,
      });
    }
    throw new Error(`Unsupported browser provider: ${providerId}`);
  }

  private async getAgent(): Promise<Agent> {
    if (!this.ui || !this.tools) {
      throw new Error('GeoAgent control is not mounted.');
    }
    const provider = this.currentProviderConfig();
    const apiKey = this.ui.apiKeyInput.value.trim();
    const modelId = this.ui.modelIdInput.value.trim();
    const bedrockRegion = this.ui.bedrockRegionInput.value.trim();
    if (!apiKey) {
      throw new Error(`${provider.keyLabel} is required.`);
    }
    if (!modelId) {
      throw new Error('Model id is required.');
    }
    if (provider.id === 'bedrock' && !bedrockRegion) {
      throw new Error('Bedrock region is required.');
    }

    const signature = JSON.stringify({
      providerId: provider.id,
      modelId,
      bedrockRegion: provider.id === 'bedrock' ? bedrockRegion : '',
      apiKey,
      allowCodeExecution: this.state.allowCodeExecution,
    });
    if (this.agent && this.agentSignature === signature) {
      return this.agent;
    }

    const systemPrompt = this.state.allowCodeExecution
      ? `${BROWSER_MAPLIBRE_SYSTEM_PROMPT}\n\n${BROWSER_MAPLIBRE_CODE_SYSTEM_PROMPT}`
      : BROWSER_MAPLIBRE_SYSTEM_PROMPT;
    const model = await this.createProviderModel(provider.id, modelId, apiKey, bedrockRegion);
    this.agent = new Agent({
      name: 'GeoAgent MapLibre Browser',
      model,
      systemPrompt,
      tools: this.tools.createTools(),
      printer: false,
      toolExecutor: 'sequential',
    });
    this.agentSignature = signature;
    return this.agent;
  }

  private appendAssistantDelta(text: string): void {
    if (!text || !this.ui) {
      return;
    }
    if (!this.streamingAssistantTextEl) {
      this.streamingAssistantTextEl = this.appendAssistantLog('');
    }
    this.streamingAssistantText += text;
    this.streamingAssistantTextEl.closest<HTMLElement>('.geoagent-entry')!.dataset.markdown =
      this.streamingAssistantText;
    this.renderAssistantMarkdown(this.streamingAssistantTextEl, this.streamingAssistantText);
    this.ui.log.scrollTop = this.ui.log.scrollHeight;
  }

  private getStreamingAssistantElement(): HTMLDivElement | null {
    return this.streamingAssistantTextEl;
  }

  private handleAgentStreamEvent(event: AgentStreamEvent): string | undefined {
    if (event.type === 'modelStreamUpdateEvent') {
      const modelEvent = event.event;
      if (
        modelEvent.type === 'modelContentBlockDeltaEvent' &&
        modelEvent.delta.type === 'textDelta'
      ) {
        this.appendAssistantDelta(modelEvent.delta.text);
      }
      return undefined;
    }

    if (event.type === 'beforeToolCallEvent') {
      this.appendLog('tool', `Running ${event.toolUse.name}`);
      return undefined;
    }

    if (event.type === 'agentResultEvent') {
      return event.result.toString();
    }

    return undefined;
  }

  private async sendPrompt(): Promise<void> {
    if (!this.ui) {
      return;
    }
    const text = this.ui.prompt.value.trim();
    if (!text || this.state.busy) {
      return;
    }
    this.rememberPrompt(text);
    this.appendLog('user', text);
    this.streamingAssistantTextEl = null;
    this.streamingAssistantText = '';
    this.ui.prompt.value = '';
    this.state.busy = true;
    this.cancelRequested = false;
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    this.setStatus('Running', 'connected');
    this.updateControls();
    this.emit('statechange');
    try {
      const activeAgent = await this.getAgent();
      let finalAnswer = '';
      for await (const event of activeAgent.stream(text, {
        cancelSignal: abortController.signal,
      })) {
        finalAnswer = this.handleAgentStreamEvent(event) ?? finalAnswer;
      }
      const answer = abortController.signal.aborted
        ? 'Cancelled.'
        : finalAnswer || this.streamingAssistantText || 'Done.';
      const assistantEl = this.getStreamingAssistantElement();
      if (assistantEl) {
        assistantEl.closest<HTMLElement>('.geoagent-entry')!.dataset.markdown = answer;
        this.renderAssistantMarkdown(assistantEl, answer);
      } else {
        this.appendAssistantLog(answer);
      }
      this.setStatus(abortController.signal.aborted ? 'Cancelled' : 'Ready', 'connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (abortController.signal.aborted) {
        this.appendAssistantLog('Cancelled.');
        this.setStatus('Cancelled', 'connected');
      } else {
        this.appendLog('error', message);
        this.setStatus('Error', 'error');
      }
    } finally {
      this.state.busy = false;
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
      this.cancelRequested = false;
      this.streamingAssistantTextEl = null;
      this.streamingAssistantText = '';
      this.updateControls();
      this.emit('statechange');
    }
  }

  private getControlPosition():
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right' {
    const parent = this.container?.parentElement;
    if (!parent) return this.options.position;
    if (parent.classList.contains('maplibregl-ctrl-top-left')) return 'top-left';
    if (parent.classList.contains('maplibregl-ctrl-top-right')) return 'top-right';
    if (parent.classList.contains('maplibregl-ctrl-bottom-left')) return 'bottom-left';
    if (parent.classList.contains('maplibregl-ctrl-bottom-right')) return 'bottom-right';
    return this.options.position;
  }

  private updatePanelPosition(): void {
    if (!this.container || !this.panel || !this.mapContainer) return;
    const button = this.container.querySelector('.geoagent-control-toggle');
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const mapRect = this.mapContainer.getBoundingClientRect();
    const position = this.getControlPosition();
    const resizeOnLeft = position === 'top-right' || position === 'bottom-right';
    const buttonTop = buttonRect.top - mapRect.top;
    const buttonBottom = mapRect.bottom - buttonRect.bottom;
    const buttonLeft = buttonRect.left - mapRect.left;
    const buttonRight = mapRect.right - buttonRect.right;
    const panelGap = 5;

    this.panel.style.top = '';
    this.panel.style.bottom = '';
    this.panel.style.left = '';
    this.panel.style.right = '';
    this.panel.classList.toggle('resize-left', resizeOnLeft);
    this.panel.classList.toggle('resize-right', !resizeOnLeft);

    switch (position) {
      case 'top-left':
        this.panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this.panel.style.left = `${buttonLeft}px`;
        break;
      case 'top-right':
        this.panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this.panel.style.right = `${buttonRight}px`;
        break;
      case 'bottom-left':
        this.panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this.panel.style.left = `${buttonLeft}px`;
        break;
      case 'bottom-right':
        this.panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this.panel.style.right = `${buttonRight}px`;
        break;
    }
  }
}
