import { activateSystemModules } from "../src/modules/commerce.utils.js";
import { prisma } from "../src/prisma.js";

await activateSystemModules();
const rows = await prisma.systemSetting.findMany({
  where: {
    key: {
      in: [
        "module_products",
        "module_purchases",
        "module_qr",
        "module_cards",
        "module_contact",
        "module_ratings",
        "module_favorites",
        "module_ai",
        "qr_checkin_enabled"
      ]
    }
  },
  orderBy: { key: "asc" }
});
for (const row of rows) {
  console.log(`${row.key}=${row.value}`);
}
await prisma.$disconnect();
