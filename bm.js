#!/usr/bin/env node
// BrightMinds content tool: create universities, casts and articles on the backend, or purge them.
// Usage: see README.md, or `node bm.js help`.
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('util');

try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // .env is optional
}

const api = require('./lib/api');
const { loadCasts, loadArticles } = require('./lib/content');
const { ask, askHidden, confirm, askPath, closePrompts } = require('./lib/prompt');
const DISPLAY_NAME_OVERRIDES = require('./universities.json');

const PLACEHOLDER_ICON = '/backend/media/verification_email/BrightMinds_icon.png';
const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};
const ROLES = ['Researcher', 'PhD Student', 'Professor', 'College Student', 'Learning Enthusiast'];

const API_LABEL = api.BASE_URL + (api.API_IP ? ` via ${api.API_IP}` : '');

const HELP = `BrightMinds content tool — API: ${API_LABEL}

  node bm.js                                  interactive menu
  node bm.js universities <content folder>    create the universities used by the content [--icons <folder>]
  node bm.js casts <folder>                   upload one cast per sub-folder (details.json + video)
  node bm.js articles <folder>                create one article per .json file
  node bm.js purge <casts|articles|universities>
  node bm.js signup                           create the account content is posted as [--picture <image>]

Options: --dry-run (validate and show the plan only), --yes (don't ask for confirmation)
Login: BM_EMAIL / BM_PASSWORD in .env, or prompted. API URL: BM_API_URL (default above).`;

