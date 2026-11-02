import { faker } from "@faker-js/faker";
import { expect, test } from "vitest";
import z from "zod";

const baseUrl = process.env.TARGET_URL!.replace(/\/$/, "");

// A date before the transport updates take effect. It keeps the expected
// timetables stable no matter which day the automatic tests run on.
const BASELINE_DATE = "2026-09-18";

const DirectionSchema = z.enum(["outbound", "inbound"]);
const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DayOffsetSchema = z.number().int().min(0);

const ErrorSchema = z.object({
  error: z.string(),
});

const ServiceNoticeSchema = z.object({
  code: z.enum([
    "service_terminates_early",
    "stop_not_served",
    "diversion",
    "request_stop",
    "display_unavailable",
    "limited_wheelchair_access",
    "temporary_platform",
    "night_service",
  ]),
  message: z.string(),
});

const LineSchema = z.object({
  id: z.number().int().positive(),
  number: z.string().min(1),
  name: z.string(),
  type: z.string(),
  color: z.string(),
});

const StopSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  image_url: z.union([z.string(), z.null()]),
  wheelchair_accessible: z.boolean(),
  has_shelter: z.boolean(),
  has_ticket_machine: z.boolean(),
});

const StopSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  image_url: z.union([z.string(), z.null()]),
});

const PlatformSchema = z
  .object({
    name: z.string(),
    is_temporary: z.boolean(),
    location_note: z.string().nullable().optional(),
  })
  .nullable();

const TripSummarySchema = z.object({
  id: z.number().int().positive(),
  line: LineSchema,
  direction: DirectionSchema,
  origin: StopSummarySchema,
  destination: StopSummarySchema,
  departure_time: TimeSchema,
  departure_day_offset: DayOffsetSchema,
  wheelchair_accessible: z.boolean(),
  service_notices: z.array(ServiceNoticeSchema),
});

const TripStopTimeSchema = z.object({
  stop_order: z.number().int().positive(),
  stop: StopSummarySchema,
  arrival_time: TimeSchema,
  arrival_day_offset: DayOffsetSchema,
  departure_time: TimeSchema,
  departure_day_offset: DayOffsetSchema,
  platform: PlatformSchema,
  boarding_type: z.enum(["regular", "request_stop", "not_available"]),
  alighting_type: z.enum(["regular", "notify_driver", "not_available"]),
  service_notices: z.array(ServiceNoticeSchema),
});

const TripDetailSchema = TripSummarySchema.extend({
  stops: z.array(TripStopTimeSchema).min(1),
});

const DepartureSchema = z.object({
  trip_id: z.number().int().positive(),
  line: LineSchema,
  direction: DirectionSchema,
  destination: StopSummarySchema,
  arrival_time: TimeSchema,
  arrival_day_offset: DayOffsetSchema,
  departure_time: TimeSchema,
  departure_day_offset: DayOffsetSchema,
  platform: PlatformSchema,
  boarding_type: z.enum(["regular", "request_stop", "not_available"]),
  alighting_type: z.enum(["regular", "notify_driver", "not_available"]),
  wheelchair_accessible: z.boolean(),
  service_notices: z.array(ServiceNoticeSchema),
});

function apiUrl(path: string, query: Record<string, string> = {}): string {
  const url = new URL(`${baseUrl}${path}`);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertSchema<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  label: string,
): z.infer<T> {
  const parsed = schema.safeParse(data);
  expect(
    parsed.success,
    `${label}: ${JSON.stringify(parsed.error?.format())}`,
  ).toBe(true);
  return parsed.data!;
}

function minutesSinceServiceDayStart(time: string, dayOffset: number): number {
  const [hours, minutes] = time.split(":").map(Number);
  return dayOffset * 24 * 60 + hours * 60 + minutes;
}

async function getLines() {
  const res = await fetch(apiUrl("/api/v1/lines"));
  expect(res.status, "GET /api/v1/lines must return 200").toBe(200);
  return assertSchema(z.array(LineSchema), await res.json(), "line list");
}

