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

interface LineInput {
  number: string;
  name: string;
  type: string;
  color: string;
}

interface LineTrip extends RowDataPacket {
  id: number;
  route_id: number;
  line_id: number;
  direction: "outbound" | "inbound";
  departure_time: string;
  wheelchair_accessible?: boolean;
}

interface LineDirection extends RowDataPacket {
  id: number;
  line_id: number;
  name: string;
  direction: "outbound" | "inbound";
}

interface Stop extends RowDataPacket {
  id: number;
  route_stop_id?: number;
  stop_order?: number;
  arrival_time?: string;
  departure_time?: string;
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

interface RouteStop extends RowDataPacket {
  id: number;
  route_id: number;
  stop_id: number;
  stop_order: number;
}

interface TimetableRow extends RowDataPacket {
  trip_id: number;
  route_stop_id: number;
  arrival_time: string;
  departure_time: string;
}

const defaultStopServiceInfo = {
  platform: { name: "Nástupiště 1", is_temporary: false },
  boarding_type: "regular",
  alighting_type: "regular",
  wheelchair_accessible: true,
  service_notices: [],
};

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
const stopsTimeSource = JSON.parse(await readFile(new URL("../docker/seed/stops_time.json", import.meta.url), "utf8"));
const tripsSource = JSON.parse(await readFile(new URL("../docker/seed/trips.json", import.meta.url), "utf8"));

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
  if (!names.has("source_ref")) {
    await db.query("ALTER TABLE stops ADD COLUMN source_ref VARCHAR(32) NULL UNIQUE AFTER id");
  }
}

async function ensureLineColumns() {
  const [columns] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM transit_lines");
  const names = new Set(columns.map((column) => column.Field));
  if (!names.has("number") && names.has("code")) {
    await db.query("ALTER TABLE transit_lines CHANGE COLUMN code number VARCHAR(20) NOT NULL");
  }
}

async function ensureLineTripColumns() {
  const [columns] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM line_trips");
  const names = new Set(columns.map((column) => column.Field));
  if (!names.has("route_id")) {
    const [constraints] = await db.query<RowDataPacket[]>(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'line_trips' AND REFERENCED_TABLE_NAME IS NOT NULL",
    );
    for (const constraint of constraints) {
      await db.query(`ALTER TABLE line_trips DROP FOREIGN KEY \`${constraint.CONSTRAINT_NAME}\``);
    }
    if (names.has("line_id")) await db.query("ALTER TABLE line_trips DROP COLUMN line_id");
    if (names.has("direction")) await db.query("ALTER TABLE line_trips DROP COLUMN direction");
    await db.query("ALTER TABLE line_trips ADD COLUMN route_id INT NULL AFTER id");
  }
  if (!columns.some((column) => column.Field === "departure_time")) {
    await db.query("ALTER TABLE line_trips ADD COLUMN departure_time TIME NOT NULL DEFAULT '00:00:00' AFTER route_id");
  }
}

