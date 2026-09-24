import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Demo maktab va foydalanuvchi. Instagram/Ads mock ma'lumotlari keyingi bosqichlarda qo'shiladi.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const DEMO_EMAIL = 'demo@durbin.uz';
const DEMO_PASSWORD = 'demo12345';

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: 'Demo Menejer', passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10) },
  });

  const existing = await prisma.membership.findFirst({ where: { userId: user.id } });
  if (!existing) {
    await prisma.school.create({
      data: { name: 'Demo maktab', memberships: { create: { userId: user.id, role: 'OWNER' } } },
    });
  }

  console.log(`Seed tayyor: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

await main().finally(() => prisma.$disconnect());
