import { getConversations } from "./actions";
import InboxClient from "./inbox-client";
import { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Inbox | RecklessBear Admin",
};

export default async function InboxPage() {
  const conversations = await getConversations();

  return (
    <div className="space-y-6">
      <PageHeader title="Inbox" subtitle="WhatsApp integration" />
      <InboxClient initialConversations={conversations} />
    </div>
  );
}
