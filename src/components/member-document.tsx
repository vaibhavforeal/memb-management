import type { ReactNode } from "react";
import type { Payment } from "@prisma/client";
import { dateLabel } from "@/lib/domain";
import {
  billTotals,
  documentMoney as money,
} from "@/lib/member-document-format";
import type { MemberBill, MembershipCard } from "@/lib/member-documents";

function IdentityImage({
  src,
  name,
  logo = false,
}: {
  src: string | null;
  name: string;
  logo?: boolean;
}) {
  return (
    <div className={logo ? "doc-logo" : "doc-portrait"}>
      {src ? (
        <img src={src} alt={logo ? `${name} logo` : `Photo of ${name}`} />
      ) : (
        <span aria-label={logo ? name : `Initials of ${name}`}>
          {name
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")}
        </span>
      )}
    </div>
  );
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="doc-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function BillDocument({
  bill,
  payment,
  reversal,
}: {
  bill: MemberBill;
  payment?: Payment;
  reversal?: Payment | null;
}) {
  const { business, member, membership } = bill;
  const totals = billTotals(bill);
  const reversed = !!payment?.reversalOfId || !!reversal;
  return (
    <article
      className="member-document bill-document"
      aria-label={payment ? "Payment receipt" : "Membership bill"}
    >
      <header className="doc-business">
        <div>
          <h2>{business.name}</h2>
          {business.phone && <p>{business.phone}</p>}
          <p>{business.address}</p>
        </div>
        <IdentityImage src={business.logo} name={business.name} logo />
      </header>
      <div className="bill-caption">
        <h1>
          {payment?.reversalOfId
            ? "Payment reversal"
            : payment
              ? "Payment receipt"
              : "Membership bill"}
        </h1>
        <p>{dateLabel(payment?.createdAt ?? bill.createdAt)}</p>
      </div>
      <p className="doc-reference">
        {payment ? "Receipt" : "Bill"} no.{" "}
        {(payment?.id ?? bill.id).toUpperCase()}
      </p>
      <section className="bill-member">
        <IdentityImage src={member.photo} name={member.name} />
        <div>
          <h2>{member.name}</h2>
          <p>Member ID: {member.code}</p>
          <p>{member.phone}</p>
          <p>Joined: {dateLabel(member.joined)}</p>
        </div>
      </section>
      <dl className="doc-rows bill-term">
        <Row label="Purchase date">{dateLabel(bill.createdAt)}</Row>
        <Row label="Plan name">{membership.planName}</Row>
        <Row label="Start date">{dateLabel(membership.startDate)}</Row>
        <Row label="Expiry date">{dateLabel(membership.endDate)}</Row>
        {!payment && (
          <Row label="Payment due date">{dateLabel(bill.dueDate)}</Row>
        )}
      </dl>
      {membership.cancelledAt && (
        <p className="doc-notice">
          Membership cancelled on {dateLabel(membership.cancelledAt)}.
        </p>
      )}
      <section aria-label="Charge breakdown" className="bill-finances">
        <dl className="doc-rows">
          {bill.baseAmountPaise !== null ? (
            <>
              <Row label="Membership fee">{money(bill.baseAmountPaise)}</Row>
              <Row label="Admission fee">{money(bill.admissionFeePaise)}</Row>
              <Row
                label={`Discount${bill.discountType === "PERCENT" ? ` (${bill.discountValue / 100}%)` : ""}`}
              >
                {bill.discountPaise > 0 ? "−" : ""}
                {money(bill.discountPaise)}
              </Row>
              {bill.discountReason && (
                <div className="doc-note">{bill.discountReason}</div>
              )}
              <Row
                label={bill.taxRateBps ? "Taxable amount" : "Amount before tax"}
              >
                {money(totals.taxable)}
              </Row>
              <Row
                label={`Tax (${bill.taxRateBps / 100}%${bill.taxInclusive ? ", included" : ""})`}
              >
                {money(bill.taxPaise)}
              </Row>
            </>
          ) : (
            <>
              <Row label="Membership charge">{money(bill.amountPaise)}</Row>
              <p className="doc-note">
                Fee and tax breakdown unavailable for this earlier charge.
              </p>
            </>
          )}
          {bill.voidedAt && (
            <>
              <Row label="Original total">{money(bill.amountPaise)}</Row>
              <Row label="Amount waived">−{money(bill.amountPaise)}</Row>
            </>
          )}
        </dl>
        <dl className="bill-total">
          <Row label="Final amount">{money(totals.payable)}</Row>
        </dl>
        <dl className="doc-rows">
          <Row label="Total paid">{money(totals.paid)}</Row>
          <Row label={totals.due < 0 ? "Credit balance" : "Balance due"}>
            {money(Math.abs(totals.due))}
          </Row>
        </dl>
        <p className={`bill-status ${totals.due > 0 ? "is-due" : ""}`}>
          {totals.status}
        </p>
      </section>
      {payment && (
        <section className="bill-payment" aria-label="This payment">
          <h2>
            {payment.reversalOfId ? "Reversal entry" : "This payment"}
            {reversed ? " · Reversed" : ""}
          </h2>
          <dl className="doc-rows">
            <Row
              label={
                payment.reversalOfId ? "Amount reversed" : "Amount recorded"
              }
            >
              {money(payment.amountPaise)}
            </Row>
            <Row label="Payment method">{payment.method}</Row>
            {payment.reference && (
              <Row label="Transaction reference">{payment.reference}</Row>
            )}
          </dl>
          {reversal && (
            <p className="doc-notice">
              This payment was reversed on {dateLabel(reversal.createdAt)}.
              Reason: {reversal.reversalReason}
            </p>
          )}
          {payment.reversalReason && (
            <p className="doc-notice">
              Correction reason: {payment.reversalReason}
            </p>
          )}
        </section>
      )}
      <footer className="bill-footer">
        <p>
          {payment ? "Payment acknowledgement." : "Membership bill."} Not a GST
          tax invoice.
        </p>
        <p>Payment totals and balance as of {dateLabel(new Date())}.</p>
      </footer>
    </article>
  );
}

