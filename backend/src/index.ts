import cors from "cors";
import express from "express";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import type { NextFunction, Request, Response } from "express";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface Product extends RowDataPacket {
  id: number;
  name: string;
  cost: number;
}

interface TeamMember extends RowDataPacket {
  name: string;
}

interface TransitLine extends RowDataPacket {
  id: number;
  number: string;
  name: string;
  type: string;
  color: string;
}

interface LineDirection extends RowDataPacket {
  id: number;
  line_id: number;
  name: string;
}

interface Stop extends RowDataPacket {
  id: number;
  stop_order?: number;
  name: string;
  lines: string;
  transfer_lines: string;
  image_url: string | null;
  is_transfer: boolean;
  x: number | null;
  y: number | null;
  wheelchair_accessible: boolean;
  has_shelter: boolean;
  has_bench: boolean;
  has_ticket_machine: boolean;
  has_display: boolean;
}

interface StopInput {
  name: string;
  image_url: string | null;
  wheelchair_accessible: boolean;
  has_shelter: boolean;
  has_ticket_machine: boolean;
}

// DATABASE_URL, e.g. mysql://tda_user:strongPassword%3F@127.0.0.1:3306/product
const db = mysql.createPool(process.env.DATABASE_URL!);
const schemaSql = await readFile(new URL("../docker/schema.sql", import.meta.url), "utf8");
const stopsCsv = await readFile(new URL("../docker/seed/stops.csv", import.meta.url), "utf8");

function parseStopsCsv(csv: string) {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const fields = header.split(",");
  return rows.map((row) => {
    const values = row.split(",");
    return Object.fromEntries(fields.map((field, index) => [field, values[index] ?? ""]));
  });
}

function imagePath(name: string) {
  const paths: Record<string, string> = {
    "Turing Terminal": "turingTerminal.png",
    "Ada Exchange": "adaExchange.png",
    "Pixel Park": "pixelPark.png",
    "Byte Square": "byteSquare.png",
    "Stack Garden": "stackGarden.png",
    "Hopper Hall": "hopperHall.png",
    "Compiler Court": "compilerCourt.png",
    "Kernel Hub": "kernelHub.png",
    "Syntax Square": "syntaxSquare.png",
    "Lambda Lane": "lambdaLane.png",
    "Campus Gate": "campusGate.png",
    "Edison East": "edisonEast.png",
    "Notebook Quay": "notebookQuay.png",
    "Library Loop": "libraryLoop.png",
    "Quantum Commons": "quantum Commons.png",
  };
  return `/stops/${paths[name]}`;
}

