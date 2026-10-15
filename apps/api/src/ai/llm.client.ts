import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';
/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

export interface LlmResult<T> { data: T; model: string; inputTokens: number; outputTokens: number }

/**
 * Thin wrapper around the official Anthropic SDK. Returns null when ANTHROPIC_API_KEY is not set so callers
 * use their deterministic offline fallback. Responses are constrained to a JSON schema (structured outputs).
 */
@Injectable()
export class LlmClient {
  private readonly log = new Logger('AI');
  private client?: Anthropic;

  get model() { return process.env.AI_MODEL || DEFAULT_AI_MODEL; }
  get enabled() { return !!process.env.ANTHROPIC_API_KEY; }

  private sdk() {
    if (!this.client) this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
    return this.client;
  }

  async json<T>(system: string, user: string, schema: Record<string, unknown>): Promise<LlmResult<T> | null> {
    if (!this.enabled) return null;
    const model = this.model;
    const useFallbacks = FALLBACK_MODELS.includes(model) && process.env.AI_REFUSAL_FALLBACK !== 'off';
    const res = await this.sdk().beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: (process.env.AI_EFFORT as any) || 'low', format: { type: 'json_schema', schema } },
      ...(useFallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (res.stop_reason === 'refusal') throw new Error('Model declined the request');
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    let data: T;
    try { data = JSON.parse(text) as T; } catch { this.log.warn(`Non-JSON AI output (${res.stop_reason})`); throw new Error('AI returned malformed output'); }
    return { data, model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  }
}
