/**
 * The minimal query contract, in its own file so modules that need it do not have to
 * import the package entry point and create a cycle back to themselves.
 *
 * `pg` and PGlite both satisfy it, which is what lets policy and transaction behaviour be
 * tested in milliseconds against PGlite while production runs on PostgreSQL (ADR-0017).
 */
export interface Sql {
  // SQL result types are supplied by callers because SQL text does not carry a TS
  // row type. pg and PGlite both expose this same generic result contract.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  query<T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
