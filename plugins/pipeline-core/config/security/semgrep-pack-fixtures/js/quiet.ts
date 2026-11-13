import crypto from "crypto";
import fs from "fs";
import https from "https";
import path from "path";
import axios from "axios";
import express from "express";
import libxmljs from "libxmljs";

const app = express();
const pool: any = {};
const sql: any = {};

export async function findUser(name: string) {
  return pool.query("SELECT * FROM users WHERE name = $1", [name]);
}

export async function count() {
  return pool.query("SELECT count(*) FROM users " + "WHERE active");
}

export async function tagged(name: string) {
  return pool.query(sql`SELECT * FROM users WHERE name = ${name}`);
}

export function greeting(name: string) {
  return `select a product, ${name}`;
}

export function load(body: string) {
  return JSON.parse(body);
}

export const agent = new https.Agent({ rejectUnauthorized: true });

export function parse(xml: string) {
  return libxmljs.parseXml(xml, { noent: false });
}

app.get("/file", (req, res) => {
  const name = path.basename(req.query.name as string);
  res.send(fs.readFileSync(path.join("/srv/files", name)));
});

app.get("/item", async (req, res) => {
  const answer = await axios.get(`https://api.internal.example/items/${req.query.id}`);
  res.send(answer.data);
});

export function digest(data: string) {
  return crypto.createHash("sha256").update(data).digest("hex");
}
