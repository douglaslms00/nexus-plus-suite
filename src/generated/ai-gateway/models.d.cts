import "@lovable.dev/ai-gateway";

/* The MIT License

Copyright (c) OpenAI (https://openai.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
 */
declare namespace ModelContract_7ff6a9f995dcaa1c {
export type paths = Record<string, never>;
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        
        ChatCompletionAllowedTools: {
            
            mode: "auto" | "required";
            tools: {
                [key: string]: unknown;
            }[];
        };
        
        ChatCompletionAllowedToolsChoice: {
            allowed_tools: components["schemas"]["ChatCompletionAllowedTools"];
            
            type: "allowed_tools";
        };
        ChatCompletionFunctionCallOption: {
            name: string;
        };
        
        ChatCompletionFunctions: {
            name: string;
            parameters?: components["schemas"]["FunctionParameters"];
        };
        
        ChatCompletionMessageCustomToolCall: {
            custom: {
                input: string;
                name: string;
            };
            id: string;
            
            type: "custom";
        };
        
        ChatCompletionMessageToolCall: {
            function: {
                arguments: string;
                name: string;
            };
            id: string;
            
            type: "function";
        };
        ChatCompletionMessageToolCalls: (components["schemas"]["ChatCompletionMessageToolCall"] | components["schemas"]["ChatCompletionMessageCustomToolCall"])[];
        
        ChatCompletionNamedToolChoice: {
            function: {
                name: string;
            };
            
            type: "function";
        };
        
        ChatCompletionNamedToolChoiceCustom: {
            custom: {
                name: string;
            };
            
            type: "custom";
        };
        
        ChatCompletionRequestAssistantMessage: {
            audio?: {
                id: string;
            } | null;
            content?: (string | components["schemas"]["ChatCompletionRequestAssistantMessageContentPart"][]) | null;
            function_call?: {
                arguments: string;
                name: string;
            } | null;
            name?: string;
            refusal?: string | null;
            
            role: "assistant";
            tool_calls?: components["schemas"]["ChatCompletionMessageToolCalls"];
        };
        ChatCompletionRequestAssistantMessageContentPart: components["schemas"]["ChatCompletionRequestMessageContentPartText"] | components["schemas"]["ChatCompletionRequestMessageContentPartRefusal"];
        
        ChatCompletionRequestDeveloperMessage: {
            content: string | components["schemas"]["ChatCompletionRequestMessageContentPartText"][];
            name?: string;
            
            role: "developer";
        };
        
        ChatCompletionRequestFunctionMessage: {
            content: string | null;
            name: string;
            
            role: "function";
        };
        ChatCompletionRequestMessage: components["schemas"]["ChatCompletionRequestDeveloperMessage"] | components["schemas"]["ChatCompletionRequestSystemMessage"] | components["schemas"]["ChatCompletionRequestUserMessage"] | components["schemas"]["ChatCompletionRequestAssistantMessage"] | components["schemas"]["ChatCompletionRequestToolMessage"] | components["schemas"]["ChatCompletionRequestFunctionMessage"];
        
        ChatCompletionRequestMessageContentPartAudio: {
            input_audio: {
                data: string;
                
                format: "wav" | "mp3";
            };
            prompt_cache_breakpoint?: components["schemas"]["PromptCacheBreakpointParam"];
            
            type: "input_audio";
        };
        
        ChatCompletionRequestMessageContentPartFile: {
            file: {
                file_data?: string;
                file_id?: string;
                filename?: string;
            };
            prompt_cache_breakpoint?: components["schemas"]["PromptCacheBreakpointParam"];
            
            type: "file";
        };
        
        ChatCompletionRequestMessageContentPartImage: {
            image_url: {
                
                detail?: "auto" | "low" | "high" | "original";
                
                url: string;
            };
            prompt_cache_breakpoint?: components["schemas"]["PromptCacheBreakpointParam"];
            
            type: "image_url";
        };
        
        ChatCompletionRequestMessageContentPartRefusal: {
            refusal: string;
            
            type: "refusal";
        };
        
        ChatCompletionRequestMessageContentPartText: {
            prompt_cache_breakpoint?: components["schemas"]["PromptCacheBreakpointParam"];
            text: string;
            
            type: "text";
        };
        
