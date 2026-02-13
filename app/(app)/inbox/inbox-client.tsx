"use client";

import { useEffect, useRef, useState } from "react";
import { WhatsAppConversation, WhatsAppMessage } from "@/types/inbox";
import { getMessages, markConversationRead, sendMessageAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Search, Send, ArrowLeft, Phone, User, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface InboxClientProps {
  initialConversations: WhatsAppConversation[];
}

export default function InboxClient({ initialConversations }: InboxClientProps) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const conversationsRef = useRef<WhatsAppConversation[]>(initialConversations);

  const selectedConversation = conversations.find(c => c.id === selectedId);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedId) {
      setIsLoadingMessages(true);
      getMessages(selectedId)
        .then((data) => {
          setMessages(data);
          setIsLoadingMessages(false);
        })
        .catch((err) => {
          console.error(err);
          setIsLoadingMessages(false);
        });

      const hasUnread = (conversationsRef.current.find((c) => c.id === selectedId)?.unread_count || 0) > 0;
      if (hasUnread) {
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
        );
        void markConversationRead(selectedId);
      }

      if (window.innerWidth < 768) {
        setShowChatOnMobile(true);
      }
    }
  }, [selectedId]);

  const filteredConversations = conversations.filter((c) => {
    const term = searchQuery.toLowerCase();
    return (
      c.phone.toLowerCase().includes(term) ||
      (c.custom_display_name || "").toLowerCase().includes(term) ||
      (c.display_name || "").toLowerCase().includes(term) ||
      (c.lead?.name || "").toLowerCase().includes(term) ||
      (c.lead?.organization || "").toLowerCase().includes(term)
    );
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !newMessage.trim() || isSendingRef.current) return;

    const createUuidV4 = () => {
      const cryptoObj = globalThis.crypto;
      if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
      const bytes = new Uint8Array(16);
      cryptoObj?.getRandomValues?.(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };

    const messageId = createUuidV4();
    const tempMessage: WhatsAppMessage = {
      id: messageId,
      conversation_id: selectedId,
      direction: "outbound",
      text: newMessage,
      status: "sent",
      created_at: new Date().toISOString(),
      created_by: "me", // Placeholder
    };

    // Optimistic update
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage("");
    setIsSending(true);
    isSendingRef.current = true;

    try {
      const result = await sendMessageAction(selectedId, messageId, tempMessage.text);

      if (result && "error" in result) {
        toast.error("Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } else {
        toast.success("Message sent");
      }
    } finally {
      setIsSending(false);
      isSendingRef.current = false;
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(d);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-ZA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(d);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-[#d1d7db] bg-white shadow-sm text-[#111b21]">
      <div
        className={`w-full md:w-[380px] border-r border-[#d1d7db] flex flex-col ${
          showChatOnMobile ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="px-4 py-3 border-b border-[#d1d7db] bg-[#f0f2f5]">
          <div className="flex items-center justify-between">
            <div className="font-semibold">RecklessBear WhatsApp</div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-[#54656f] hover:text-[#111b21]">
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-[#54656f] hover:text-[#111b21]">
                <User className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#667781]" />
            <Input
              placeholder="Search or start new chat"
              className="pl-9 rounded-full bg-white border-[#d1d7db] focus-visible:ring-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-[#667781]">No chats yet</div>
          ) : (
            filteredConversations.map((conv) => (
              (() => {
                const displayName = conv.custom_display_name || conv.display_name || conv.lead?.name || conv.phone;
                const preview = conv.last_message_preview || conv.lead?.organization || "";
                return (
              <div
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`px-4 py-3 border-b border-[#e9edef] cursor-pointer transition-colors ${
                  selectedId === conv.id
                    ? "bg-[#e9edef] border-l-4 border-l-[#00a884]"
                    : "hover:bg-[#f5f6f6] border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="font-semibold truncate">{displayName}</div>
                  <div className="text-xs text-[#667781] whitespace-nowrap">
                    {formatDate(conv.last_message_at)}
                  </div>
                </div>
                <div className="flex justify-between items-center gap-3 mt-0.5">
                  <div className="text-sm text-[#667781] truncate w-full">
                    {preview || conv.phone}
                  </div>
                  {conv.unread_count > 0 && (
                    <Badge
                      variant="destructive"
                      className="rounded-full h-5 min-w-5 flex items-center justify-center px-1 text-[10px] bg-[#25d366] text-white hover:bg-[#25d366]"
                    >
                      {conv.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
                );
              })()
            ))
          )}
        </div>
      </div>

      <div className={`flex-1 flex flex-col ${!showChatOnMobile ? "hidden md:flex" : "flex"}`}>
        {selectedConversation ? (
          <>
            {(() => {
              const displayName =
                selectedConversation.custom_display_name ||
                selectedConversation.display_name ||
                selectedConversation.lead?.name ||
                selectedConversation.phone;
              return (
            <div className="px-4 py-3 border-b border-[#d1d7db] flex items-center justify-between bg-[#f0f2f5]">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden h-9 w-9 text-[#54656f] hover:text-[#111b21]"
                  onClick={() => setShowChatOnMobile(false)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar>
                  <AvatarFallback>
                    {displayName.substring(0, 2).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {displayName}
                    {selectedConversation.lead && (
                      <Badge variant="outline" className="text-[10px] h-5 border-[#d1d7db] text-[#54656f]">
                        Lead
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-[#667781]">
                    {selectedConversation.phone}
                    {selectedConversation.lead?.organization ? ` • ${selectedConversation.lead.organization}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="text-[#54656f] hover:text-[#111b21]">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-[#54656f] hover:text-[#111b21]">
                  <User className="h-4 w-4" />
                </Button>
              </div>
            </div>
              );
            })()}

            <div className="flex-1 overflow-y-auto p-4 space-y-3 rb-wa-chat-bg">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[#667781]">
                  <p>No messages yet</p>
                  <p className="text-sm">Start the conversation below</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.direction === "outbound";
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[86%] md:max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
                          isMe
                            ? "bg-[#d9fdd3] text-[#111b21] rounded-tr-none"
                            : "bg-white text-[#111b21] border border-[#e9edef] rounded-tl-none"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        <div
                          className="text-[10px] mt-1 text-right text-[#667781]"
                        >
                          {formatTime(msg.created_at)}
                          {isMe && (
                            <span className={`ml-1 ${msg.status === "read" ? "text-[#53bdeb]" : ""}`}>
                              {msg.status === "delivered" || msg.status === "read" ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 py-3 border-t border-[#d1d7db] bg-[#f0f2f5]">
              <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message"
                  className="flex-1 min-h-[42px] max-h-[120px] resize-none rounded-full bg-white px-4 py-3 text-sm border border-[#d1d7db] focus-visible:ring-0 focus-visible:ring-offset-0"
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!newMessage.trim() || isSending}
                  className="mb-0.5 bg-[#00a884] hover:bg-[#029c7c] text-white"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#667781] rb-wa-chat-bg">
            <div className="bg-white/70 p-4 rounded-full mb-4 border border-[#e9edef] shadow-sm">
              <MessageSquare className="h-8 w-8 text-[#54656f]" />
            </div>
            <h3 className="font-semibold text-lg text-[#111b21]">RecklessBear WhatsApp</h3>
            <p>Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}