async function ensureNetworkSourceColumns() {
  const additions: Array<[string, string, string]> = [
    ["routes", "source_ref", "VARCHAR(32) NULL UNIQUE"],
    ["route_stops", "source_ref", "VARCHAR(64) NULL UNIQUE"],
    ["route_stops", "stop_ref", "VARCHAR(32) NULL"],
    ["line_trips", "source_trip_id", "VARCHAR(64) NULL UNIQUE"],
    ["line_trips", "service_ref", "VARCHAR(32) NULL"],
    ["line_trips", "headsign", "VARCHAR(255) NULL"],
    ["line_trips", "block_ref", "VARCHAR(32) NULL"],
    ["line_trips", "wheelchair_accessible", "BOOLEAN NOT NULL DEFAULT FALSE"],
  ];
  for (const [table, column, definition] of additions) {
    const [columns] = await db.query<RowDataPacket[]>(`SHOW COLUMNS FROM ${table}`);
    if (!columns.some((item) => item.Field === column)) {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
}

async function ensureLineTripForeignKey() {
  const [constraints] = await db.query<RowDataPacket[]>(
    "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'line_trips' AND COLUMN_NAME = 'route_id' AND REFERENCED_TABLE_NAME = 'routes'",
  );
  if (constraints.length === 0) {
    await db.query("ALTER TABLE line_trips MODIFY route_id INT NOT NULL");
    await db.query("ALTER TABLE line_trips ADD CONSTRAINT line_trips_route_fk FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE");
  }
}

async function ensureRouteStopId() {
  const [columns] = await db.query<RowDataPacket[]>("SHOW COLUMNS FROM route_stops");
  if (!columns.some((column) => column.Field === "id")) {
    await db.query("ALTER TABLE route_stops ADD COLUMN id INT NOT NULL AUTO_INCREMENT UNIQUE FIRST");
    await db.query("ALTER TABLE route_stops DROP PRIMARY KEY");
    await db.query("ALTER TABLE route_stops ADD PRIMARY KEY (id)");
  }
}

async function ensureTimetableTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS trip_timetables (
    trip_id INT NOT NULL,
    route_stop_id INT NOT NULL,
    arrival_time TIME NOT NULL,
    departure_time TIME NOT NULL,
    PRIMARY KEY (trip_id, route_stop_id),
    FOREIGN KEY (trip_id) REFERENCES line_trips(id) ON DELETE CASCADE,
    FOREIGN KEY (route_stop_id) REFERENCES route_stops(id) ON DELETE CASCADE,
    CONSTRAINT timetable_time_order CHECK (arrival_time <= departure_time)
  )`);
}

async function seedLines() {
  await db.query("DELETE FROM transit_lines");
  await db.query(
    `INSERT INTO transit_lines (number, name, type, color) VALUES
      ('A', 'Green Line', 'Městská', '#00B24B'),
      ('B', 'Yellow Line', 'Městská', '#FFC20E'),
      ('C', 'Red Line', 'Městská', '#ED1B2F')
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), type = VALUES(type), color = VALUES(color)`,
  );
}

async function seedLineTrips() {
  const [routes] = await db.query<LineDirection[]>("SELECT id FROM routes ORDER BY id");
  const departureTimes = ["06:30:00", "06:45:00"];
  await db.query("DELETE FROM line_trips");
  for (const [index, route] of routes.entries()) {
    await db.execute(
      "INSERT INTO line_trips (route_id, departure_time) VALUES (?, ?)",
      [route.id, departureTimes[index % 2]],
    );
  }
}

function addMinutes(time: string, minutes: number) {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

async function seedTimetables() {
  const [trips] = await db.query<LineTrip[]>("SELECT id, route_id, departure_time FROM line_trips ORDER BY id");
  const [routeStops] = await db.query<RouteStop[]>("SELECT id, route_id, stop_order FROM route_stops ORDER BY route_id, stop_order");
  await db.query("DELETE FROM trip_timetables");
  for (const trip of trips) {
    const stops = routeStops.filter((routeStop) => routeStop.route_id === trip.route_id);
    for (const routeStop of stops) {
      const arrival = addMinutes(trip.departure_time, (routeStop.stop_order - 1) * 5);
      const departure = addMinutes(arrival, 1);
      await db.execute(
        "INSERT INTO trip_timetables (trip_id, route_stop_id, arrival_time, departure_time) VALUES (?, ?, ?, ?)",
        [trip.id, routeStop.id, arrival, departure],
      );
    }
  }
}

async function seedActualNetworkData() {
  const lineNumberByRef: Record<string, string> = { L001: "A", L002: "B", L003: "C" };
  const stopTimes = stopsTimeSource.stop_times as Array<Record<string, string | number>>;
  const sourceTrips = tripsSource.trips as Array<Record<string, string | number | boolean>>;
  const [lines] = await db.query<TransitLine[]>("SELECT id, number FROM transit_lines");
  const lineIds = new Map(lines.map((line) => [line.number, line.id]));
  const [stops] = await db.query<Stop[]>("SELECT id, name FROM stops");
  const stopIds = new Map(stops.map((stop) => [stop.name, stop.id]));

  await db.query("UPDATE stops SET source_ref = NULL");
  for (const stopTime of stopTimes) {
    const stopId = stopIds.get(String(stopTime.stop_name));
    if (stopId) {
      await db.execute("UPDATE stops SET source_ref = ? WHERE id = ?", [String(stopTime.stop_ref), stopId]);
    }
  }

  await db.query("DELETE FROM trip_timetables");
  await db.query("DELETE FROM line_trips");
  await db.query("DELETE FROM route_stops");
  await db.query("DELETE FROM routes");

  const routeIds = new Map<string, number>();
  const routeStopIds = new Map<string, number>();
  const insertedRouteStops = new Set<string>();
  const routeRefs = [...new Set(stopTimes.map((item) => String(item.route_ref)))];
  for (const routeRef of routeRefs) {
    const trip = sourceTrips.find((item) => String(item.route_ref) === routeRef);
    if (!trip) continue;
    const lineId = lineIds.get(lineNumberByRef[String(trip.line_ref)]);
    if (!lineId) continue;
    const direction = Number(trip.direction_id) === 0 ? "outbound" : "inbound";
    const [result] = await db.execute<ResultSetHeader>(
      "INSERT INTO routes (line_id, direction, name, source_ref) VALUES (?, ?, ?, ?)",
      [lineId, direction, String(trip.headsign), routeRef],
    );
    routeIds.set(routeRef, result.insertId);
  }

  for (const stopTime of stopTimes) {
    const routeId = routeIds.get(String(stopTime.route_ref));
    const stopId = stopIds.get(String(stopTime.stop_name));
    if (!routeId || !stopId) continue;
    const routeStopRef = String(stopTime.route_stop_ref);
    if (insertedRouteStops.has(routeStopRef)) continue;
    const [result] = await db.execute<ResultSetHeader>(
      "INSERT INTO route_stops (route_id, stop_id, stop_order, source_ref, stop_ref) VALUES (?, ?, ?, ?, ?)",
      [routeId, stopId, Number(stopTime.stop_sequence), routeStopRef, String(stopTime.stop_ref)],
    );
    insertedRouteStops.add(routeStopRef);
    routeStopIds.set(routeStopRef, result.insertId);
  }

  for (const trip of sourceTrips) {
    const routeId = routeIds.get(String(trip.route_ref));
    if (!routeId) continue;
    const firstTime = stopTimes.find((item) => Number(item.trip_id) === Number(trip.id));
    await db.execute(
      `INSERT INTO line_trips
        (id, route_id, source_trip_id, service_ref, headsign, block_ref, wheelchair_accessible, departure_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(trip.id),
        routeId,
        String(trip.source_trip_id),
        String(trip.service_ref),
        String(trip.headsign),
        String(trip.block_ref),
        Boolean(trip.wheelchair_accessible),
        String(firstTime?.departure_time || "00:00:00"),
      ],
    );
  }

  for (const stopTime of stopTimes) {
    const tripId = Number(stopTime.trip_id);
    const routeStopId = routeStopIds.get(String(stopTime.route_stop_ref));
    if (!routeStopId) continue;
    await db.execute(
      "INSERT INTO trip_timetables (trip_id, route_stop_id, arrival_time, departure_time) VALUES (?, ?, ?, ?)",
      [tripId, routeStopId, String(stopTime.arrival_time), String(stopTime.departure_time)],
    );
  }
}