        ChatCompletionRequestMessageContentPartVideo: {
            
            type: "video_url";
            video_url: {
                
                url: string;
            };
        };
        
        ChatCompletionRequestSystemMessage: {
            content: string | components["schemas"]["ChatCompletionRequestSystemMessageContentPart"][];
            name?: string;
            
            role: "system";
        };
        ChatCompletionRequestSystemMessageContentPart: components["schemas"]["ChatCompletionRequestMessageContentPartText"];
        
        ChatCompletionRequestToolMessage: {
            content: string | components["schemas"]["ChatCompletionRequestToolMessageContentPart"][];
            
            role: "tool";
            tool_call_id: string;
        };
        ChatCompletionRequestToolMessageContentPart: components["schemas"]["ChatCompletionRequestMessageContentPartText"];
        
        ChatCompletionRequestUserMessage: {
            content: string | components["schemas"]["ChatCompletionRequestUserMessageContentPart"][];
            name?: string;
            
            role: "user";
        };
        ChatCompletionRequestUserMessageContentPart: components["schemas"]["ChatCompletionRequestMessageContentPartText"] | components["schemas"]["ChatCompletionRequestMessageContentPartImage"] | components["schemas"]["ChatCompletionRequestMessageContentPartAudio"] | components["schemas"]["ChatCompletionRequestMessageContentPartFile"] | components["schemas"]["ChatCompletionRequestMessageContentPartVideo"];
        ChatCompletionStreamOptions: {
            include_obfuscation?: boolean;
            include_usage?: boolean;
        } | null;
        
        ChatCompletionTool: {
            function: components["schemas"]["FunctionObject"];
            
            type: "function";
        };
        ChatCompletionToolChoiceOption: ("none" | "auto" | "required") | components["schemas"]["ChatCompletionAllowedToolsChoice"] | components["schemas"]["ChatCompletionNamedToolChoice"] | components["schemas"]["ChatCompletionNamedToolChoiceCustom"];
        ChatEvent: components["schemas"]["Output_CreateChatCompletionStreamResponse"] | components["schemas"]["GatewayErrorResponse"];
        ChatRequest: {
            audio?: never;
            frequency_penalty?: number | null;
            
            function_call?: ("none" | "auto") | components["schemas"]["ChatCompletionFunctionCallOption"];
            
            functions?: components["schemas"]["ChatCompletionFunctions"][];
            logit_bias?: {
                [key: string]: number;
            } | null;
            logprobs?: boolean | null;
            max_completion_tokens?: number | null;
            max_tokens?: number | null;
            messages: components["schemas"]["ChatCompletionRequestMessage"][];
            metadata?: components["schemas"]["Metadata"];
            modalities?: "text"[] | null;
            
            model: "google/gemini-4-argon";
            moderation?: components["schemas"]["ModerationParam"] | null;
            n?: number | null;
            parallel_tool_calls?: components["schemas"]["ParallelToolCalls"];
            prediction?: components["schemas"]["PredictionContent"] | null;
            presence_penalty?: number | null;
            prompt_cache_key?: string | null;
            prompt_cache_options?: components["schemas"]["PromptCacheOptionsParam"];
            reasoning_effort?: components["schemas"]["ReasoningEffort"];
            response_format?: components["schemas"]["ResponseFormatText"] | components["schemas"]["ResponseFormatJsonSchema"] | components["schemas"]["ResponseFormatJsonObject"];
            safety_identifier?: string | null;
            seed?: number | null;
            service_tier?: components["schemas"]["ServiceTier"];
            stop?: components["schemas"]["StopConfiguration"];
            stream?: boolean | null;
            stream_options?: components["schemas"]["ChatCompletionStreamOptions"];
            temperature?: number | null;
            tool_choice?: components["schemas"]["ChatCompletionToolChoiceOption"];
            tools?: (components["schemas"]["ChatCompletionTool"] | components["schemas"]["CustomToolChatCompletions"])[];
            top_logprobs?: number | null;
            top_p?: number | null;
            
            user?: string | null;
            verbosity?: components["schemas"]["Verbosity"];
            
            web_search_options?: {
                search_context_size?: components["schemas"]["WebSearchContextSize"];
                user_location?: {
                    approximate: components["schemas"]["WebSearchLocation"];
                    
                    type: "approximate";
                } | null;
            };
        };
        ChatResponse: components["schemas"]["Output_CreateChatCompletionResponse"];
        
