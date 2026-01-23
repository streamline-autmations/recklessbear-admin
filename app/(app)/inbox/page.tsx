import { getConversations } from "./actions";
import InboxClient from "./inbox-client";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inbox | RecklessBear Admin",
};

export default async function InboxPage() {
  const conversations = await getConversations();

  return (
    <div className="p-4 md:p-6 h-full">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
        <p className="text-muted-foreground">WhatsApp integration (Beta)</p>
      </div>
      <InboxClient initialConversations={conversations} />
    </div>
  );
}
