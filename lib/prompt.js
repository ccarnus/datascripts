// Terminal prompts (no dependencies). One shared reader with a line queue, so answers piped
// or pasted ahead of the questions are not lost.
const readline = require('readline');

let rl;
let muted = false;
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
  // Hides typed characters while a password is being entered.
  rl._writeToOutput = (text) => {
    if (!muted) write(text);
  };
  rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : queued.push(line)));
  rl.on('close', () => waiting.splice(0).forEach((resolve) => resolve('')));
  return rl;
};

const nextLine = () => {
  reader();
  return queued.length
    ? Promise.resolve(queued.shift())
    : new Promise((resolve) => waiting.push(resolve));
};

const ask = async (question) => {
  reader();
  process.stdout.write(question);
  return (await nextLine()).trim();
};

/** Like ask() but does not echo what is typed (when stdin is a terminal). */
const askHidden = async (question) => {
  reader();
  process.stdout.write(question);
  muted = true;
  const answer = await nextLine();
  muted = false;
  if (process.stdin.isTTY) process.stdout.write('\n');
  return answer;
};

const confirm = async (question) =>
  ['y', 'yes'].includes((await ask(`${question} (yes/no): `)).toLowerCase());

/** Accepts paths pasted or dragged into the terminal (strips surrounding quotes). */
const askPath = async (question) => (await ask(question)).replace(/^(['"])(.*)\1$/, '$2');

/** Releases stdin so the process can exit. */
const closePrompts = () => rl?.close();

module.exports = { ask, askHidden, confirm, askPath, closePrompts };
