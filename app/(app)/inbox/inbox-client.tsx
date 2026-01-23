"use client";

import { useState, useEffect, useRef } from "react";
import { WhatsAppConversation, WhatsAppMessage } from "@/types/inbox";
import { getMessages, sendMessageAction } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Send, ArrowLeft, Phone, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface InboxClientProps {
  initialConversations: WhatsAppConversation[];
}

export default function InboxClient({ initialConversations }: InboxClientProps) {
  const [conversations] = useState<WhatsAppConversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  // Mobile view state
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConversation = conversations.find(c => c.id === selectedId);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load messages when conversation selected
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

  const filteredConversations = conversations.filter(c => {
    const term = searchQuery.toLowerCase();
    return (
      c.phone.includes(term) ||
      c.lead?.name?.toLowerCase().includes(term) ||
      c.lead?.organization?.toLowerCase().includes(term)
    );
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !newMessage.trim()) return;

    const tempId = Math.random().toString();
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

    const result = await sendMessageAction(selectedId, tempMessage.text);

    if (result && "error" in result) {
      toast.error("Failed to send message");
      // Revert optimistic update? Or just show error.
    } else {
      // Success - maybe refresh messages or let the real data come in later
      // For now we assume success
    }
    setIsSending(false);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-background border rounded-lg shadow-sm">
      {/* Sidebar - Conversation List */}
      <div className={`w-full md:w-80 lg:w-96 border-r flex flex-col ${showChatOnMobile ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search conversations..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No conversations found
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={`p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedId === conv.id ? "bg-muted border-l-4 border-l-primary" : "border-l-4 border-l-transparent"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="font-semibold truncate pr-2">
                    {conv.lead?.name || conv.phone}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(conv.last_message_at)}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground truncate w-full pr-2">
                    {conv.lead?.organization || conv.phone}
                  </div>
                  {conv.unread_count > 0 && (
                    <Badge variant="destructive" className="rounded-full h-5 w-5 flex items-center justify-center p-0 text-[10px]">
                      {conv.unread_count}
                    </Badge>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col ${!showChatOnMobile ? 'hidden md:flex' : 'flex'}`}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
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
                  <AvatarFallback>{selectedConversation.lead?.name?.substring(0, 2).toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold flex items-center gap-2">
                    {selectedConversation.lead?.name || selectedConversation.phone}
                    {selectedConversation.lead && (
                      <Badge variant="outline" className="text-[10px] h-5">Lead</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedConversation.phone} {selectedConversation.lead?.organization && `• ${selectedConversation.lead.organization}`}
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
              </div>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950/50">
              {isLoadingMessages ? (
                <div className="flex justify-center items-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] md:max-w-[60%] rounded-lg p-3 ${
                          isMe
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-white dark:bg-slate-800 border rounded-tl-none shadow-sm"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                        <div className={`text-[10px] mt-1 text-right ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {formatTime(msg.created_at)}
                          {isMe && (
                            <span className="ml-1">
                              {msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : "✓"}
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

            {/* Input Area */}
            <div className="p-4 border-t bg-background">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button type="submit" disabled={!newMessage.trim() || isSending}>
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
    </div>
  );
}