async function seedLineRoutes() {
  const routeStops: Record<string, number[]> = {
    "128": [1, 2, 3, 4, 5],
    "136": [6, 2, 7, 8, 9, 10, 11],
    "676": [12, 13, 8, 14, 4, 15],
  };
  const [lines] = await db.query<TransitLine[]>("SELECT id, number FROM transit_lines ORDER BY id");
  const [stops] = await db.query<Stop[]>("SELECT id, \`lines\` FROM stops ORDER BY id");
  const stopsById = new Map(stops.map((stop) => [stop.id, stop]));
  await db.query("DELETE FROM route_stops");
  await db.query("DELETE FROM routes");

  for (const line of lines) {
    const lineStops = (routeStops[line.number] || [])
      .map((stopId) => stopsById.get(stopId))
      .filter((stop): stop is Stop => Boolean(stop));
    const directions = [
      { name: "Směr centrum", orderedStops: lineStops },
      { name: "Směr okraj města", orderedStops: [...lineStops].reverse() },
    ];
    for (const direction of directions) {
      const directionValue = direction.name === "Směr centrum" ? "outbound" : "inbound";
      const [result] = await db.execute<ResultSetHeader>(
        "INSERT INTO routes (line_id, direction, name) VALUES (?, ?, ?)",
        [line.id, directionValue, direction.name],
      );
      for (const [index, stop] of direction.orderedStops.entries()) {
        await db.execute(
          "INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES (?, ?, ?)",
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
    await ensureLineTripColumns();
    await ensureRouteStopId();
    await ensureNetworkSourceColumns();
    await ensureTimetableTable();
    await seedLines();
    await seedStops();
    await seedActualNetworkData();
    await ensureLineTripForeignKey();
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

function parseLine(body: unknown): LineInput | null {
  const data = (body ?? {}) as Record<string, unknown>;
  const allowedFields = new Set(["number", "name", "type", "color"]);
  if (Object.keys(data).some((field) => !allowedFields.has(field))) return null;
  if (
    typeof data.number !== "string" ||
    data.number.trim().length === 0 ||
    data.number.length > 20 ||
    typeof data.name !== "string" ||
    data.name.trim().length === 0 ||
    data.name.length > 255 ||
    typeof data.type !== "string" ||
    data.type.trim().length === 0 ||
    data.type.length > 50 ||
    typeof data.color !== "string" ||
    !/^#[0-9A-Fa-f]{6}$/.test(data.color)
  ) return null;
  return {
    number: data.number,
    name: data.name,
    type: data.type,
    color: data.color,
  };
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

function isValidServiceDate(value: unknown) {
  if (value === undefined) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateServiceDate(req: Request, res: Response) {
  if (!isValidServiceDate(req.query.service_date)) {
    res.status(400).json({ error: "Invalid service_date" });
    return false;
  }
  return true;
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

function stopSummary(stop: Stop | undefined) {
  return stop ? { id: stop.id, name: stop.name, image_url: stop.image_url } : null;
}

function apiTime(value: string) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return {
    time: `${String(hours % 24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    dayOffset: Math.floor(hours / 24),
  };
}

async function getRouteStops(routeId: number) {
  const [stops] = await db.execute<Stop[]>(
    `SELECT rs.id AS route_stop_id, s.id, s.name, s.image_url, rs.stop_order
     FROM route_stops rs
     JOIN stops s ON s.id = rs.stop_id
     WHERE rs.route_id = ?
     ORDER BY rs.stop_order`,
    [routeId],
  );
  return stops;
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

app.get("/api/v1/lines/:lineId/trips", async (req, res) => {
  if (!validateServiceDate(req, res)) return;
  const lineId = parseStopId(String(req.params.lineId));
  if (lineId === null) {
    res.status(400).json({ error: "Invalid line ID" });
    return;
  }
  const [[line]] = await db.execute<TransitLine[]>("SELECT id, number, name, type, color FROM transit_lines WHERE id = ?", [lineId]);
  if (!line) {
    res.status(404).json({ error: "Line not found" });
    return;
  }
  const [trips] = await db.execute<LineTrip[]>(
    `SELECT lt.id, r.id AS route_id, r.direction, lt.departure_time, lt.wheelchair_accessible
     FROM line_trips lt
     JOIN routes r ON r.id = lt.route_id
     WHERE r.line_id = ? ORDER BY lt.departure_time, lt.id`,
    [lineId],
  );
  const summaries = [];
  for (const trip of trips) {
    const stops = await getRouteStops(trip.route_id);
    const departure = apiTime(trip.departure_time);
    summaries.push({
      id: trip.id,
      line,
      direction: trip.direction,
      origin: stopSummary(stops[0]),
      destination: stopSummary(stops[stops.length - 1]),
      departure_time: departure.time,
      departure_day_offset: departure.dayOffset,
      wheelchair_accessible: Boolean(trip.wheelchair_accessible),
      service_notices: [],
    });
  }
  res.status(200).json(summaries);
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
    "SELECT id, line_id, direction, name FROM routes WHERE line_id = ? ORDER BY id",
    [id],
  );
  const directionResponses: Array<{
    id: number;
    name: string;
    stops: Array<{ id: number; name: string; image_url: string | null; order: number }>;
  }> = [];
  for (const direction of directions) {
    const [stops] = await db.execute<Stop[]>(
      `SELECT s.id, s.name, s.image_url, rs.stop_order
       FROM route_stops rs
       JOIN stops s ON s.id = rs.stop_id
       WHERE rs.route_id = ?
       ORDER BY rs.stop_order`,
      [direction.id],
    );
    directionResponses.push({
      id: direction.id,
      name: direction.name,
      stops: stops.map((stop) => ({
        id: stop.id,
        name: stop.name,
        image_url: stop.image_url,
        order: stop.stop_order ?? 0,
      })),
    });
  }
  const [trips] = await db.execute<LineTrip[]>(
    "SELECT lt.id, r.route_id, r.direction, lt.departure_time FROM line_trips lt JOIN routes r ON r.id = lt.route_id WHERE r.line_id = ? ORDER BY lt.departure_time, lt.id",
    [id],
  );
  res.status(200).json({
    ...line,
    trips: trips.map((trip, index) => ({
      id: trip.id,
      direction: trip.direction,
      departure_time: apiTime(trip.departure_time).time,
      departure_day_offset: apiTime(trip.departure_time).dayOffset,
      stops: directionResponses[index]?.stops || [],
    })),
    directions: directionResponses,
  });
});

app.get("/api/v1/trips/:id", async (req, res) => {
  if (!validateServiceDate(req, res)) return;
  const id = parseStopId(String(req.params.id));
  if (id === null) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }
  const [[trip]] = await db.execute<LineTrip[]>(
        `SELECT lt.id, lt.route_id, r.line_id, r.direction, lt.wheelchair_accessible,
          lt.departure_time,
            tl.number, tl.name, tl.type, tl.color
     FROM line_trips lt
     JOIN routes r ON r.id = lt.route_id
     JOIN transit_lines tl ON tl.id = r.line_id
     WHERE lt.id = ?`,
    [id],
  );
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }
  const [[direction]] = await db.execute<LineDirection[]>(
    "SELECT id, line_id, direction, name FROM routes WHERE id = ?",
    [trip.route_id],
  );
  const [stops] = await db.execute<Stop[]>(
        `SELECT rs.id AS route_stop_id, s.id, s.name, s.image_url, rs.stop_order,
          tt.arrival_time, tt.departure_time
    FROM route_stops rs
    JOIN stops s ON s.id = rs.stop_id
    LEFT JOIN trip_timetables tt ON tt.trip_id = ? AND tt.route_stop_id = rs.id
    WHERE rs.route_id = ?
    ORDER BY rs.stop_order`,
    [trip.id, direction.id],
  );
  const origin = stopSummary(stops[0]);
  const destination = stopSummary(stops[stops.length - 1]);
  const tripDeparture = apiTime(trip.departure_time);
  res.status(200).json({
    id: trip.id,
    line: { id: trip.line_id, number: trip.number, name: trip.name, type: trip.type, color: trip.color },
    direction: trip.direction,
    origin,
    destination,
    departure_time: tripDeparture.time,
    departure_day_offset: tripDeparture.dayOffset,
    wheelchair_accessible: Boolean(trip.wheelchair_accessible),
    service_notices: [],
    stops: stops.map((stop) => ({
      stop_order: Number(stop.stop_order ?? 1),
      stop: { 
        id: Number(stop.id), 
        name: String(stop.name), 
        image_url: stop.image_url ?? null 
      },
      ...defaultStopServiceInfo,
      arrival_time: apiTime(stop.arrival_time || "00:00").time,
      arrival_day_offset: apiTime(stop.arrival_time || "00:00").dayOffset,
      departure_time: apiTime(stop.departure_time || "00:00").time,
      departure_day_offset: apiTime(stop.departure_time || "00:00").dayOffset,
    })),
  });
});

app.post("/api/v1/lines", requireAdminApiKey, async (req, res) => {
  const data = parseLine(req.body);
  if (!data) {
    res.status(400).json({ error: "Invalid request data" });
    return;
  }
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO transit_lines (number, name, type, color) VALUES (?, ?, ?, ?)",
    [data.number, data.name, data.type, data.color],
  );
  res.status(201).json({ id: result.insertId, ...data });
});

app.put("/api/v1/lines/:id", requireAdminApiKey, async (req, res) => {
  const id = parseStopId(String(req.params.id));
  const data = parseLine(req.body);
  if (id === null || !data) {
    res.status(400).json({ error: "Invalid request data" });
    return;
  }
  const [[existingLine]] = await db.execute<TransitLine[]>("SELECT id FROM transit_lines WHERE id = ?", [id]);
  if (!existingLine) {
    res.status(404).json({ error: "Line not found" });
    return;
  }
  await db.execute(
    "UPDATE transit_lines SET number = ?, name = ?, type = ?, color = ? WHERE id = ?",
    [data.number, data.name, data.type, data.color, id],
  );
  res.status(200).json({ id, ...data });
});

app.delete("/api/v1/lines/:id", requireAdminApiKey, async (req, res) => {
  const id = parseStopId(String(req.params.id));
  if (id === null) {
    res.status(400).json({ error: "Invalid request data" });
    return;
  }
  const [result] = await db.execute<ResultSetHeader>("DELETE FROM transit_lines WHERE id = ?", [id]);
  if (result.affectedRows === 0) {
    res.status(404).json({ error: "Line not found" });
    return;
  }
  res.status(204).send();
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

app.get("/api/v1/stops/:id/lines", async (req, res) => {
  const id = parseStopId(String(req.params.id));
  if (id === null) {
    res.status(400).json({ error: "Invalid stop ID" });
    return;
  }
  const [[stop]] = await db.execute<Stop[]>("SELECT id FROM stops WHERE id = ?", [id]);
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  const [lines] = await db.execute<TransitLine[]>(
    `SELECT DISTINCT tl.id, tl.number, tl.name, tl.type, tl.color
     FROM route_stops rs
     JOIN routes r ON r.id = rs.route_id
     JOIN transit_lines tl ON tl.id = r.line_id
     WHERE rs.stop_id = ?
     ORDER BY tl.number`,
    [id],
  );
  res.status(200).json(lines);
});

app.get("/api/v1/stops/:stopId/departures", async (req, res) => {
  if (!validateServiceDate(req, res)) return;
  const stopId = parseStopId(String(req.params.stopId));
  if (stopId === null) {
    res.status(400).json({ error: "Invalid stop ID" });
    return;
  }
  const [[stop]] = await db.execute<Stop[]>("SELECT id FROM stops WHERE id = ?", [stopId]);
  if (!stop) {
    res.status(404).json({ error: "Stop not found" });
    return;
  }
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT lt.id AS trip_id, r.direction, lt.departure_time AS trip_departure,
            tt.arrival_time, tt.departure_time,
            tl.id AS line_id, tl.number, tl.name, tl.type, tl.color,
            destination.id AS destination_id, destination.name AS destination_name,
            destination.image_url AS destination_image_url
     FROM trip_timetables tt
     JOIN line_trips lt ON lt.id = tt.trip_id
     JOIN routes r ON r.id = lt.route_id
     JOIN transit_lines tl ON tl.id = r.line_id
     JOIN route_stops current_rs ON current_rs.id = tt.route_stop_id
     JOIN route_stops last_rs ON last_rs.route_id = r.id
       AND last_rs.stop_order = (SELECT MAX(last_order.stop_order) FROM route_stops last_order WHERE last_order.route_id = r.id)
     JOIN stops destination ON destination.id = last_rs.stop_id
     WHERE current_rs.stop_id = ?
     ORDER BY tt.departure_time, lt.id`,
    [stopId],
  );
  res.status(200).json(rows.map((row) => {
    const arrival = apiTime(row.arrival_time);
    const departure = apiTime(row.departure_time);
    return {
      trip_id: row.trip_id,
      line: { id: row.line_id, number: row.number, name: row.name, type: row.type, color: row.color },
      direction: row.direction,
      destination: { id: row.destination_id, name: row.destination_name, image_url: row.destination_image_url },
      ...defaultStopServiceInfo,
      arrival_time: arrival.time,
      arrival_day_offset: arrival.dayOffset,
      departure_time: departure.time,
      departure_day_offset: departure.dayOffset,
    };
  }));
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
