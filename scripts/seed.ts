import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import { addDays, atHourIST, termEnd, todayIST } from "../src/lib/domain";
import { encrypt } from "../src/lib/security";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    process.env.NODE_ENV === "production" ||
    process.env.SEED_DEMO !== "true" ||
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error(
      "Demo seeding is allowed only on an explicitly enabled local development database.",
    );
  if (await db.business.findUnique({ where: { slug: "demo-iron-republic" } })) {
    console.info("Demo workspace already exists; no changes made.");
    return;
  }
  const password = await hashPassword("MembrrDemo!2026");
  async function user(email: string, name: string, platformAdmin = false) {
    const id = randomUUID();
    return db.user.create({
      data: {
        id,
        name,
        email,
        emailVerified: true,
        platformAdmin,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: id,
            providerId: "credential",
            password,
          },
        },
      },
    });
  }
  const [owner, staff, admin] = await Promise.all([
    user("owner@membrr.local", "Arjun Mehta"),
    user("staff@membrr.local", "Priya Nair"),
    user("admin@membrr.local", "Platform Admin", true),
  ]);
  const b = await db.business.create({
    data: {
      name: "Iron Republic",
      slug: "demo-iron-republic",
      city: "Bengaluru",
      trialRequired: false,
      branches: { create: { name: "Indiranagar" } },
      access: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: staff.id, role: "STAFF" },
        ],
      },
    },
    include: { branches: true },
  });
  await db.business.create({
    data: {
      name: "Baseline Sports Arena",
      slug: "demo-baseline",
      city: "Pune",
      trialRequired: false,
      branches: { create: { name: "Main branch" } },
    },
  });
  const plans = await Promise.all(
    [
      { name: "Monthly Essential", months: 1, amountPaise: 250000 },
      { name: "Quarterly Plus", months: 3, amountPaise: 650000 },
      { name: "Annual Unlimited", months: 12, amountPaise: 2200000 },
    ].map((p) => db.plan.create({ data: { businessId: b.id, ...p } })),
  );
  const names = [
    "Rohan Sharma",
    "Ananya Patel",
    "Vikram Singh",
    "Sneha Reddy",
    "Aditya Menon",
    "Ishita Kapoor",
    "Karan Malhotra",
    "Diya Shah",
    "Rahul Verma",
    "Meera Iyer",
    "Arnav Joshi",
    "Nisha Rao",
    "Siddharth Das",
    "Pooja Nair",
    "Dev Sethi",
    "Tara Mehta",
    "Kabir Gupta",
    "Aisha Khan",
    "Neel Kulkarni",
    "Riya Desai",
    "Varun Bhat",
    "Sana Ali",
    "Aarav Jain",
    "Kavya Rao",
  ];
  const today = todayIST();
  for (let i = 0; i < names.length; i++) {
    const contact = await db.contact.create({
      data: {
        businessId: b.id,
        phone: `+91900000${String(i).padStart(4, "0")}`,
        serviceConsent: i % 7 !== 0,
        marketingConsent: i % 3 === 0,
        consentAt: new Date(),
        consentSource: "Synthetic demo consent; not a real member",
      },
    });
    const m = await db.member.create({
      data: {
        businessId: b.id,
        branchId: b.branches[0].id,
        contactId: contact.id,
        code: `CH-${String(1001 + i)}`,
        name: names[i],
        email: `${names[i].split(" ")[0].toLowerCase()}@example.com`,
        notes: "Sample member for local demonstration.",
        createdAt: addDays(today, -90 + i),
      },
    });
    const p = plans[i % 3];
    const startDate = addDays(today, -25 + (i % 5));
    const endDate =
      i < 5
        ? addDays(today, i + 1)
        : i > 19
          ? addDays(today, -i)
          : termEnd(startDate, p.months);
    const term = await db.membership.create({
      data: {
        businessId: b.id,
        branchId: b.branches[0].id,
        memberId: m.id,
        planId: p.id,
        planName: p.name,
        startDate: endDate < startDate ? addDays(endDate, -29) : startDate,
        endDate,
      },
    });
    const charge = await db.charge.create({
      data: {
        businessId: b.id,
        branchId: b.branches[0].id,
        memberId: m.id,
        membershipId: term.id,
        description: p.name,
        amountPaise: p.amountPaise,
        dueDate: i % 4 === 0 ? addDays(today, -1) : startDate,
      },
    });
    const amountPaise =
      i % 4 === 0 ? Math.floor(p.amountPaise / 2) : p.amountPaise;
    await db.payment.create({
      data: {
        businessId: b.id,
        branchId: b.branches[0].id,
        chargeId: charge.id,
        amountPaise,
        method: ["UPI", "CASH", "BANK"][i % 3],
        reference: `DEMO-${10000 + i}`,
        recordedBy: owner.id,
        idempotencyKey: `seed-${m.id}`,
        createdAt:
          i < 6
            ? new Date(atHourIST(today, 8).getTime() + i * 600000)
            : addDays(today, -(i * 7)),
      },
    });
    if (i < 9)
      await db.checkin.create({
        data: {
          businessId: b.id,
          branchId: b.branches[0].id,
          memberId: m.id,
          day: today,
          recordedBy: staff.id,
          createdAt: new Date(atHourIST(today, 7).getTime() + i * 1800000),
        },
      });
  }
  await db.whatsAppConnection.create({
    data: {
      businessId: b.id,
      phoneNumberId: `demo-${b.id}`,
      accountId: "demo",
      encryptedToken: encrypt("demo-never-use-to-send"),
      status: "DEMO",
      displayPhone: "+91 ••••• •••••",
      checkedAt: new Date(),
    },
  });
  await db.messageTemplate.createMany({
    data: [
      {
        businessId: b.id,
        name: "membership_renewal",
        category: "UTILITY",
        status: "APPROVED",
        body: "Hi {{1}}, your membership at {{2}} expires on {{3}}. Visit the front desk to renew. Reply STOP to opt out.",
        parameterKeys: ["name", "business", "expiry"],
        purpose: "RENEWAL",
      },
      {
        businessId: b.id,
        name: "membership_dues",
        category: "UTILITY",
        status: "APPROVED",
        body: "Hi {{1}}, you have {{2}} outstanding at {{3}}, due on {{4}}. Contact the front desk for assistance. Reply STOP to opt out.",
        parameterKeys: ["name", "amount", "business", "due"],
        purpose: "DUES",
      },
      {
        businessId: b.id,
        name: "community_update",
        category: "MARKETING",
        status: "APPROVED",
        body: "Hi {{1}}, stay connected with your community at {{2}}. Drop by the front desk for this week's club updates. Reply STOP to opt out.",
        parameterKeys: ["name", "business"],
        purpose: "ANNOUNCEMENT",
      },
    ],
  });
  await db.auditLog.create({
    data: {
      businessId: b.id,
      actorId: admin.id,
      action: "DEMO_SEEDED",
      detail: "Synthetic local data only",
    },
  });
  console.info(
    "Demo ready. Owner: owner@membrr.local | Staff: staff@membrr.local | Admin: admin@membrr.local\nLocal demo password: MembrrDemo!2026\nNever use these accounts in production.",
  );
}
main().finally(() => db.$disconnect());
