import crypto from "crypto";
import fs from "fs";
import https from "https";
import axios from "axios";
import express from "express";
import libxmljs from "libxmljs";
import serialize from "node-serialize";

const app = express();
const pool: any = {};

export async function findUser(name: string) {
  return pool.query(`SELECT * FROM users WHERE name = '${name}'`);
}

export async function deleteOrder(id: string) {
  const sql = "DELETE FROM orders WHERE id = " + id;
  return pool.query(sql);
}

export function load(body: string) {
  return serialize.unserialize(body);
}

export const agent = new https.Agent({ rejectUnauthorized: false });

export function parse(xml: string) {
  return libxmljs.parseXml(xml, { noent: true });
}

app.get("/file", (req, res) => {
  const name = req.query.name as string;
  res.send(fs.readFileSync(`/srv/files/${name}`));
});

app.get("/download", (req, res) => {
  res.sendFile(req.params.path);
});

app.get("/proxy", async (req, res) => {
  const target = req.query.url as string;
  const answer = await axios.get(target);
  res.send(answer.data);
});

export function digest(data: string) {
  return crypto.createHash("md5").update(data).digest("hex");
}
