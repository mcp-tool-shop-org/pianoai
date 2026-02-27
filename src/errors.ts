/**
 * Structured error shape for AI Jam Sessions (Shipcheck B.1).
 *
 * All user-visible errors carry: code, message, hint, cause?, retryable?
 */

export const EXIT_OK = 0;
export const EXIT_USER = 1;
export const EXIT_RUNTIME = 2;

export type ErrorCode =
    | 'INPUT_INVALID_SONG'
    | 'INPUT_INVALID_ARGS'
    | 'INPUT_MISSING_FILE'
    | 'INPUT_PARSE_ERROR'
    | 'CONFIG_MISSING'
    | 'CONFIG_INVALID'
    | 'IO_FILE_READ'
    | 'IO_FILE_WRITE'
    | 'IO_MIDI_PORT'
    | 'RUNTIME_AUDIO'
    | 'RUNTIME_ENGINE'
    | 'RUNTIME_TRANSPORT'
    | 'RUNTIME_UNEXPECTED';

export class JamError extends Error {
    readonly code: ErrorCode;
    readonly hint?: string;
    readonly retryable: boolean;
    override readonly cause?: Error;

    constructor(opts: {
        code: ErrorCode;
        message: string;
        hint?: string;
        cause?: Error;
        retryable?: boolean;
    }) {
        super(opts.message);
        this.name = 'JamError';
        this.code = opts.code;
        this.hint = opts.hint;
        this.cause = opts.cause;
        this.retryable = opts.retryable ?? false;
    }

    /** One-line user-safe string for CLI output. */
    toUserString(): string {
        const base = `[${this.code}] ${this.message}`;
        return this.hint ? `${base}\nHint: ${this.hint}` : base;
    }

    /** Structured JSON for MCP tool error results. */
    toMcpResult(): { code: string; message: string; hint?: string; retryable: boolean } {
        return {
            code: this.code,
            message: this.message,
            ...(this.hint && { hint: this.hint }),
            retryable: this.retryable,
        };
    }
}

/**
 * Top-level error handler for CLI.
 * Shows structured output for JamError, generic message for unknowns.
 */
export function handleError(err: unknown, debug: boolean): number {
    if (err instanceof JamError) {
        console.error(`Error [${err.code}]: ${err.message}`);
        if (err.hint) console.error(`Hint: ${err.hint}`);
        if (debug && err.cause) console.error(err.cause);
        return err.code.startsWith('INPUT_') || err.code.startsWith('CONFIG_')
            ? EXIT_USER
            : EXIT_RUNTIME;
    }
    if (err instanceof Error) {
        console.error(`Error: ${err.message}`);
        if (debug) console.error(err.stack);
    } else {
        console.error(`Error: ${String(err)}`);
    }
    return EXIT_RUNTIME;
}