const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`;
const line = (status, name, detail = '') =>
  console.log(`  ${status.padEnd(6)} ${name}${detail ? `  — ${detail}` : ''}`);
const banner = (title) => console.log(`\n${'='.repeat(60)}\n  ${title}\n${'='.repeat(60)}`);

/** Display name from a university key, e.g. 'UniversityoftheSunshineCoast' -> 'University of the Sunshine Coast'. */
const displayName = (name) =>
  DISPLAY_NAME_OVERRIDES[name] ||
  name
    .replace(/([a-z'])([A-Z])/g, '$1 $2')
    .replace(/\b(University|Institute|College|School)(of|at|for)(the)?\b/g, (match, ...words) =>
      words.slice(0, 3).filter(Boolean).join(' ')
    );

// ---------------------------------------------------------------- session

let session;

/** Logs in once per run. The logged-in user becomes the author (brightmindid) of new content. */
const getSession = async () => {
  if (session) return session;
  const email = process.env.BM_EMAIL || (await ask('Email: '));
  const password = process.env.BM_PASSWORD || (await askHidden('Password: '));
  const { userId, token } = await api.login(email, password);
  session = { email, userId: String(userId), token };
  console.log(`Logged in as ${email}.`);
  return session;
};

const checkHealth = async () => {
  const health = await api.request('GET', '/health');
  if (health?.db !== 'up') throw new Error(`API is up but its database is "${health?.db}"`);
};

const fetchUniversityNames = async () =>
  new Set((await api.request('GET', '/university')).map((university) => university.name));

// ---------------------------------------------------------------- universities

const createUniversities = async (sources, { icons, dryRun, yes }) => {
  banner('UNIVERSITIES');
  const wanted = new Set();
  for (const source of sources) {
    for (const item of [...loadCasts(source), ...loadArticles(source)]) {
      if (item.payload?.university) wanted.add(item.payload.university);
    }
  }
  if (!wanted.size) return console.log('No universities referenced in that folder.');

  const existing = await fetchUniversityNames();
  const missing = [...wanted].filter((name) => !existing.has(name)).sort();
  const iconFile = (name) => {
    if (!icons) return null;
    const file = fs
      .readdirSync(icons)
      .find((f) => path.parse(f).name === name && IMAGE_TYPES[path.extname(f).toLowerCase()]);
    return file ? path.join(icons, file) : null;
  };

  console.log(
    `${wanted.size} referenced, ${wanted.size - missing.length} already exist, ${missing.length} to create:\n`
  );
  for (const name of missing) {
    line(
      'NEW',
      name,
      `"${displayName(name)}", icon: ${iconFile(name) ? path.basename(iconFile(name)) : 'placeholder'}`
    );
  }
  if (!missing.length || dryRun) return;
  await getSession();
  if (!yes && !(await confirm(`\nCreate ${missing.length} universities?`))) return;

  let placeholder;
  let created = 0;
  for (const name of missing) {
    const iconPath = iconFile(name);
    let file;
    if (iconPath) {
      const ext = path.extname(iconPath).toLowerCase();
      file = {
        field: 'icon',
        path: iconPath,
        filename: path.basename(iconPath),
        contentType: IMAGE_TYPES[ext],
      };
    } else {
      placeholder ??= await api.download(PLACEHOLDER_ICON);
      file = {
        field: 'icon',
        buffer: placeholder,
        filename: `${name}.png`,
        contentType: 'image/png',
      };
    }
    try {
      await api.upload('/university', {
        token: session.token,
        fields: { university: JSON.stringify({ name, displayedName: displayName(name) }) },
        file,
      });
      line('OK', name);
      created += 1;
    } catch (error) {
      line('FAILED', name, error.message);
    }
  }
  console.log(`\nCreated ${created}/${missing.length}.`);
};

// ---------------------------------------------------------------- casts & articles

/** Marks items that can't or needn't be sent: invalid, unknown university, already on the server, duplicated. */
const planItems = (items, { universities, existingTitles }) => {
  const seen = new Set();
  for (const item of items) {
    if (item.error) continue;
    const { title, university } = item.payload;
    if (existingTitles.has(title)) item.skip = 'already on the server';
    else if (seen.has(title)) item.skip = 'duplicate title in this folder';
    else if (!universities.has(university))
      item.error = `unknown university "${university}" (run "universities" first)`;
    seen.add(title);
  }
  for (const item of items) {
    if (item.error) line('ERROR', item.name, item.error);
    else if (item.skip) line('SKIP', item.name, item.skip);
    else {
      const { university, department = 'department: auto' } = item.payload;
      line(
        'OK',
        item.name,
        [university, department, item.videoBytes && mb(item.videoBytes)].filter(Boolean).join(', ')
      );
    }
  }
  return items.filter((item) => !item.error && !item.skip);
};

const summarize = (items, done, failed) => {
  const skipped = items.filter((item) => item.skip).length;
  const invalid = items.filter((item) => item.error).length;
  console.log(
    `\nSUMMARY: ${done} created, ${failed.length} failed, ${skipped} skipped, ${invalid} invalid.`
  );
  for (const item of failed) line('FAILED', item.name, item.failure);
  if (failed.length)
    console.log('Fix the failures and run the same command again: existing items are skipped.');
};

const createCasts = async (folder, { dryRun, yes }) => {
  banner('CASTS');
  const items = loadCasts(folder);
  if (!items.length) return console.log('No sub-folders found.');
  const [universities, simplified] = await Promise.all([
    fetchUniversityNames(),
    api.request('GET', '/cast/all/simplified'),
  ]);
  const existingTitles = new Set(simplified.casts.map((cast) => cast.title));
  const ready = planItems(items, { universities, existingTitles });
  const totalBytes = ready.reduce((sum, item) => sum + item.videoBytes, 0);
  console.log(`\n${ready.length} of ${items.length} ready to upload (${mb(totalBytes)}).`);
  if (!ready.length || dryRun) return;

  const { userId, token, email } = await getSession();
  if (!yes && !(await confirm(`Upload ${ready.length} casts as ${email}?`))) return;

  let done = 0;
  const failed = [];
  for (const [index, item] of ready.entries()) {
    const label = `[${index + 1}/${ready.length}] ${item.name}`;
    try {
      await api.upload('/cast', {
        token,
        fields: { cast: JSON.stringify({ ...item.payload, brightmindid: userId }) },
        file: {
          field: 'video',
          path: item.videoPath,
          filename: path.basename(item.videoPath),
          contentType: item.videoType,
        },
        onProgress: (ratio) => process.stdout.write(`\r  ${label}  ${Math.floor(ratio * 100)}%`),
      });
      process.stdout.write(`\r  ${label}  done\n`);
      done += 1;
    } catch (error) {
      process.stdout.write(`\r  ${label}  FAILED: ${error.message}\n`);
      item.failure = error.message;
      failed.push(item);
    }
  }
  summarize(items, done, failed);
  console.log(
    'Transcription, quiz, image and topic are generated in the background (a few minutes per cast).'
  );
};

const createArticles = async (folder, { dryRun, yes }) => {
  banner('ARTICLES');
  const items = loadArticles(folder);
  if (!items.length) return console.log('No .json files found.');
  const [universities, articles] = await Promise.all([
    fetchUniversityNames(),
    api.request('GET', '/article'),
  ]);
  const ready = planItems(items, {
    universities,
    existingTitles: new Set(articles.map((a) => a.title)),
  });
  console.log(`\n${ready.length} of ${items.length} ready to create.`);
  if (!ready.length || dryRun) return;

  const { userId, token, email } = await getSession();
  if (!yes && !(await confirm(`Create ${ready.length} articles as ${email}?`))) return;

  let done = 0;
  const failed = [];
  for (const [index, item] of ready.entries()) {
    const label = `[${index + 1}/${ready.length}] ${item.name}`;
    process.stdout.write(`  ${label} ...`);
    try {
      await api.request('POST', '/article', {
        token,
        json: { ...item.payload, brightmindid: userId },
      });
      process.stdout.write(' done\n');
      done += 1;
    } catch (error) {
      process.stdout.write(` FAILED: ${error.message}\n`);
      item.failure = error.message;
      failed.push(item);
    }
  }
  summarize(items, done, failed);
  console.log(
    'Quiz, image and topic are generated in the background (about a minute per article).'
  );
};

// ---------------------------------------------------------------- purge

// Users are deliberately not purgeable: they are real app accounts (and can only delete themselves).
const RESOURCES = {
  casts: { path: '/cast', label: (item) => item.title },
  articles: { path: '/article', label: (item) => item.title },
  universities: { path: '/university', label: (item) => item.displayedName || item.name },
};

const purge = async (type, { yes }) => {
  const resource = RESOURCES[type];
  if (!resource)
    throw new Error(`Unknown type "${type}". Use one of: ${Object.keys(RESOURCES).join(', ')}`);
  banner(`PURGE ${type.toUpperCase()}`);
  const items = await api.request('GET', resource.path);
  if (!items.length) return console.log(`No ${type} on ${api.BASE_URL}.`);
  items.forEach((item) => line('-', resource.label(item)));

  const { token } = await getSession();
  const answer = yes
    ? type
    : await ask(`\nDelete these ${items.length} ${type}? Type "${type}" to confirm: `);
  if (answer !== type) return console.log('Aborted.');

  let deleted = 0;
  for (const item of items) {
    try {
      await api.request('DELETE', `${resource.path}/${item._id}`, { token });
      deleted += 1;
    } catch (error) {
      line('FAILED', resource.label(item), error.message);
    }
  }
  console.log(`\nDeleted ${deleted}/${items.length} ${type}.`);
};

// ---------------------------------------------------------------- signup

const signup = async ({ picture }) => {
  banner('CREATE ACCOUNT');
  const email = await ask('Email: ');
  const username = await ask('Username: ');
  const password = await askHidden('Password: ');
  if ((await askHidden('Repeat password: ')) !== password)
    throw new Error('Passwords do not match.');
  ROLES.forEach((role, index) => console.log(`  ${index + 1}) ${role}`));
  const role = ROLES[Number((await ask('Role [1]: ')) || 1) - 1];
  if (!role) throw new Error('Invalid role.');
  const university =
    role === 'Learning Enthusiast'
      ? ''
      : await ask('University key (optional, e.g. UniversityofQueensland): ');

  const file = picture
    ? {
        field: 'image',
        path: picture,
        filename: path.basename(picture),
        contentType: IMAGE_TYPES[path.extname(picture).toLowerCase()] || 'image/jpeg',
      }
    : {
        field: 'image',
        buffer: await api.download(PLACEHOLDER_ICON),
        filename: 'profile.png',
        contentType: 'image/png',
      };
  let result;
  try {
    result = await api.upload('/user/signup', {
      fields: { user: JSON.stringify({ email, username, password, role, university }) },
      file,
    });
  } catch (error) {
    // The backend deletes the account and answers 500 when the verification email can't be sent.
    if (error.status === 500) {
      error.message +=
        '\nThe server could not send the verification email: check EMAIL_USER / EMAIL_PWD ' +
        '(Gmail app password) in /opt/homeboy/brightminds.env, then `docker compose up -d brightminds`.';
    }
    throw error;
  }
  console.log(`\n${result.response}`);
  console.log('Then put BM_EMAIL / BM_PASSWORD in .env to post content as this account.');
};

// ---------------------------------------------------------------- entry

const run = async (command, target, options) => {
  switch (command) {
    case 'universities':
      return createUniversities([target], options);
    case 'casts':
      return createCasts(target, options);
    case 'articles':
      return createArticles(target, options);
    case 'purge':
      return purge(target, options);
    case 'signup':
      return signup(options);
    default:
      return console.log(HELP);
  }
};

const MENU = [
  ['universities', 'Create universities used by a content folder', 'Content folder: '],
  ['casts', 'Upload casts', 'Folder containing the cast sub-folders: '],
  ['articles', 'Create articles', 'Folder containing the article .json files: '],
  [
    'purge',
    'Purge (delete all) casts, articles or universities',
    'What to purge (casts/articles/universities): ',
  ],
  ['signup', 'Create the account content is posted as'],
];

const menu = async () => {
  for (;;) {
    banner(`BRIGHTMINDS CONTENT — ${API_LABEL}`);
    MENU.forEach(([, label], index) => console.log(`  ${index + 1}) ${label}`));
    console.log('  Q) Quit');
    const choice = (await ask('\nChoice: ')).toLowerCase();
    if (choice === 'q') return;
    const entry = MENU[Number(choice) - 1];
    if (!entry) continue;
    const [command, , question] = entry;
    const target = question ? await askPath(question) : undefined;
    try {
      await run(command, target, {});
    } catch (error) {
      console.error(`\nError: ${error.message}`);
    }
  }
};

const main = async () => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      yes: { type: 'boolean', short: 'y', default: false },
      icons: { type: 'string' },
      picture: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, target] = positionals;
  if (values.help || command === 'help') return console.log(HELP);

  await checkHealth();
  if (!command) return menu();
  if (['universities', 'casts', 'articles', 'purge'].includes(command) && !target) {
    throw new Error(`"${command}" needs an argument. Run: node bm.js help`);
  }
  if (['universities', 'casts', 'articles'].includes(command) && !fs.existsSync(target)) {
    throw new Error(`Folder not found: ${target}`);
  }
  return run(command, target, {
    dryRun: values['dry-run'],
    yes: values.yes,
    icons: values.icons,
    picture: values.picture,
  });
};

main()
  .catch((error) => {
    console.error(`\nError: ${error.message}`);
    if (error.cause) console.error(`Cause: ${error.cause.message || error.cause}`);
    process.exitCode = 1;
  })
  .finally(closePrompts);
