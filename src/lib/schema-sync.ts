export function shouldRunRuntimeSchemaSync() {
  return process.env.RUNTIME_SCHEMA_SYNC?.trim().toLowerCase() === "true";
}
