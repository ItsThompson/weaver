import http from 'node:http';
import { DEFAULT_CONFIG, type WeaverConfig } from '@weaver/shared/types';

export function fetchConfig(baseUrl: string): Promise<WeaverConfig> {
  return new Promise((resolve) => {
    http.get(`${baseUrl}/api/config`, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve((JSON.parse(body) as { config: WeaverConfig }).config);
        } catch {
          resolve({ ...DEFAULT_CONFIG });
        }
      });
    }).on('error', () => resolve({ ...DEFAULT_CONFIG }));
  });
}

export function putConfig(baseUrl: string, config: WeaverConfig): void {
  const data = JSON.stringify(config);
  const req = http.request(`${baseUrl}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
  });
  req.on('error', () => {});
  req.end(data);
}
