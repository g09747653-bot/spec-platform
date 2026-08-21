import { z } from 'zod';

/**
 * Сборка промпта моста подписки (задача 175; урок 1 из D-304).
 *
 * Мост принимает OpenAI-совместимый запрос — массив сообщений с ролями — и переводит его в два
 * отдельных канала CLI: **системные сообщения никогда не попадают в текст промпта**. Замер M16а
 * показал, почему это не стилистика: «системная инструкция», пришедшая user-каналом с маркером,
 * честно отвергается агентом как инъекция — и это его правильная защита, которую мост не обходит,
 * а уважает. Система уходит только настоящим системным каналом (`--append-system-prompt`, см.
 * `cli.ts`); здесь она лишь отделяется от остального.
 *
 * `response_format` (json / json_schema) переводится в жёсткую JSON-инструкцию в хвосте промпта —
 * путь облачного звена платформы по А-10: грамматика — привилегия ollama, Р-1 остаётся стражем на
 * стороне читателя. Мост не проверяет JSON сам: его читатели (платформа, контур) валидируют ответ
 * своими Zod-схемами, и вторая проверка тут была бы вторым ответом на уже отвеченный вопрос.
 */

/** Формы, которые мост принимает снаружи. Всё лишнее отбрасывается, ничего не додумывается. */
export const ChatMessage = z.object({
  role: z.string(),
  content: z.union([
    z.string(),
    z.array(z.union([z.string(), z.object({ text: z.string().optional() }).loose()])),
    z.null(),
  ]),
});

export const ResponseFormat = z
  .object({
    type: z.string().optional(),
    schema: z.unknown().optional(),
    json_schema: z.object({ schema: z.unknown().optional() }).loose().optional(),
  })
  .loose();

export type ChatMessageT = z.infer<typeof ChatMessage>;
export type ResponseFormatT = z.infer<typeof ResponseFormat>;

/** Текст одного сообщения, каким бы из допустимых форм ни пришёл `content`. */
export function contentText(message: ChatMessageT): string {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : (part.text ?? '')))
      .join('\n');
  }
  return '';
}

export interface BuiltPrompt {
  /** Пользовательские и ассистентские ходы, одним потоком. Уходит через stdin (урок 2). */
  prompt: string;
  /** Системные сообщения, склеенные. Уходят ТОЛЬКО через `--append-system-prompt` (урок 1). */
  system: string;
}

export function buildPrompt(
  messages: readonly ChatMessageT[],
  responseFormat?: ResponseFormatT,
): BuiltPrompt {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => contentText(message));
  const turns = messages.filter((message) => message.role !== 'system');

  const parts: string[] = [];
  for (const turn of turns) {
    if (turn.role === 'assistant') {
      parts.push('Твой предыдущий ответ был:', contentText(turn), '');
    } else {
      parts.push(contentText(turn), '');
    }
  }

  if (responseFormat !== undefined && responseFormat.type?.startsWith('json') === true) {
    parts.push(
      'ТРЕБОВАНИЕ К ФОРМАТУ ОТВЕТА: ответь ТОЛЬКО валидным JSON без пояснений и без ограждений кода.',
    );
    const schema = responseFormat.schema ?? responseFormat.json_schema?.schema;
    if (schema !== undefined) {
      parts.push('JSON обязан соответствовать схеме:', JSON.stringify(schema));
    }
  }

  return { prompt: parts.join('\n'), system: system.join('\n\n') };
}

/**
 * ```-обрамление ВСЕГО ответа снимается: CLI любит фенсы, а платформенные читатели ждут голый
 * документ или голый JSON. Фенс внутри текста (пример кода в документе) не трогается — правило
 * срабатывает только когда ограждением обёрнут ответ целиком.
 */
export function stripOuterFence(text: string): string {
  const fenced = /^\s*```[a-z]*\s*\n([\s\S]*?)\n?```\s*$/i.exec(text);
  return fenced === null ? text : (fenced[1] ?? '');
}