        CustomToolChatCompletions: {
            
            custom: {
                format?: {
                    
                    type: "text";
                } | {
                    
                    grammar: {
                        definition: string;
                        
                        syntax: "lark" | "regex";
                    };
                    
                    type: "grammar";
                };
                name: string;
            };
            
            type: "custom";
        };
        FunctionObject: {
            name: string;
            parameters?: components["schemas"]["FunctionParameters"];
            strict?: boolean | null;
        };
        FunctionParameters: {
            [key: string]: unknown;
        };
        GatewayErrorResponse: {
            error: {
                code?: string | null;
                message: string;
                metadata?: {
                    provider_name?: unknown;
                    raw?: unknown;
                };
                param?: unknown;
                type?: string;
            };
            usage?: {
                [key: string]: unknown;
            };
        };
        Metadata: {
            [key: string]: string;
        } | null;
        ModerationConfigParam: {
            mode: components["schemas"]["ModerationMode"];
        };
        
        ModerationMode: "score" | "block";
        ModerationParam: {
            model: string;
            policy?: components["schemas"]["ModerationPolicyParam"] | null;
        };
        ModerationPolicyParam: {
            input?: components["schemas"]["ModerationConfigParam"] | null;
            output?: components["schemas"]["ModerationConfigParam"] | null;
        };
        
        Output_ChatCompletionMessageCustomToolCall: {
            custom: {
                input: string;
                name: string;
            };
            id: string;
            
            type: "custom";
        };
        
