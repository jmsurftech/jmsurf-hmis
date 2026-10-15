/** Edge agent configuration (environment variables). */
export const config = {
  apiUrl: process.env.EDGE_API_URL ?? 'http://localhost:4000/api/lab/analyzer/results',
  deviceKey: process.env.EDGE_DEVICE_KEY ?? '',
  astmPort: Number(process.env.EDGE_ASTM_PORT ?? 5001),
  hl7Port: Number(process.env.EDGE_HL7_PORT ?? 2575),
  queueDir: process.env.EDGE_QUEUE_DIR ?? './edge-queue',
  flushIntervalMs: Number(process.env.EDGE_FLUSH_MS ?? 5000),
};