export function MembershipCardDocument({ card }: { card: MembershipCard }) {
  return (
    <article
      className="member-document membership-card-document"
      aria-label="Membership card"
    >
      <header className="card-heading">
        <div className="card-brand">
          <IdentityImage
            src={card.business.logo}
            name={card.business.name}
            logo
          />
          <div>
            <h2>{card.business.name}</h2>
            <p>MEMBER CARD</p>
          </div>
        </div>
        <div className="card-id">
          <p>Member ID</p>
          <strong>{card.code}</strong>
        </div>
      </header>
      <section className="card-identity">
        <IdentityImage src={card.photo} name={card.name} />
        <div className="card-member">
          <h1>{card.name}</h1>
          <p>{card.phone}</p>
          <span>Joined: {dateLabel(card.joined)}</span>
        </div>
        <div className="card-qr">
          <img
            src={card.qr}
            alt={`Attendance QR for ${card.name}`}
            width={210}
            height={210}
          />
          <p>Show at reception</p>
        </div>
      </section>
      <section className="card-validity">
        <div>
          <p>Membership period</p>
          <h3>{card.term?.planName ?? "No membership assigned"}</h3>
        </div>
        <div className="card-dates">
          {card.term && (
            <p>
              {dateLabel(card.term.startDate)} – {dateLabel(card.term.endDate)}
            </p>
          )}
          <strong>{card.status}</strong>
        </div>
      </section>
      <footer className="card-footer">
        <p>
          {card.business.phone && (
            <>
              <strong>{card.business.phone}</strong> ·{" "}
            </>
          )}
          {card.business.address}
        </p>
        <span>Attendance verified at reception</span>
      </footer>
    </article>
  );
}