        Output_ChatCompletionMessageToolCall: {
            function: {
                arguments: string;
                name: string;
            };
            id: string;
            
            type: "function";
        };
        Output_ChatCompletionMessageToolCallChunk: {
            function?: {
                arguments?: string;
                name?: string;
            };
            id?: string;
            index: number;
            
            type?: "function";
        };
        Output_ChatCompletionMessageToolCalls: (components["schemas"]["Output_ChatCompletionMessageToolCall"] | components["schemas"]["Output_ChatCompletionMessageCustomToolCall"])[];
        Output_ChatCompletionModeration: {
            input: components["schemas"]["Output_ChatCompletionModerationResults"] | components["schemas"]["Output_ChatCompletionModerationError"];
            output: components["schemas"]["Output_ChatCompletionModerationResults"] | components["schemas"]["Output_ChatCompletionModerationError"];
        };
        Output_ChatCompletionModerationError: {
            code: string;
            message: string;
            
            type: "error";
        };
        Output_ChatCompletionModerationResults: {
            model: string;
            results: components["schemas"]["Output_ModerationResultBody"][];
            
            type: "moderation_results";
        };
        Output_ChatCompletionResponseMessage: {
            annotations?: {
                
                type: "url_citation";
                url_citation: {
                    end_index: number;
                    start_index: number;
                    title: string;
                    
                    url: string;
                };
            }[];
            audio?: {
                data: string;
                
                expires_at: number;
                id: string;
                transcript: string;
            } | null;
            content: string | null;
            
            function_call?: {
                arguments: string;
                name: string;
            } | null;
            images?: {
                image_url: {
                    url: string;
                };
                
                type: "image_url";
            }[];
            reasoning?: string | null;
            reasoning_details?: {
                data?: string;
                format?: string;
                id?: string;
                index: number;
                signature?: string;
                text?: string;
                type: string;
            }[];
            refusal?: string | null;
            
            role: "assistant";
            tool_calls?: components["schemas"]["Output_ChatCompletionMessageToolCalls"] | null;
        };
        Output_ChatCompletionStreamResponseDelta: {
            content?: string | null;
            
            function_call?: {
                arguments?: string;
                name?: string;
            };
            images?: {
                image_url: {
                    url: string;
                };
                
                type: "image_url";
            }[];
            reasoning?: string | null;
            reasoning_details?: {
                data?: string;
                format?: string;
                id?: string;
                index: number;
                signature?: string;
                text?: string;
                type: string;
            }[];
            refusal?: string | null;
            
            role?: "developer" | "system" | "user" | "assistant" | "tool";
            tool_calls?: components["schemas"]["Output_ChatCompletionMessageToolCallChunk"][];
        };
        Output_ChatCompletionTokenLogprob: {
            bytes: number[] | null;
            logprob: number;
            token: string;
            top_logprobs: {
                bytes: number[] | null;
                logprob: number;
                token: string;
            }[];
        };
        Output_CompletionUsage: {
            
            completion_tokens: number;
            completion_tokens_details?: {
                
                accepted_prediction_tokens?: number;
                
                audio_tokens?: number;
                image_tokens?: number;
                
                reasoning_tokens?: number;
                
                rejected_prediction_tokens?: number;
                text_tokens?: number;
            };
            
            prompt_tokens: number;
            prompt_tokens_details?: {
                
                audio_tokens?: number;
                
                cache_write_tokens?: number;
                
                cached_tokens?: number;
                image_tokens?: number;
                text_tokens?: number;
                video_tokens?: number;
            };
            
            total_tokens: number;
        };
        Output_CreateChatCompletionResponse: {
            choices: {
                
                finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | "function_call" | "no_content" | "error";
                index: number;
                logprobs?: {
                    content: components["schemas"]["Output_ChatCompletionTokenLogprob"][] | null;
                    refusal: components["schemas"]["Output_ChatCompletionTokenLogprob"][] | null;
                } | null;
                message: components["schemas"]["Output_ChatCompletionResponseMessage"];
                native_finish_reason?: string | null;
            }[];
            
            created: number;
            id: string;
            metadata?: components["schemas"]["Output_Metadata"];
            model: string;
            moderation?: components["schemas"]["Output_ChatCompletionModeration"] | null;
            
            object: "chat.completion";
            service_tier?: components["schemas"]["Output_ServiceTier"];
            
            system_fingerprint?: string | null;
            usage?: components["schemas"]["Output_CompletionUsage"];
        };
        Output_CreateChatCompletionStreamResponse: {
            choices: {
                delta: components["schemas"]["Output_ChatCompletionStreamResponseDelta"];
                
                finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | "function_call" | null | "no_content" | "error";
                index: number;
                logprobs?: {
                    content: components["schemas"]["Output_ChatCompletionTokenLogprob"][] | null;
                    refusal: components["schemas"]["Output_ChatCompletionTokenLogprob"][] | null;
                } | null;
                native_finish_reason?: string | null;
            }[];
            
            created: number;
            id: string;
            model: string;
            moderation?: components["schemas"]["Output_ChatCompletionModeration"] | null;
            obfuscation?: string;
            
            object: "chat.completion.chunk";
            service_tier?: components["schemas"]["Output_ServiceTier"];
            
            system_fingerprint?: string | null;
            usage?: components["schemas"]["Output_CompletionUsage"] | null;
        };
        Output_Metadata: {
            [key: string]: string;
        } | null;
        
        Output_ModerationInputType: "text" | "image";
        
        Output_ModerationResultBody: {
            categories: {
                [key: string]: boolean;
            };
            category_applied_input_types: {
                [key: string]: components["schemas"]["Output_ModerationInputType"][];
            };
            category_scores: {
                [key: string]: number;
            };
            flagged: boolean;
            model: string;
            
            type: "moderation_result";
        };
        Output_ServiceTier: ("auto" | "default" | "flex" | "scale" | "priority" | "fast") | null;
        
        ParallelToolCalls: boolean;
        
        PredictionContent: {
            content: string | components["schemas"]["ChatCompletionRequestMessageContentPartText"][];
            
            type: "content";
        };
        
        PromptCacheBreakpointParam: {
            
            mode: "explicit";
        };
        
        PromptCacheModeEnum: "implicit" | "explicit";
        
        PromptCacheOptionsParam: {
            mode?: components["schemas"]["PromptCacheModeEnum"];
            ttl?: components["schemas"]["PromptCacheTTLEnum"];
        };
        
        PromptCacheTTLEnum: "30m";
        ReasoningEffort: ("none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max") | null;
        
        ResponseFormatJsonObject: {
            
            type: "json_object";
        };
        
