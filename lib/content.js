// Reads cast folders / article files from disk and validates them against the backend's rules.
const fs = require('fs');
const path = require('path');

// Must match the backend (lists/departments.js) and the app (shared/data/*.js).
const DEPARTMENTS = [
  'Medicine',
  'SocialSciences',
  'Engineering',
  'ArtsandHumanities',
  'ComputerScience',
  'BiochemistryGeneticsandMolecularBiology',
  'AgriculturalandBiologicalSciences',
  'EnvironmentalScience',
  'MaterialsScience',
  'PhysicsandAstronomy',
  'BusinessManagementandAccounting',
  'HealthProfessions',
  'EconomicsEconometricsandFinance',
  'Psychology',
  'Chemistry',
  'EarthandPlanetarySciences',
  'Neuroscience',
  'Mathematics',
  'ImmunologyandMicrobiology',
  'DecisionSciences',
  'Energy',
  'Nursing',
  'PharmacologyToxicologyandPharmaceutics',
  'Dentistry',
  'ChemicalEngineering',
  'Veterinary',
];
const CATEGORIES = ['Research Presentation', '3MT'];
const MAX_TITLE_LENGTH = 85;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const VIDEO_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mpeg': 'video/mpeg',
  '.3gp': 'video/3gpp',
};

const CAST_REQUIRED = ['title', 'university', 'category', 'visibility', 'link'];
const CAST_OPTIONAL = ['department', 'topic', 'dateadded'];
const ARTICLE_REQUIRED = ['title', 'description', 'university', 'category', 'visibility'];
const ARTICLE_OPTIONAL = ['link', 'department', 'topic', 'dateadded', 'duration'];

const readJson = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // strip BOM
};

/**
 * Validates metadata and returns the payload to send (only known fields, trimmed, normalised).
 * Throws an Error describing the first problem found.
 */
const buildPayload = (data, required, optional) => {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('not a JSON object');
  const unknown = Object.keys(data).filter((key) => ![...required, ...optional].includes(key));
  if (unknown.length) throw new Error(`unknown field(s): ${unknown.join(', ')}`);

  const payload = {};
  for (const key of [...required, ...optional]) {
    let value = data[key];
    if (value === undefined || value === null || value === '') {
      if (required.includes(key)) throw new Error(`missing "${key}"`);
      continue;
    }
    if (key === 'duration') {
      if (!Number.isInteger(value) || value <= 0)
        throw new Error('"duration" must be a positive integer (minutes)');
    } else {
      if (key === 'visibility' && typeof value === 'number') value = String(value);
      if (typeof value !== 'string' || !value.trim())
        throw new Error(`"${key}" must be a non-empty string`);
      value = value.trim();
    }
    payload[key] = value;
  }

  if (payload.title.length > MAX_TITLE_LENGTH) {
    throw new Error(`title is ${payload.title.length} characters (max ${MAX_TITLE_LENGTH})`);
  }
  if (!CATEGORIES.includes(payload.category)) {
    throw new Error(`category "${payload.category}" must be one of: ${CATEGORIES.join(', ')}`);
  }
  if (!/^[1-5]$/.test(payload.visibility)) throw new Error('"visibility" must be "1" to "5"');
  if (payload.department && !DEPARTMENTS.includes(payload.department)) {
    throw new Error(`unknown department "${payload.department}"`);
  }
  if (payload.link && !/^https?:\/\//.test(payload.link))
    throw new Error('"link" must be an http(s) URL');
  if (payload.dateadded) {
    const date = new Date(payload.dateadded);
    if (Number.isNaN(date.getTime())) throw new Error(`invalid dateadded "${payload.dateadded}"`);
    payload.dateadded = date.toISOString();
  }
  return payload;
};

/** One cast per sub-folder: `details.json` + exactly one video file (other files are ignored). */
const loadCasts = (folder) =>
  fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const dir = path.join(folder, name);
      const item = { name };
      try {
        const files = fs.readdirSync(dir);
        const details = files.find((file) => file.toLowerCase() === 'details.json');
        if (!details) throw new Error('no details.json');
        const videos = files.filter((file) => VIDEO_TYPES[path.extname(file).toLowerCase()]);
        if (videos.length !== 1) throw new Error(`expected 1 video file, found ${videos.length}`);

        item.payload = buildPayload(
          readJson(path.join(dir, details)),
          CAST_REQUIRED,
          CAST_OPTIONAL
        );
        item.videoPath = path.join(dir, videos[0]);
        item.videoType = VIDEO_TYPES[path.extname(videos[0]).toLowerCase()];
        item.videoBytes = fs.statSync(item.videoPath).size;
        if (item.videoBytes > MAX_VIDEO_BYTES) throw new Error('video is larger than 1 GB');
      } catch (error) {
        item.error = error.message;
      }
      return item;
    });

/** One article per `.json` file at the top level of the folder. */
const loadArticles = (folder) =>
  fs
    .readdirSync(folder)
    .filter((file) => path.extname(file).toLowerCase() === '.json')
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const item = { name };
      try {
        item.payload = buildPayload(
          readJson(path.join(folder, name)),
          ARTICLE_REQUIRED,
          ARTICLE_OPTIONAL
        );
      } catch (error) {
        item.error = error.message;
      }
      return item;
    });

module.exports = { loadCasts, loadArticles, readJson, DEPARTMENTS, CATEGORIES };
