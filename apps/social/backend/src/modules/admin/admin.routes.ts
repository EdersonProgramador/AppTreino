import { Router } from "express";
import { prisma } from "../../config";
import { requireAdmin, validate, verifyToken } from "../../middleware";
import { adminReportActionSchema, fail, withUserImage } from "../../shared";

const admin = Router();

admin.use(verifyToken, requireAdmin);

admin.get("/reports", async (_request, response) => {
  try {
    const rows = await prisma.report.findMany({
      orderBy: { id: "desc" },
      take: 80,
      include: {
        reporter: { select: { id: true, username: true, image_url: true } },
        post: { select: { id: true, content: true, hidden: true, fk_user_id: true } }
      }
    });

    return response.json({
      success: true,
      reports: rows.map(row => ({
        id: row.id,
        target_type: row.target_type,
        reason: row.reason,
        status: row.status,
        created_on: row.created_on,
        target_user_id: row.target_user_id,
        post: row.post,
        reporter: {
          id: row.reporter.id,
          username: row.reporter.username,
          image_url: withUserImage(row.reporter.image_url)
        }
      }))
    });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao listar denúncias.");
  }
});

admin.post("/reports/:id", validate(adminReportActionSchema), async (request, response) => {
  try {
    const id = Number(request.params.id);
    const action = request.body.action as "dismiss" | "hide_post" | "suspend_user";
    const report = await prisma.report.findUnique({ where: { id } });

    if (!report) {
      return fail(response, 404, "Denúncia não encontrada.");
    }

    if (action === "hide_post") {
      if (!report.post_id) {
        return fail(response, 400, "Esta denúncia não é de uma publicação.");
      }
      await prisma.post.update({
        where: { id: report.post_id },
        data: { hidden: true }
      });
    }

    if (action === "suspend_user") {
      const targetId = report.target_user_id
        || (report.post_id
          ? (await prisma.post.findUnique({ where: { id: report.post_id }, select: { fk_user_id: true } }))?.fk_user_id
          : null);

      if (!targetId) {
        return fail(response, 400, "Não há conta para suspender nesta denúncia.");
      }

      await prisma.user.update({
        where: { id: targetId },
        data: { suspended_at: new Date() }
      });
    }

    await prisma.report.update({
      where: { id },
      data: { status: action === "dismiss" ? "dismissed" : "actioned" }
    });

    return response.json({ success: true });
  } catch (e) {
    console.log("----| Error |-----: ", e);
    return fail(response, 500, "Erro ao moderar denúncia.");
  }
});

export { admin };
