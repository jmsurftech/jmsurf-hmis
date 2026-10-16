import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmClient } from './llm.client';

/** AI drafting assistance (Claude via @anthropic-ai/sdk, offline rule-based fallback) + statistical stock forecast. */
@Module({ controllers: [AiController], providers: [AiService, LlmClient], exports: [AiService] })
export class AiModule {}
