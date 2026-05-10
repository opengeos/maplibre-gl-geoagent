import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'blob:maplibre-worker';
}

// Cleanup after each test (for React component tests)
afterEach(() => {
  cleanup();
});
