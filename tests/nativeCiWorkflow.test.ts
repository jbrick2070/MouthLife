import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(join(__dirname, '..', '.github/workflows/native-apple.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Each `- name:` step of the native job, as raw text. */
const steps = (): Map<string, string> =>
  new Map(
    WORKFLOW.split(/\n {6}- name: /)
      .slice(1)
      .map((chunk) => [chunk.slice(0, chunk.indexOf('\n')).trim(), chunk] as const)
  );

describe('M09 native CI fails when the Swift tests fail', () => {
  it('runs every step with pipefail, so `swift test | tee` keeps the test exit code', () => {
    // GitHub runs an explicit `shell: bash` as `bash --noprofile --norc -eo pipefail {0}`; the
    // unspecified default is `bash -e {0}`, where a pipe reports only its last command.
    expect(WORKFLOW).toMatch(/defaults:\n\s+run:\n(?:\s+.*\n)*?\s+shell: bash\n/);
    const test = steps().get('Swift engine tests');
    expect(test).toBeDefined();
    expect(test).toMatch(/shell: bash/);
    expect(test).toMatch(/set -o pipefail\n\s+swift test 2>&1 \| tee \.\.\/native-out\/swift-test\.log/);
  });

  it('every piped step whose result matters either uses pipefail or checks the log itself', () => {
    for (const [name, body] of steps()) {
      const run = body.slice(body.indexOf('run:'));
      if (!/\|\s*tee\b/.test(run)) continue;
      const checksLog = /grep -q "BUILD SUCCEEDED"/.test(run);
      expect(/set -o pipefail|set -euo pipefail/.test(run) || checksLog, name).toBe(true);
    }
  });

  it('still writes the summary and uploads the logs after a failure', () => {
    const all = steps();
    expect(all.get('Summary')).toMatch(/if: always\(\)/);
    expect(all.get('Upload screenshots and logs')).toMatch(/if: always\(\)/);
    expect(all.get('Build for iPhone simulator')).toMatch(/if: \$\{\{ !cancelled\(\) \}\}/);
  });
});
