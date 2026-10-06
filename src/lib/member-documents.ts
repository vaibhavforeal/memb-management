import { db } from "./db";
import { assertActive, type TenantContext } from "./context";
import { readMemberQr } from "./member-qr";
import { cardTerm } from "./member-document-format";

function imageData(content?: Uint8Array | null) {
  return content
    ? `data:image/webp;base64,${Buffer.from(content).toString("base64")}`
    : null;
}

export async function readMemberBill(ctx: TenantContext, chargeId: string) {
  await assertActive(ctx);
  const bill = await db.charge.findFirst({
    where: { id: chargeId, businessId: ctx.businessId },
    include: {
      business: { include: { logo: true } },
      member: { include: { contact: true, photo: true } },
      membership: true,
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!bill) return null;
  return {
    ...bill,
    business: {
      name: bill.business.name,
      phone: bill.business.phone,
      address: bill.business.address || bill.business.city,
      logo: imageData(bill.business.logo?.content),
    },
    member: {
      name: bill.member.name,
      code: bill.member.code,
      phone: bill.member.contact.phone,
      joined: bill.member.createdAt,
      photo: imageData(bill.member.photo?.content),
    },
  };
}
export type MemberBill = NonNullable<
  Awaited<ReturnType<typeof readMemberBill>>
>;

export async function readMembershipCard(ctx: TenantContext, memberId: string) {
  const qr = await readMemberQr(ctx, memberId);
  if (!qr) return null;
  const member = await db.member.findFirst({
    where: { id: memberId, businessId: ctx.businessId },
    include: {
      contact: true,
      photo: true,
      memberships: true,
      business: { include: { logo: true } },
    },
  });
  if (!member) return null;
  return {
    name: member.name,
    code: member.code,
    phone: member.contact.phone,
    joined: member.createdAt,
    photo: imageData(member.photo?.content),
    qr: qr.image,
    ...cardTerm(member.memberships, member.archived),
    business: {
      name: member.business.name,
      phone: member.business.phone,
      address: member.business.address || member.business.city,
      logo: imageData(member.business.logo?.content),
    },
  };
}
export type MembershipCard = NonNullable<
  Awaited<ReturnType<typeof readMembershipCard>>
>;
