/**
 * Quick smoke test for bash jail path analysis.
 * Run: node electron/services/__tests__/bash-jail.test.mjs
 */
import { resolve, relative, isAbsolute } from 'path';
import { homedir } from 'os';

// ---- Copy of functions under test (since we can't import TS directly) ----

function expandHome(p) {
  const home = homedir();
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~\\')) return resolve(home, p.slice(2));
  return p;
}

function isWithinProject(projectRoot, filePath, allowedPaths) {
  const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(projectRoot, filePath);
  const norm = (p) => process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p);
  const normalRoot = norm(projectRoot);
  const normalResolved = norm(resolved);
  const rel = relative(normalRoot, normalResolved);
  if (!rel.startsWith('..') && !isAbsolute(rel)) return true;
  for (const allowed of allowedPaths) {
    const normalAllowed = norm(expandHome(allowed));
    const relToAllowed = relative(normalAllowed, normalResolved);
    if (!relToAllowed.startsWith('..') && !isAbsolute(relToAllowed)) return true;
  }
  return false;
}

const SYSTEM_SAFE_PREFIXES = [
  '/dev/', '/proc/', '/sys/', '/usr/', '/bin/', '/sbin/',
  '/opt/', '/nix/', '/etc/', '/Library/',
];
const SYSTEM_SAFE_EXACT = new Set([
  '/dev/null', '/dev/zero', '/dev/urandom', '/dev/random',
  '/dev/stdin', '/dev/stdout', '/dev/stderr', '/dev/tty', '/tmp',
]);

function isSystemPath(absPath) {
  if (SYSTEM_SAFE_EXACT.has(absPath)) return true;
  return SYSTEM_SAFE_PREFIXES.some(prefix => absPath.startsWith(prefix));
}

