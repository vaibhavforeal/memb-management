import { PageHeading } from "@/components/page-heading";
import { MemberForm } from "@/components/member-form";
import { Card } from "@/components/ui/card";
import { getContext } from "@/lib/context";
export default async function NewMemberPage() {
  await getContext();
  return (
    <>
      <PageHeading title="New member" />
      <Card className="max-w-3xl p-4">
        <MemberForm />
      </Card>
    </>
  );
}