        ResponseFormatJsonSchema: {
            
            json_schema: {
                name: string;
                schema?: components["schemas"]["ResponseFormatJsonSchemaSchema"];
                strict?: boolean | null;
            };
            
            type: "json_schema";
        };
        
        ResponseFormatJsonSchemaSchema: {
            [key: string]: unknown;
        };
        
        ResponseFormatText: {
            
            type: "text";
        };
        ServiceTier: ("auto" | "default" | "flex" | "scale" | "priority" | "fast") | null;
        StopConfiguration: ((string | null) | string[]) | null;
        Verbosity: ("low" | "medium" | "high") | null;
        
        WebSearchContextSize: "low" | "medium" | "high";
        
        WebSearchLocation: {
            city?: string;
            country?: string;
            region?: string;
            timezone?: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;

}
declare module "@lovable.dev/ai-gateway" {
  interface GeneratedModelsBySurface {
    "chat-completions": "google/gemini-2.5-flash" | "google/gemini-2.5-flash-image" | "google/gemini-2.5-flash-lite" | "google/gemini-2.5-pro" | "google/gemini-3-flash-preview" | "google/gemini-3-pro-image" | "google/gemini-3.1-flash-image" | "google/gemini-3.1-flash-lite" | "google/gemini-3.1-pro-preview" | "google/gemini-3.5-flash" | "google/gemini-3.6-flash" | "google/gemini-3.7-flash" | "google/gemini-3.8-flash" | "google/gemini-4-argon" | "openai/chat-latest" | "openai/gpt-5" | "openai/gpt-5-mini" | "openai/gpt-5-nano" | "openai/gpt-5.2" | "openai/gpt-5.4" | "openai/gpt-5.4-mini" | "openai/gpt-5.4-nano" | "openai/gpt-5.5" | "openai/gpt-5.6-luna" | "openai/gpt-5.6-sol" | "openai/gpt-5.6-terra" | "openai/gpt-6-astra";
    "responses": "openai/chat-latest" | "openai/gpt-5" | "openai/gpt-5-mini" | "openai/gpt-5-nano" | "openai/gpt-5.2" | "openai/gpt-5.4" | "openai/gpt-5.4-mini" | "openai/gpt-5.4-nano" | "openai/gpt-5.4-pro" | "openai/gpt-5.5" | "openai/gpt-5.5-pro" | "openai/gpt-5.6-luna" | "openai/gpt-5.6-sol" | "openai/gpt-5.6-terra" | "openai/gpt-6-astra";
    "messages": never;
    "interactions": never;
    "image-generation": "google/gemini-2.5-flash-image" | "google/gemini-3-pro-image" | "google/gemini-3.1-flash-image" | "google/gemini-3.1-flash-lite-image" | "openai/gpt-image-1-mini" | "openai/gpt-image-2";
    "image-edit": "openai/gpt-image-1-mini" | "openai/gpt-image-2";
    "embeddings": "google/gemini-embedding-001" | "google/gemini-embedding-2" | "openai/text-embedding-3-large" | "openai/text-embedding-3-small";
    "speech": "google/gemini-2.5-flash-lite-preview-tts" | "google/gemini-2.5-flash-tts" | "google/gemini-2.5-pro-tts" | "google/gemini-3.1-flash-tts-preview" | "openai/gpt-4o-mini-tts";
    "transcription": "google/gemini-3.5-transcribe" | "openai/gpt-4o-mini-transcribe" | "openai/gpt-4o-transcribe";
    "music": never;
    "videos": "google/gemini-omni-1.1-flash" | "google/veo-3.1" | "google/veo-3.1-fast" | "google/veo-3.1-lite";
    "systemone": never;
    "live": never;
  }
  interface ChatFieldsByModel {
    "google/gemini-4-argon": ModelContract_7ff6a9f995dcaa1c.components["schemas"]["ChatRequest"];
  }
  interface ChatResponseByModel {
    "google/gemini-4-argon": ModelContract_7ff6a9f995dcaa1c.components["schemas"]["ChatResponse"];
  }
  interface ChatEventByModel {
    "google/gemini-4-argon": ModelContract_7ff6a9f995dcaa1c.components["schemas"]["ChatEvent"];
  }
}
