import readline from 'node:readline';

const ESC = '';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? ESC + '[' + code + 'm' + s + ESC + '[0m' : String(s));

export const c = {
  green: wrap('32'),
  red: wrap('31'),
  yellow: wrap('33'),
  cyan: wrap('36'),
  dim: wrap('2'),
  bold: wrap('1'),
};

export const sym = {
  ok: c.green('✓'),   // ✓
  err: c.red('✗'),    // ✗
  warn: c.yellow('!'),
  off: c.dim('○'),    // ○
};

export function heading(text) {
  console.log('\n' + c.bold(text) + '\n');
}

export function table(rows, indent = '  ') {
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = stripAnsi(String(cell)).length;
      widths[i] = Math.max(widths[i] || 0, len);
    });
  }
  for (const row of rows) {
    const line = row
      .map((cell, i) => String(cell) + ' '.repeat(widths[i] - stripAnsi(String(cell)).length))
      .join('   ');
    console.log(indent + line.trimEnd());
  }
}

function stripAnsi(s) {
  return s.replace(new RegExp(ESC + '\\[[0-9;]*m', 'g'), '');
}

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function confirm(question, def = true) {
  const suffix = def ? ' [Y/n] ' : ' [y/N] ';
  const answer = (await ask(question + suffix)).toLowerCase();
  if (answer === '') return def;
  return answer === 'y' || answer === 'yes';
}
