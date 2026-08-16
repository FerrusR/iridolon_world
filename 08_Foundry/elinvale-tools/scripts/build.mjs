#!/usr/bin/env node
/**
 * Compile all compendium packs for a Foundry VTT module.
 *
 * Usage: node scripts/build.mjs   (run from the module root; requires `npm install @foundryvtt/foundryvtt-cli`)
 */
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import fs from "fs";
import os from "os";
import path from "path";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const randomId = () =>
  Array.from({ length: 16 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

// Pack "type" (module.json) → top-level DB collection
const TYPE_COLLECTION = {
  Actor: "actors", Adventure: "adventures", Cards: "cards", Item: "items",
  JournalEntry: "journal", Macro: "macros", Playlist: "playlists",
  RollTable: "tables", Scene: "scenes",
};

// Embedded collections that get their own hierarchical keys
const HIERARCHY = {
  actors: { items: "items", effects: "effects" },
  items: { effects: "effects" },
  journal: { pages: "pages", categories: "categories" },
  tables: { results: "results" },
  playlists: { sounds: "sounds" },
  cards: { cards: "cards" },
};

/** Recursively assign _id + _key to a document and its embedded children. */
function keyDocument(doc, collection, sublevel = collection, idPrefix = "") {
  doc._id ??= randomId();
  const id = idPrefix ? `${idPrefix}.${doc._id}` : doc._id;
  doc._key = `!${sublevel}!${id}`;
  for (const [field, childCollection] of Object.entries(HIERARCHY[collection] ?? {})) {
    for (const child of doc[field] ?? []) {
      keyDocument(child, childCollection, `${sublevel}.${field}`, id);
    }
  }
  return doc;
}

const jsonFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(p);
    return entry.name.endsWith(".json") ? [p] : [];
  });

const moduleRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(moduleRoot, "module.json"), "utf-8"));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fvtt-build-"));
let failed = false;

for (const pack of manifest.packs ?? []) {
  const srcDir = path.join(moduleRoot, "src", pack.name);
  const destDir = path.join(moduleRoot, pack.path);
  const tempDir = path.join(tempRoot, pack.name);
  const collection = TYPE_COLLECTION[pack.type];
  if (!collection) {
    console.error(`✗ ${pack.name}: unsupported pack type "${pack.type}"`);
    failed = true;
    continue;
  }
  if (!fs.existsSync(srcDir)) {
    console.warn(`- ${pack.name}: no src/${pack.name}/ directory, skipping`);
    continue;
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const seenIds = new Map();
  let docCount = 0;
  for (const file of jsonFiles(srcDir)) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch (err) {
      console.error(`✗ ${file}: invalid JSON — ${err.message}`);
      failed = true;
      continue;
    }
    const before = JSON.stringify(data);
    const isFolders = path.basename(file) === "_folders.json";
    const docs = isFolders ? data : [data];
    for (const doc of docs) {
      const hadId = !!doc._id;
      keyDocument(doc, isFolders ? "folders" : collection);
      if (!hadId) console.log(`  assigned _id ${doc._id} → ${path.relative(moduleRoot, file)}`);
      if (seenIds.has(doc._id)) {
        console.error(`✗ duplicate _id ${doc._id} in ${file} and ${seenIds.get(doc._id)}`);
        failed = true;
      }
      seenIds.set(doc._id, file);
      docCount++;
      fs.writeFileSync(path.join(tempDir, `${doc._id}.json`), JSON.stringify(doc));
    }
    const stripKeys = (d) => {
      const { _key, ...rest } = d;
      for (const [field] of Object.entries(HIERARCHY[collection] ?? {})) {
        if (Array.isArray(rest[field])) rest[field] = rest[field].map(stripKeys);
      }
      return rest;
    };
    const cleaned = isFolders ? docs.map(stripKeys) : stripKeys(docs[0]);
    if (JSON.stringify(cleaned) !== before) {
      fs.writeFileSync(file, JSON.stringify(cleaned, null, 4) + "\n");
    }
  }

  if (failed) continue;
  fs.rmSync(destDir, { recursive: true, force: true });
  await compilePack(tempDir, destDir, { log: false });
  console.log(`✓ ${pack.name}: compiled ${docCount} document(s) → ${pack.path}`);
}

fs.rmSync(tempRoot, { recursive: true, force: true });
if (failed) {
  console.error("Build finished with errors.");
  process.exit(1);
}
