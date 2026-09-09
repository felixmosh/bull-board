import * as v from 'valibot';
import { errorResponse } from './errors';
import { ERROR_TRANSLATION_KEYS, type ErrorTranslationKey } from './schemas/errorKeys';
import { requestSchemas } from './schemas/requests';
import { decodeKey } from './schemas/support';
import type { AppControllerRoute, BullBoardRequest, ControllerHandlerReturnType } from './types';

const TRANSLATION_KEYS = new Set<string>(ERROR_TRANSLATION_KEYS);

function issueMessage(issues: v.BaseIssue<unknown>[], fallback: ErrorTranslationKey) {
  const named = issues
    .map((issue) => decodeKey(issue.message))
    .find((decoded) => TRANSLATION_KEYS.has(decoded.key));

  return (named ?? { key: fallback }) as {
    key: ErrorTranslationKey;
    options?: Record<string, unknown>;
  };
}

function issuePath(issues: v.BaseIssue<unknown>[]): string | undefined {
  const path = issues[0]?.path;
  return path
    ?.map((segment) => String((segment as { key?: unknown }).key ?? ''))
    .filter(Boolean)
    .join('.');
}

function treatEmptyValuesAsAbsent(query: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== '') {
      result[name] = value;
    }
  }
  return result;
}

function rejection(
  issues: v.BaseIssue<unknown>[],
  fallback: ErrorTranslationKey
): ControllerHandlerReturnType<never> {
  const message = issueMessage(issues, fallback);
  const field = issuePath(issues);

  // Only the generic keys name the field: the specific ones are asserted verbatim by clients.
  return errorResponse(
    400,
    message.key === fallback && field ? { key: message.key, options: { field } } : message,
    { code: 'INVALID_REQUEST' }
  );
}

export function validateRequest(
  route: Pick<AppControllerRoute, 'spec'>,
  request: BullBoardRequest
): ControllerHandlerReturnType<never> | undefined {
  const { query, body } = route.spec;

  if (query) {
    const parsed = v.safeParse(requestSchemas[query], treatEmptyValuesAsAbsent(request.query));
    if (!parsed.success) {
      return rejection(parsed.issues, 'ERRORS.INVALID_QUERY_PARAM');
    }
    request.query = parsed.output as Record<string, any>;
  }

  if (body) {
    const parsed = v.safeParse(requestSchemas[body], request.body ?? {});
    if (!parsed.success) {
      return rejection(parsed.issues, 'ERRORS.INVALID_REQUEST_BODY');
    }
    request.body = parsed.output as Record<string, any>;
  }

  return undefined;
}