function extractPathsFromCommand(command) {
  const home = process.env.HOME ?? '';
  let expanded = command;
  expanded = expanded.replace(/\$HOME(?=\/|[\s;|&'"`)}]|$)|\$\{HOME\}/g, home);
  expanded = expanded.replace(
    /\$TMPDIR(?=\/|[\s;|&'"`)}]|$)|\$\{TMPDIR\}/g,
    process.env.TMPDIR ?? '/tmp',
  );
  expanded = expanded.replace(/(^|[\s;|&()>=`])~\//g, `$1${home}/`);
  expanded = expanded.replace(/(^|[\s;|&])#[^\n]*/g, '$1');

  const candidates = new Set();

  const absRegex = /(?:^|[\s;|&()>`"'=])(\/{1,2}[\w.\-/+@:,]+)/g;
  let m;
  while ((m = absRegex.exec(expanded)) !== null) {
    const p = m[1].replace(/[,;:'"]+$/, '');
    if (p.length > 1 && p !== '//') {
      const charBefore = expanded[m.index] === '/' ? expanded[m.index - 1] : undefined;
      if (charBefore !== ':') candidates.add(p);
    }
  }

  const relRegex = /(?:^|[\s;|&()>`"'=])((?:\.\.\/)+[\w.\-/]*)/g;
  while ((m = relRegex.exec(expanded)) !== null) {
    candidates.add(m[1]);
  }

  return [...candidates];
}

function findEscapingPaths(command, projectRoot, allowedPaths) {
  const candidates = extractPathsFromCommand(command);
  const offending = [];
  for (const candidate of candidates) {
    const abs = isAbsolute(candidate) ? resolve(candidate) : resolve(projectRoot, candidate);
    if (isSystemPath(abs)) continue;
    if (!isWithinProject(projectRoot, candidate, allowedPaths)) {
      offending.push(candidate);
    }
  }
  return offending;
}

// ---- Tests ----

const PROJECT = '/Users/testuser/Dev/MyProject';
const HOME = process.env.HOME;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertPaths(command, expected, msg) {
  const actual = extractPathsFromCommand(command);
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  assert(
    JSON.stringify(sortedActual) === JSON.stringify(sortedExpected),
    `${msg || command}\n       Expected: ${JSON.stringify(sortedExpected)}\n       Got:      ${JSON.stringify(sortedActual)}`,
  );
}

function assertBlocked(command, allowedPaths = []) {
  const escaping = findEscapingPaths(command, PROJECT, allowedPaths);
  assert(escaping.length > 0, `Expected command to be BLOCKED: ${command}\n       (no escaping paths found)`);
}

function assertAllowed(command, allowedPaths = []) {
  const escaping = findEscapingPaths(command, PROJECT, allowedPaths);
  assert(escaping.length === 0, `Expected command to be ALLOWED: ${command}\n       Escaping paths: ${JSON.stringify(escaping)}`);
}

// --- Path extraction ---
console.log('\n📦 Path extraction:');

test('absolute path', () => {
  assertPaths('cat /home/other/secrets.txt', ['/home/other/secrets.txt']);
});

test('multiple absolute paths', () => {
  assertPaths('cp /home/a/file /home/b/file', ['/home/a/file', '/home/b/file']);
});

test('relative escape paths', () => {
  assertPaths('cat ../../etc/passwd', ['../../etc/passwd']);
});

test('deep relative escape', () => {
  assertPaths('cat ../../../secrets', ['../../../secrets']);
});

test('home directory tilde', () => {
  assertPaths('cat ~/secrets.txt', [`${HOME}/secrets.txt`]);
});

test('$HOME expansion', () => {
  assertPaths('cat $HOME/secrets.txt', [`${HOME}/secrets.txt`]);
});

test('${HOME} expansion', () => {
  assertPaths('cat ${HOME}/secrets.txt', [`${HOME}/secrets.txt`]);
});

test('redirect to absolute path', () => {
  assertPaths('echo "data" > /tmp/leak.txt', ['/tmp/leak.txt']);
});

test('append redirect', () => {
  assertPaths('echo "data" >> /home/other/log', ['/home/other/log']);
});

test('pipe to tee with outside path', () => {
  assertPaths('cat file | tee /home/other/copy', ['/home/other/copy']);
});

test('command substitution with path', () => {
  assertPaths('echo $(cat /home/other/secret)', ['/home/other/secret']);
});

test('backtick substitution', () => {
  assertPaths('echo `cat /home/other/secret`', ['/home/other/secret']);
});

test('path in double quotes', () => {
  assertPaths('cat "/home/other/file"', ['/home/other/file']);
});

test('path in single quotes', () => {
  assertPaths("cat '/home/other/file'", ['/home/other/file']);
});

test('semicolon-separated commands', () => {
  assertPaths('ls; cat /home/other/file', ['/home/other/file']);
});

test('AND-chained commands', () => {
  assertPaths('true && cat /home/other/file', ['/home/other/file']);
});

test('no paths in simple command', () => {
  assertPaths('npm install', []);
});

test('no paths in git command', () => {
  assertPaths('git status', []);
});

test('relative path within project (no ..)', () => {
  assertPaths('cat src/index.ts', []);
});

test('URL should NOT be extracted', () => {
  assertPaths('curl https://example.com/api/data', []);
});

test('URL with http', () => {
  assertPaths('wget http://example.com/file.tar.gz', []);
});

test('git clone URL (not the path part)', () => {
  // The /tmp/repo IS a path and should be extracted
  const paths = extractPathsFromCommand('git clone https://github.com/user/repo /tmp/repo');
  assert(paths.includes('/tmp/repo'), `Expected /tmp/repo, got: ${JSON.stringify(paths)}`);
  assert(!paths.some(p => p.includes('github.com')), `Should not extract URL path`);
});

test('comment should be ignored', () => {
  assertPaths('ls # cat /etc/passwd', []);
});

// --- Jail enforcement ---
console.log('\n🔒 Jail enforcement (blocked):');

test('absolute path outside project', () => {
  assertBlocked('cat /home/other/secrets.txt');
});

test('relative escape outside project', () => {
  assertBlocked('cat ../../etc/passwd');
});

test('home directory outside project', () => {
  assertBlocked('cat ~/Documents/secrets.txt');
});

test('$HOME outside project', () => {
  assertBlocked('cat $HOME/.ssh/id_rsa');
});

test('redirect outside project', () => {
  assertBlocked('echo "pwned" > /home/other/file');
});

test('/tmp write (data exfiltration)', () => {
  assertBlocked('cp secrets.env /tmp/leak');
});

test('tee to outside path', () => {
  assertBlocked('cat file | tee /home/other/copy');
});

test('cd to outside and execute', () => {
  assertBlocked('cd /home/other && ls');
});

console.log('\n✅ Jail enforcement (allowed):');

test('simple npm command', () => {
  assertAllowed('npm install');
});

test('git status', () => {
  assertAllowed('git status');
});

test('ls within project', () => {
  assertAllowed('ls -la src/');
});

test('cat within project (relative)', () => {
  assertAllowed('cat package.json');
});

test('node with system executable', () => {
  assertAllowed('/usr/bin/env node script.js');
});

test('/usr/local/bin executable', () => {
  assertAllowed('/usr/local/bin/python3 -c "print(1)"');
});

test('/dev/null redirect', () => {
  assertAllowed('command 2>/dev/null');
});

test('/bin/bash invocation', () => {
  assertAllowed('/bin/bash -c "echo hello"');
});

test('grep with /dev/null trick', () => {
  assertAllowed('grep -r pattern src/ /dev/null');
});

test('npx command', () => {
  assertAllowed('npx tsc --noEmit');
});

test('echo without paths', () => {
  assertAllowed('echo "hello world"');
});

test('pipe within project', () => {
  assertAllowed('cat src/index.ts | grep import | wc -l');
});

test('mkdir within project', () => {
  assertAllowed('mkdir -p src/components/new');
});

test('allowed path override', () => {
  assertAllowed('cat /home/shared/data.json', ['/home/shared']);
});

test('nested allowed path', () => {
  assertAllowed('cat /home/shared/sub/deep/file.txt', ['/home/shared']);
});

test('system /etc/hosts read', () => {
  assertAllowed('cat /etc/hosts');
});

test('/opt/homebrew executable', () => {
  assertAllowed('/opt/homebrew/bin/brew list');
});

// --- Summary ---
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
