import { ActionForm } from "./action-form";
import { Input, Textarea } from "./ui/input";
import { MemberPhotoForm } from "./member-photo-form";
import { memberPhotoUrl } from "@/lib/member-photo-utils";
export function MemberForm({
  member,
}: {
  member?: {
    id: string;
    name: string;
    email: string | null;
    notes: string;
    photo?: { version: string } | null;
    contact: {
      phone: string;
    };
  };
}) {
  return (
    <>
      {member && (
        <MemberPhotoForm
          memberId={member.id}
          name={member.name}
          photoUrl={memberPhotoUrl(member.id, member.photo?.version)}
        />
      )}
      <ActionForm
        action="save-member"
        submit={member ? "Save member" : "Create member"}
      >
        <input type="hidden" name="memberId" value={member?.id ?? ""} />
        <div className="form-grid">
          <label className="field">
            Full name
            <Input
              name="name"
              required
              minLength={2}
              maxLength={100}
              defaultValue={member?.name}
              placeholder="e.g. Ananya Patel"
            />
          </label>
          <label className="field">
            Mobile number
            <Input
              name="phone"
              type="tel"
              required
              defaultValue={member?.contact.phone}
              placeholder="+91 98765 43210"
            />
          </label>
          <label className="field sm:col-span-2">
            Email address <span className="text-[10px]">Optional</span>
            <Input
              name="email"
              type="email"
              defaultValue={member?.email ?? ""}
              placeholder="member@example.com"
            />
          </label>
          <label className="field sm:col-span-2">
            Notes
            <Textarea
              name="notes"
              maxLength={2000}
              defaultValue={member?.notes}
              placeholder="Notes (optional)"
            />
          </label>
        </div>
      </ActionForm>
    </>
  );
}
