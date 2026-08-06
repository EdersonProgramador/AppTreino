import { prisma } from "../prisma.js";

export const TICKET_AUTO_CLOSE_HOURS = 24;
export const FINALIZE_PROMPT = "Há algo a mais em que podemos ajudar?";

export const ticketInclude = {
  user: true,
  assignedTo: true,
  messages: {
    orderBy: {
      createdAt: "asc"
    }
  }
} as const;

export async function autoCloseStaleTickets(prismaClient: typeof prisma, ids: string[]) {
  if (ids.length === 0) return;

  const cutoff = new Date(Date.now() - TICKET_AUTO_CLOSE_HOURS * 60 * 60 * 1000);

  const tickets = await prismaClient.supportTicket.findMany({
    where: {
      id: { in: ids },
      status: { in: ["OPEN", "IN_PROGRESS", "WAITING_STUDENT"] }
    },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  const toClose = tickets
    .filter((ticket) => {
      const last = ticket.messages[0];
      return Boolean(last && last.senderType === "ADMIN" && last.createdAt <= cutoff);
    })
    .map((ticket) => ticket.id);

  if (toClose.length > 0) {
    await prismaClient.supportTicket.updateMany({
      where: { id: { in: toClose } },
      data: { status: "CLOSED" }
    });
  }
}
