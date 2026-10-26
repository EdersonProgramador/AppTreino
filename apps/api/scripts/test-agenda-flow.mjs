import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import jwtPlugin from "@fastify/jwt";
import { PrismaClient } from "@prisma/client";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, "apps/api/.env") });

const prisma = new PrismaClient();
const apiBase = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3333").replace(/\/$/, "");
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error("JWT_SECRET missing");
  process.exit(1);
}

async function signUser(user) {
  const app = Fastify({ logger: false });
  await app.register(jwtPlugin, { secret, sign: { expiresIn: "1h" } });
  const token = app.jwt.sign({
    id: user.id,
    name: user.name,
    email: user.email ?? user.phone ?? "",
    role: user.role,
    phone: user.phone ?? null,
    provider: user.provider ?? "EMAIL"
  });
  await app.close();
  return token;
}

async function api(method, path, token, body) {
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return json;
}

function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  console.log("API:", apiBase);

  const health = await api("GET", "/health");
  console.log("health:", health.status, health.database);

  const coach =
    (await prisma.user.findFirst({
      where: { role: "ADMIN", status: "ACTIVE", deletedAt: null },
      orderBy: { createdAt: "asc" }
    })) ??
    (await prisma.user.findFirst({
      where: { organizationMembers: { some: { role: "COACH", status: "ACTIVE" } }, status: "ACTIVE", deletedAt: null }
    }));

  if (!coach) {
    throw new Error("Nenhum coach/admin encontrado para publicar horário.");
  }

  const org = await prisma.organization.findFirst({
    where: { deletedAt: null, status: "ACTIVE" },
    include: { units: { where: { deletedAt: null }, take: 1 } },
    orderBy: { createdAt: "asc" }
  });
  if (!org?.units[0]) {
    throw new Error("Nenhuma organização/unidade ativa — cadastre uma org antes do teste.");
  }

  const athleteLink = await prisma.athleteOrganizationLink.findFirst({
    where: {
      organizationId: org.id,
      status: "ACTIVE",
      deletedAt: null,
      athlete: { role: "USER", status: "ACTIVE", deletedAt: null }
    },
    include: { athlete: true }
  });
  let athlete = athleteLink?.athlete ?? null;
  if (!athlete) {
    athlete = await prisma.user.findFirst({
      where: {
        role: "USER",
        status: "ACTIVE",
        deletedAt: null,
        memberships: { some: { status: "ACTIVE", deletedAt: null } }
      },
      orderBy: { createdAt: "asc" }
    });
    if (!athlete) {
      athlete = await prisma.user.findFirst({
        where: { role: "USER", status: "ACTIVE", deletedAt: null },
        orderBy: { createdAt: "asc" }
      });
    }
    if (!athlete) {
      throw new Error("Nenhum aluno USER no banco para testar reservas.");
    }
    await prisma.athleteOrganizationLink.upsert({
      where: {
        athleteId_organizationId_unitId: {
          athleteId: athlete.id,
          organizationId: org.id,
          unitId: org.units[0].id
        }
      },
      create: {
        athleteId: athlete.id,
        organizationId: org.id,
        unitId: org.units[0].id,
        status: "ACTIVE"
      },
      update: { status: "ACTIVE", deletedAt: null }
    });
    console.log("vínculo aluno-org criado para teste:", athlete.email ?? athlete.id);
  }

  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  const dateKey = localDateKey(start);
  const trainingType = `Teste agenda ${Date.now()}`;

  const coachToken = await signUser(coach);
  const created = await api("POST", "/org/agenda/slots", coachToken, {
    organizationId: org.id,
    unitId: org.units[0].id,
    coachId: coach.id,
    trainingType,
    locationName: `${org.name} · ${org.units[0].name}`,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    capacity: 15
  });
  const slotId = created.slot?.id;
  if (!slotId) throw new Error("Slot não retornado na criação.");
  console.log("slot criado:", slotId, trainingType);

  const athleteToken = await signUser(athlete);
  const list = await api("GET", `/user/agenda/slots?date=${dateKey}`, athleteToken);
  const found = (list.slots ?? []).find((s) => s.id === slotId);
  if (!found) {
    throw new Error(`Slot não listado para ${dateKey} (verifique vínculo do aluno com a org).`);
  }
  console.log("slot listado para aluno:", found.trainingType, found.bookingCount + "/" + found.capacity);

  const booked = await api("POST", "/user/agenda/bookings", athleteToken, { slotId });
  console.log("reserva:", booked.confirmation?.trainingType, booked.confirmation?.locationName);

  const listAfter = await api("GET", `/user/agenda/slots?date=${dateKey}`, athleteToken);
  const after = (listAfter.slots ?? []).find((s) => s.id === slotId);
  if (!after?.booked) throw new Error("Reserva não refletiu na listagem.");
  console.log("OK — booked=true, bookingCount=", after.bookingCount);

  await api("DELETE", `/user/agenda/bookings/${after.bookingId}`, athleteToken);
  console.log("cancelamento OK");

  await api("DELETE", `/org/agenda/slots/${slotId}`, coachToken);
  console.log("cleanup slot OK");

  console.log("\nFluxo agenda validado ponta a ponta.");
}

main()
  .catch((err) => {
    console.error("\nFalha:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