async function seedStops() {
  const stops = parseStopsCsv(stopsCsv);
  await db.query("DELETE FROM stops");
  for (const stop of stops) {
    await db.execute(
      `INSERT INTO stops
        (id, name, \`lines\`, transfer_lines, image_url, is_transfer, x, y,
         wheelchair_accessible, has_shelter, has_bench, has_ticket_machine, has_display)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(stop.id),
        stop.name,
        stop.lines,
        stop.transfer_lines,
        imagePath(stop.name),
        stop.is_transfer === "true",
        Number(stop.x),
        Number(stop.y),
        stop.wheelchair_accessible === "true",
        stop.has_shelter === "true",
        stop.has_bench === "true",
        stop.has_ticket_machine === "true",
        stop.has_display === "true",
      ],
    );
  }
}

async function ensureStopColumns() {
  const [columns] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM stops");
  const names = new Set(columns.map((column) => column.Field));
  if (!names.has("lines")) {
    await db.query("ALTER TABLE stops ADD COLUMN `lines` VARCHAR(255) NOT NULL DEFAULT '' AFTER name");
  }
  if (!names.has("transfer_lines")) {
    await db.query("ALTER TABLE stops ADD COLUMN transfer_lines VARCHAR(255) NOT NULL DEFAULT '' AFTER `lines`");
  }
}

async function ensureLineColumns() {
  const [columns] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM transit_lines");
  const names = new Set(columns.map((column) => column.Field));
  if (!names.has("number") && names.has("code")) {
    await db.query("ALTER TABLE transit_lines CHANGE COLUMN code number VARCHAR(20) NOT NULL");
  }
}

async function seedLines() {
  await db.query("DELETE FROM transit_lines");
  await db.query(
    `INSERT INTO transit_lines (number, name, type, color) VALUES
      ('128', 'Modrá linka', 'Městská', '#0070BB'),
      ('136', 'Zelená linka', 'Příměstská', '#6DD4B1'),
      ('676', 'Oranžová linka', 'Městská', '#F29F05')
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), type = VALUES(type), color = VALUES(color)`,
  );
}

async function seedLineRoutes() {
  const lineKeys: Record<string, string> = { "128": "A", "136": "B", "676": "C" };
  const [lines] = await db.query<TransitLine[]>("SELECT id, number FROM transit_lines ORDER BY id");
  const [stops] = await db.query<Stop[]>("SELECT id, \`lines\` FROM stops ORDER BY id");
  await db.query("DELETE FROM line_direction_stops");
  await db.query("DELETE FROM line_directions");

  for (const line of lines) {
    const lineStops = stops.filter((stop) => stop.lines.split(";").includes(lineKeys[line.number]));
    const directions = [
      { name: "Směr centrum", orderedStops: lineStops },
      { name: "Směr okraj města", orderedStops: [...lineStops].reverse() },
    ];
    for (const direction of directions) {
      const [result] = await db.execute<ResultSetHeader>(
        "INSERT INTO line_directions (line_id, name) VALUES (?, ?)",
        [line.id, direction.name],
      );
      for (const [index, stop] of direction.orderedStops.entries()) {
        await db.execute(
          "INSERT INTO line_direction_stops (direction_id, stop_id, stop_order) VALUES (?, ?, ?)",
          [result.insertId, stop.id, index + 1],
        );
      }
    }
  }
}

// The database may still be starting up (no startup order on Tour de Cloud), so retry.
for (let attempt = 1; ; attempt++) {
  try {
    for (const statement of schemaSql.split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
    await ensureStopColumns();
    await ensureLineColumns();
    await seedLines();
    await seedStops();
    await seedLineRoutes();
    break;
  } catch (error) {
    if (attempt === 60) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Waiting for database (attempt ${attempt}): ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function parseProduct(body: unknown): { name: string; cost: number } | null {
  const { name, cost } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !Number.isInteger(cost)) return null;
  return { name, cost: cost as number };
}

function parseStop(body: unknown): StopInput | null {
  const data = (body ?? {}) as Record<string, unknown>;
  const allowedFields = new Set([
    "name",
    "image_url",
    "wheelchair_accessible",
    "has_shelter",
    "has_ticket_machine",
  ]);
  if (Object.keys(data).some((field) => !allowedFields.has(field))) return null;
  if (
    typeof data.name !== "string" ||
    data.name.trim().length === 0 ||
    data.name.length > 255 ||
    (data.image_url !== undefined && data.image_url !== null && typeof data.image_url !== "string") ||
    (typeof data.image_url === "string" && data.image_url.length > 255) ||
    (typeof data.image_url === "string" && !isValidUrl(data.image_url)) ||
    typeof data.wheelchair_accessible !== "boolean" ||
    typeof data.has_shelter !== "boolean" ||
    typeof data.has_ticket_machine !== "boolean"
  ) {
    return null;
  }
  return {
    name: data.name,
    image_url: data.image_url === undefined ? null : data.image_url as string | null,
    wheelchair_accessible: data.wheelchair_accessible,
    has_shelter: data.has_shelter,
    has_ticket_machine: data.has_ticket_machine,
  };
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function parseStopId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 1 ? id : null;
}

function invalidStopId(res: Parameters<Parameters<typeof app.get>[1]>[1]) {
  return res.status(400).json({ error: "Invalid stop ID" });
}

function stopResponse(stop: Stop) {
  return {
    id: stop.id,
    name: stop.name,
    image_url: stop.image_url,
    wheelchair_accessible: Boolean(stop.wheelchair_accessible),
    has_shelter: Boolean(stop.has_shelter),
    has_ticket_machine: Boolean(stop.has_ticket_machine),
  };
}

const app = express();
const ADMIN_API_KEY = "Kyqc49jIM+5+D0Sed8ZQ671gxkd7W/bBTWjDtZ0Zrgk=";

function requireAdminApiKey(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("Authorization");
  if (authorization !== `Bearer ${ADMIN_API_KEY}`) {
    res.status(401).json({ error: "Missing or invalid administrator API key" });
    return;
  }
  next();
}

// Allow a frontend dev server on another port (e.g. localhost:3001) to call the API.
app.use(cors());
app.use(express.json());

app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/v1/team", async (_req, res) => {
  const [[team]] = await db.query<TeamMember[]>("SELECT name FROM team WHERE id = 1");
  const [members] = await db.query<TeamMember[]>(
    "SELECT name FROM team_member WHERE team_id = 1 ORDER BY id",
  );
  res.json({ name: team.name, members: members.map((member) => member.name) });
});

app.get("/api/v1/lines", async (_req, res) => {
  const [lines] = await db.query<TransitLine[]>(
    "SELECT id, number, name, type, color FROM transit_lines ORDER BY number",
  );
  res.status(200).json(lines);
});

app.get("/api/v1/lines/:id", async (req, res) => {
  const id = parseStopId(String(req.params.id));
  if (id === null) {
    res.status(400).json({ error: "Invalid line ID" });
    return;
  }
  const [[line]] = await db.execute<TransitLine[]>(
    "SELECT id, number, name, type, color FROM transit_lines WHERE id = ?",
    [id],
  );
  if (!line) {
    res.status(404).json({ error: "Line not found" });
    return;
  }
  const [directions] = await db.execute<LineDirection[]>(
    "SELECT id, line_id, name FROM line_directions WHERE line_id = ? ORDER BY id",
    [id],
  );
  const directionResponses = [];
  for (const direction of directions) {
    const [stops] = await db.execute<Stop[]>(
      `SELECT s.id, s.name, s.image_url, lds.stop_order
       FROM line_direction_stops lds
       JOIN stops s ON s.id = lds.stop_id
       WHERE lds.direction_id = ?
       ORDER BY lds.stop_order`,
      [direction.id],
    );
    directionResponses.push({
      id: direction.id,
      name: direction.name,
      stops: stops.map((stop) => ({
        id: stop.id,
        name: stop.name,
        image_url: stop.image_url,
        order: stop.stop_order,
      })),
    });
  }
  res.status(200).json({ ...line, directions: directionResponses });
});

app.get("/api/v1/stops", async (_req, res) => {
  const [stops] = await db.query<Stop[]>(
    "SELECT id, name, image_url, wheelchair_accessible, has_shelter, has_ticket_machine FROM stops ORDER BY name",
  );
  res.status(200).json(stops.map(stopResponse));
});

app.get("/api/v1/stops/:id", async (req, res) => {
  const id = parseStopId(String(req.params.id));
  if (id === null) {
    invalidStopId(res);
    return;
  }
  const [[stop]] = await db.execute<Stop[]>(
    "SELECT id, name, image_url, wheelchair_accessible, has_shelter, has_ticket_machine FROM stops WHERE id = ?",
    [id],
  );
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  res.status(200).json(stopResponse(stop));
});

app.post("/api/v1/stops", requireAdminApiKey, async (req, res) => {
  const data = parseStop(req.body);
  if (!data) {
    res.status(400).json({ error: "Invalid input data" });
    return;
  }
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO stops (name, image_url, wheelchair_accessible, has_shelter, has_ticket_machine)
     VALUES (?, ?, ?, ?, ?)`,
    [data.name, data.image_url, data.wheelchair_accessible, data.has_shelter, data.has_ticket_machine],
  );
  const [[stop]] = await db.execute<Stop[]>(
    "SELECT id, name, image_url, wheelchair_accessible, has_shelter, has_ticket_machine FROM stops WHERE id = ?",
    [result.insertId],
  );
  res.status(201).json(stopResponse(stop));
});

