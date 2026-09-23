// Python runtime tests use temporary synthetic receipts and fake transport/sender.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync('python3', ['-B', '-m', 'unittest', 'discover',
  '-s', 'homie-bridge/agent-os/tests', '-p', 'test_wa_outbox_single.py', '-v'], {
  cwd, encoding: 'utf8', timeout: 120_000,
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error('Synthetic worker suite failed:', result.error.code || 'runner_error');
process.exitCode = result.status === 0 ? 0 : 1;
