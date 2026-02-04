"use client";

import { useEffect, useRef, useState } from "react";
import { WhatsAppConversation, WhatsAppMessage } from "@/types/inbox";
import { getMessages, sendMessageAction, updateCustomDisplayNameAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Search, Send, ArrowLeft, Phone, User, Pencil } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [customNameDraft, setCustomNameDraft] = useState("");
  const [isSavingCustomName, setIsSavingCustomName] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find(c => c.id === selectedId);

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

      if (window.innerWidth < 768) {
        setShowChatOnMobile(true);
      }
    }
  }, [selectedId]);

  const filteredConversations = conversations.filter((c) => {
    const term = searchQuery.toLowerCase();
    return (
      c.phone.toLowerCase().includes(term) ||
      (c.display_name || "").toLowerCase().includes(term) ||
      (c.custom_display_name || "").toLowerCase().includes(term) ||
      (c.last_message_preview || "").toLowerCase().includes(term) ||
      (c.lead?.name || "").toLowerCase().includes(term) ||
      (c.lead?.organization || "").toLowerCase().includes(term)
    );
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !newMessage.trim()) return;

    const tempId = `tmp_${Date.now()}`;
    const tempMessage: WhatsAppMessage = {
      id: tempId,
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

    const result = await sendMessageAction(selectedId, tempMessage.text, tempId);

    if (result && "error" in result) {
      toast.error(result.error || "Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } else {
      toast.success("Message sent");
    }
    setIsSending(false);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const getPhoneDigits = (phone: string) => {
    return String(phone || "").replace(/\D/g, "");
  };

  const formatPhoneForDisplay = (phone: string) => {
    const digits = getPhoneDigits(phone);
    if (digits.startsWith("27") && digits.length === 11) {
      const rest = digits.slice(2);
      return `+27 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
    }
    if (String(phone || "").trim().startsWith("+") && digits) return `+${digits}`;
    return String(phone || "").trim();
  };

  const getWhatsAppLink = (phone: string) => {
    const digits = getPhoneDigits(phone);
    return digits ? `https://wa.me/${digits}` : null;
  };

  const getConversationBaseTitle = (conv: WhatsAppConversation) => {
    return conv.lead?.name || conv.display_name || formatPhoneForDisplay(conv.phone);
  };

  const getConversationTitle = (conv: WhatsAppConversation) => {
    const base = getConversationBaseTitle(conv);
    const custom = String(conv.custom_display_name || "").trim();
    return custom ? `${base} (${custom})` : base;
  };

  const getInitials = (value: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "U";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts.length > 1 ? parts[1]?.[0] || "" : parts[0]?.[1] || "";
    return `${a}${b}`.toUpperCase() || "U";
  };

  const openEditName = () => {
    if (!selectedConversation) return;
    setCustomNameDraft(selectedConversation.custom_display_name || "");
    setIsEditNameOpen(true);
  };

  const saveCustomName = async () => {
    if (!selectedConversation) return;
    setIsSavingCustomName(true);
    const result = await updateCustomDisplayNameAction(selectedConversation.id, customNameDraft);
    if (result && "error" in result) {
      toast.error(result.error || "Failed to update name");
      setIsSavingCustomName(false);
      return;
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConversation.id
          ? { ...c, custom_display_name: (result as { custom_display_name: string | null }).custom_display_name }
          : c
      )
    );
    toast.success("Name updated");
    setIsSavingCustomName(false);
    setIsEditNameOpen(false);
  };

  const clearCustomName = async () => {
    if (!selectedConversation) return;
    setIsSavingCustomName(true);
    const result = await updateCustomDisplayNameAction(selectedConversation.id, null);
    if (result && "error" in result) {
      toast.error(result.error || "Failed to clear name");
      setIsSavingCustomName(false);
      return;
    }

    setConversations((prev) =>
      prev.map((c) => (c.id === selectedConversation.id ? { ...c, custom_display_name: null } : c))
    );
    toast.success("Custom name cleared");
    setIsSavingCustomName(false);
    setIsEditNameOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className={`w-full md:w-80 border-r flex flex-col ${showChatOnMobile ? "hidden md:flex" : "flex"}`}>
        <div className="p-4 border-b bg-muted/30">
          <div className="font-semibold text-lg">Conversations</div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No conversations found</div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedId === conv.id
                    ? "bg-muted border-l-4 border-l-primary"
                    : "border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="font-semibold truncate pr-2">{getConversationTitle(conv)}</div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(conv.last_message_at)}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground truncate w-full pr-2">
                    {conv.last_message_preview || conv.lead?.organization || formatPhoneForDisplay(conv.phone)}
                  </div>
                  {conv.unread_count > 0 && (
                    <Badge
                      variant="destructive"
                      className="rounded-full h-5 w-5 flex items-center justify-center p-0 text-[10px]"
                    >
                      {conv.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={`flex-1 flex flex-col ${!showChatOnMobile ? "hidden md:flex" : "flex"}`}>
        {selectedConversation ? (
          <>
            <div className="p-4 border-b flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setShowChatOnMobile(false)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar>
                  <AvatarFallback>
                    {getInitials(getConversationBaseTitle(selectedConversation))}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {getConversationTitle(selectedConversation)}
                    {selectedConversation.lead && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        Lead
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(() => {
                      const href = getWhatsAppLink(selectedConversation.phone);
                      const label = formatPhoneForDisplay(selectedConversation.phone);
                      return href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          {label}
                        </a>
                      ) : (
                        label
                      );
                    })()}
                    {selectedConversation.lead?.organization ? ` • ${selectedConversation.lead.organization}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon">
                  <User className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={openEditName}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/20">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p>No messages yet</p>
                  <p className="text-sm">Start the conversation below</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.direction === "outbound";
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] md:max-w-[60%] rounded-lg p-3 ${
                          isMe
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-card border rounded-tl-none shadow-sm"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        <div
                          className={`text-[10px] mt-1 text-right ${
                            isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}
                        >
                          {formatTime(msg.created_at)}
                          {isMe && (
                            <span className="ml-1">
                              {msg.status === "read"
                                ? "✓✓"
                                : msg.status === "delivered"
                                  ? "✓✓"
                                  : "✓"}
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

            <div className="p-4 border-t bg-background">
              <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="flex-1 min-h-[40px] max-h-[120px] resize-none py-3"
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!newMessage.trim() || isSending}
                  className="mb-0.5"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/10">
            <div className="bg-muted/30 p-4 rounded-full mb-4">
              <Send className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg">WhatsApp Inbox</h3>
            <p>Select a conversation to start messaging</p>
          </div>
        )}
      </div>

      <Dialog open={isEditNameOpen} onOpenChange={setIsEditNameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit custom display name</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-medium">Custom name</div>
            <Input
              value={customNameDraft}
              onChange={(e) => setCustomNameDraft(e.target.value)}
              placeholder="Type a custom name…"
            />
            {selectedConversation && (
              <div className="text-xs text-muted-foreground">
                Shows as: {getConversationBaseTitle(selectedConversation)}{" "}
                {customNameDraft.trim() ? `(${customNameDraft.trim()})` : ""}
              </div>
            )}
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button type="button" variant="outline" onClick={clearCustomName} disabled={isSavingCustomName}>
              Clear
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditNameOpen(false)}
                disabled={isSavingCustomName}
              >
                Cancel
              </Button>
              <Button type="button" onClick={saveCustomName} disabled={isSavingCustomName}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
