import 'dotenv/config';
import { db } from "./src/db";
import { categories } from "./src/db/schema";
import { and, eq, inArray } from "drizzle-orm";

async function main() {
  await db
    .update(categories)
    .set({ is_active: true })
    .where(
      and(
        eq(categories.user_id, '321d6292-f86d-4807-96fa-df1dc5e130ac'),
        inArray(categories.name, ['Saving', 'Investment'])
      )
    );
  console.log("Updated categories");

  const rows = await db.select({ name: categories.name, group_name: categories.group_name, is_active: categories.is_active })
    .from(categories)
    .where(
      and(
        eq(categories.user_id, '321d6292-f86d-4807-96fa-df1dc5e130ac'),
        inArray(categories.name, ['Saving', 'Investment'])
      )
    );
  console.log("Categories state:", rows);
  process.exit(0);
}

main().catch(console.error);