app.put("/api/v1/stops/:id", requireAdminApiKey, async (req, res) => {
  const data = parseStop(req.body);
  if (!data) {
    res.status(400).json({ error: "Invalid input data" });
    return;
  }
  const id = parseStopId(String(req.params.id));
  if (id === null) {
    invalidStopId(res);
    return;
  }
  const [[existingStop]] = await db.execute<Stop[]>("SELECT id FROM stops WHERE id = ?", [id]);
  if (!existingStop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  await db.execute(
    `UPDATE stops
     SET name = ?, image_url = ?, wheelchair_accessible = ?, has_shelter = ?, has_ticket_machine = ?
     WHERE id = ?`,
    [data.name, data.image_url, data.wheelchair_accessible, data.has_shelter, data.has_ticket_machine, id],
  );
  const [[stop]] = await db.execute<Stop[]>(
    "SELECT id, name, image_url, wheelchair_accessible, has_shelter, has_ticket_machine FROM stops WHERE id = ?",
    [id],
  );
  res.status(200).json(stopResponse(stop));
});

app.delete("/api/v1/stops/:id", requireAdminApiKey, async (req, res) => {
  const id = parseStopId(String(req.params.id));
  if (id === null) {
    invalidStopId(res);
    return;
  }
  const [result] = await db.execute<ResultSetHeader>("DELETE FROM stops WHERE id = ?", [id]);
  if (result.affectedRows === 0) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  res.status(204).send();
});

app.get("/api/product", async (_req, res) => {
  const [products] = await db.query<Product[]>("SELECT id, name, cost FROM product ORDER BY id");
  res.json(products);
});

app.post("/api/product", async (req, res) => {
  const data = parseProduct(req.body);
  if (!data) {
    res.status(400).json({ message: "name and cost are required" });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO product (name, cost) VALUES (?, ?)",
    [data.name, data.cost],
  );
  res.json({ id: result.insertId, ...data });
});

app.put("/api/product/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [[product]] = await db.execute<Product[]>("SELECT id FROM product WHERE id = ?", [id]);
  if (!product) {
    res.status(404).json({ message: "Product does not exist" });
    return;
  }

  const data = parseProduct(req.body);
  if (!data) {
    res.status(400).json({ message: "name and cost are required" });
    return;
  }

  await db.execute("UPDATE product SET name = ?, cost = ? WHERE id = ?", [data.name, data.cost, id]);
  res.json({ id, ...data });
});

app.delete("/api/product/:id", async (req, res) => {
  await db.execute("DELETE FROM product WHERE id = ?", [Number(req.params.id)]);
  res.json({ message: "Product was deleted permanently from DB." });
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  next(error);
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
