export interface TelemetryExporter<TSpan = unknown, TResult = unknown> {
  export(spans: TSpan[], resultCallback: (result: TResult) => void): void;
  shutdown(): Promise<void>;
}

export function createPrivacyFilteredExporter<TSpan, TResult>(
  exporter: TelemetryExporter<TSpan, TResult>,
): TelemetryExporter<TSpan, TResult>;
