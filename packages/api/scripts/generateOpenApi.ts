import { MARKDOWN_PATH, SPEC_PATH, writeArtifacts } from './openapi/artifacts';

writeArtifacts();

// oxlint-disable-next-line no-console
console.log(`Wrote ${SPEC_PATH}\nWrote ${MARKDOWN_PATH}`);
