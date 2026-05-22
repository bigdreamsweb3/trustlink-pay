type LogPayload = Record<string, unknown> | undefined;
export declare const logger: {
    info(event: string, payload?: LogPayload): void;
    warn(event: string, payload?: LogPayload): void;
    error(event: string, payload?: LogPayload): void;
};
export {};
//# sourceMappingURL=logger.d.ts.map