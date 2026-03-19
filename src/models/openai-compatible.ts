import OpenAI from "openai";

export interface OpenAICompatibleClientOptions {
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export class OpenAICompatibleClient {
  readonly openaiClient: OpenAI;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens?: number;

  constructor(options: OpenAICompatibleClientOptions) {
    this.openaiClient = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      timeout: options.timeoutMs,
    });
    this.model = options.model;
    this.temperature = options.temperature ?? 0.2;
    this.maxTokens = options.maxTokens;
  }

  async createChatCompletion(
    params: Omit<
      OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      "model"
    > & {
      model?: string;
    },
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return this.openaiClient.chat.completions.create({
      model: params.model ?? this.model,
      ...params,
    });
  }

  async *createChatCompletionStream(
    params: Omit<
      OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
      "model" | "stream"
    > & {
      model?: string;
    },
  ): AsyncGenerator<OpenAI.Chat.Completions.ChatCompletionChunk, void, unknown> {
    const stream = await this.openaiClient.chat.completions.create({
      model: params.model ?? this.model,
      ...params,
      stream: true,
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
