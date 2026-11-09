// Terminal prompts (no dependencies). One shared reader with a line queue, so answers piped
// or pasted ahead of the questions are not lost.
const readline = require('readline');

let rl;
let hidden = false;
const queued = [];
const waiting = [];

const reader = () => {
  if (rl) return rl;
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });
  const write = rl._writeToOutput.bind(rl);
  // While a password is typed: keep the prompt visible and echo "*" instead of the characters.
  rl._writeToOutput = (text) => {
    if (!hidden) return write(text);
    const prompt = rl.getPrompt();
    if (text.startsWith(prompt)) return write(prompt + '*'.repeat(rl.line.length));
    if (/^\r?\n$/.test(text)) return write(text);
    return write('*'.repeat(text.length));
  };
  rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : queued.push(line)));
  rl.on('close', () => waiting.splice(0).forEach((resolve) => resolve('')));
  return rl;
};

/** Shows `question` as the reader's prompt (so redraws keep it) and returns the next line. */
const readLine = (question) => {
  const r = reader();
  r.setPrompt(question);
  r.prompt();
  return queued.length
    ? Promise.resolve(queued.shift())
    : new Promise((resolve) => waiting.push(resolve));
};

const ask = async (question) => (await readLine(question)).trim();

/** Like ask() but echoes "*" instead of what is typed (when stdin is a terminal). */
const askHidden = async (question) => {
  hidden = true;
  try {
    return await readLine(question);
  } finally {
    hidden = false;
  }
};

const confirm = async (question) =>
  ['y', 'yes'].includes((await ask(`${question} (yes/no): `)).toLowerCase());

/** Accepts paths pasted or dragged into the terminal (strips surrounding quotes). */
const askPath = async (question) => (await ask(question)).replace(/^(['"])(.*)\1$/, '$2');

/** Releases stdin so the process can exit. */
const closePrompts = () => rl?.close();

module.exports = { ask, askHidden, confirm, askPath, closePrompts };