async function getStops() {
  const res = await fetch(apiUrl("/api/v1/stops"));
  expect(res.status, "GET /api/v1/stops must return 200").toBe(200);
  return assertSchema(z.array(StopSchema), await res.json(), "stop list");
}

async function getLineByNumber(number: string) {
  const line = (await getLines()).find((item) => item.number === number);
  expect(line, `seed must contain line ${number}`).toBeDefined();
  return line!;
}

async function getStopByName(name: string) {
  const stop = (await getStops()).find((item) => item.name === name);
  expect(stop, `seed must contain stop ${name}`).toBeDefined();
  return stop!;
}

async function getTrips(lineId: number, serviceDate = BASELINE_DATE) {
  const res = await fetch(
    apiUrl(`/api/v1/lines/${lineId}/trips`, { service_date: serviceDate }),
  );
  expect(res.status, "line trip list must return 200").toBe(200);
  return assertSchema(
    z.array(TripSummarySchema),
    await res.json(),
    "trip list",
  );
}

async function getTripDetail(tripId: number, serviceDate = BASELINE_DATE) {
  const res = await fetch(
    apiUrl(`/api/v1/trips/${tripId}`, { service_date: serviceDate }),
  );
  expect(res.status, "trip detail must return 200").toBe(200);
  return assertSchema(TripDetailSchema, await res.json(), "trip detail");
}

test("52 Line exposes its trips according to the API contract", async () => {
  const lineB = await getLineByNumber("B");
  const trips = await getTrips(lineB.id);

  expect(trips.length, "line B must have at least one trip").toBeGreaterThan(0);
  expect(
    trips.every((trip) => trip.line.id === lineB.id),
    "the list may only contain trips of the requested line",
  ).toBe(true);

  const ids = trips.map((trip) => trip.id);
  expect(new Set(ids).size, "trip ids must be unique").toBe(ids.length);
});

test("53 Trip detail keeps the route, stop order and times", async () => {
  const lineB = await getLineByNumber("B");
  const trip = (await getTrips(lineB.id)).find(
    (item) =>
      item.origin.name === "Hopper Hall" &&
      item.destination.name === "Campus Gate" &&
      item.departure_time === "07:00",
  );
  expect(trip, "seed must contain the morning B trip from Hopper Hall").toBeDefined();

  const detail = await getTripDetail(trip!.id);
  expect(detail.id).toBe(trip!.id);
  expect(detail.line.id).toBe(lineB.id);
  expect(detail.stops.map((item) => item.stop.name)).toEqual([
    "Hopper Hall",
    "Ada Exchange",
    "Compiler Court",
    "Kernel Hub",
    "Syntax Square",
    "Lambda Lane",
    "Campus Gate",
  ]);
  expect(detail.stops.map((item) => item.stop_order)).toEqual([
    1, 2, 3, 4, 5, 6, 7,
  ]);

  const stopIds = detail.stops.map((item) => item.stop.id);
  expect(
    new Set(stopIds).size,
    "a stop may appear on a trip's route only once",
  ).toBe(stopIds.length);

  for (let index = 0; index < detail.stops.length; index += 1) {
    const current = detail.stops[index];
    const arrival = minutesSinceServiceDayStart(
      current.arrival_time,
      current.arrival_day_offset,
    );
    const departure = minutesSinceServiceDayStart(
      current.departure_time,
      current.departure_day_offset,
    );

    expect(
      arrival,
      `${current.stop.name}: arrival must not be after departure`,
    ).toBeLessThanOrEqual(departure);

    if (index > 0) {
      const previous = detail.stops[index - 1];
      const previousDeparture = minutesSinceServiceDayStart(
        previous.departure_time,
        previous.departure_day_offset,
      );
      expect(
        arrival,
        `${current.stop.name}: times along the route must be chronological`,
      ).toBeGreaterThanOrEqual(previousDeparture);
    }
  }
});

test("54 Stop departures are sorted by departure time", async () => {
  const syntaxSquare = await getStopByName("Syntax Square");
  const res = await fetch(
    apiUrl(`/api/v1/stops/${syntaxSquare.id}/departures`, {
      service_date: BASELINE_DATE,
    }),
  );
  expect(res.status, "stop departures must return 200").toBe(200);

  const departures = assertSchema(
    z.array(DepartureSchema),
    await res.json(),
    "stop departures",
  );
  expect(departures.length, "the stop must have at least one departure").toBeGreaterThan(0);

  const departureMoments = departures.map((item) =>
    minutesSinceServiceDayStart(item.departure_time, item.departure_day_offset),
  );
  expect(
    departureMoments,
    "departures must be sorted ascending by departure, not by arrival",
  ).toEqual([...departureMoments].sort((a, b) => a - b));

  const toHopperHall = departures.find(
    (item) =>
      item.line.number === "B" &&
      item.destination.name === "Hopper Hall" &&
      item.departure_time === "20:14",
  );
  const toCampusGate = departures.find(
    (item) =>
      item.line.number === "B" &&
      item.destination.name === "Campus Gate" &&
      item.departure_time === "20:15",
  );
  expect(toHopperHall, "a B departure at 20:14 to Hopper Hall must exist").toBeDefined();
  expect(toCampusGate, "a B departure at 20:15 to Campus Gate must exist").toBeDefined();
  expect(toCampusGate!.arrival_time).toBe("20:13");
  expect(
    departures.indexOf(toHopperHall!),
    "the 20:14 departure must come before the trip that arrives at 20:13 but departs at 20:15",
  ).toBeLessThan(departures.indexOf(toCampusGate!));
});

test("55 Timetable handles a trip past midnight correctly", async () => {
  const lineC = await getLineByNumber("C");
  const nightTrip = (await getTrips(lineC.id)).find(
    (item) =>
      item.origin.name === "Edison East" &&
      item.destination.name === "Quantum Commons" &&
      item.departure_time === "23:52",
  );
  expect(nightTrip, "seed must contain the night C trip at 23:52").toBeDefined();

  const detail = await getTripDetail(nightTrip!.id);
  const lastStop = detail.stops.at(-1)!;
  expect(lastStop.stop.name).toBe("Quantum Commons");
  expect(lastStop.arrival_time).toBe("00:14");
  expect(lastStop.arrival_day_offset).toBe(1);
  expect(lastStop.departure_time).toBe("00:14");
  expect(lastStop.departure_day_offset).toBe(1);
});

test("56 Invalid identifiers and parameters return an error response", async () => {
  const invalidId = faker.number.int({ min: 7_000_000, max: 9_000_000 });
  const lineB = await getLineByNumber("B");
  const existingTrip = (await getTrips(lineB.id))[0];

  const invalidLineRes = await fetch(
    apiUrl("/api/v1/lines/-1/trips", { service_date: BASELINE_DATE }),
  );
  expect(invalidLineRes.status, "a negative line id must return 400").toBe(400);
  assertSchema(ErrorSchema, await invalidLineRes.json(), "invalid line error");

  const unknownTripRes = await fetch(
    apiUrl(`/api/v1/trips/${invalidId}`, { service_date: BASELINE_DATE }),
  );
  expect(unknownTripRes.status, "a non-existent trip must return 404").toBe(404);
  assertSchema(ErrorSchema, await unknownTripRes.json(), "non-existent trip error");

  const invalidDateRes = await fetch(
    apiUrl(`/api/v1/trips/${existingTrip.id}`, {
      service_date: faker.string.alphanumeric(12),
    }),
  );
  expect(invalidDateRes.status, "an invalid service_date must return 400").toBe(400);
  assertSchema(ErrorSchema, await invalidDateRes.json(), "invalid date error");
});