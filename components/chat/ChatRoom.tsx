"use client";

import { useEffect, useState, useRef } from "react";
import { socket } from "@/lib/socket";
import {
    generateKeyPair,
    exportKey,
    importKey,
    encryptMessage,
    decryptMessage,
    generateSymKey,
    encryptSymMessage,
    decryptSymMessage,
    exportSymKey,
    importSymKey,
    encryptFile,
    decryptFile,
} from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, User, Users, Lock, Check, CheckCheck, Smile, Paperclip, FileIcon, Download, Image as ImageIcon, Settings, Phone, Mic, MicOff, UserX, X } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "next-themes";
import { useWebRTC } from "@/hooks/useWebRTC";
import CallInterface from "./CallInterface";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface Message {
    id: string;
    senderId: string;
    content: string;
    timestamp: number;
    status?: "sending" | "sent" | "delivered" | "read";
    type?: "text" | "file";
    file?: {
        id: string;
        name: string;
        size: number;
        mimeType: string;
        url?: string;
    };
    encryptedKey?: string;
    reactions?: Record<string, string[]>; // emoji -> [senderIds]
}

interface ChatRoomProps {
    roomId: string;
}

export default function ChatRoom({ roomId }: ChatRoomProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [participantCount, setParticipantCount] = useState(1);
    const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);

    // Advanced Controls State
    const [isCreator, setIsCreator] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordInput, setPasswordInput] = useState("");
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showParticipantsModal, setShowParticipantsModal] = useState(false);
    const [participants, setParticipants] = useState<{ socketId: string; userId: string; nickname?: string; isMuted?: boolean }[]>([]);
    const [newLimit, setNewLimit] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const searchParams = useSearchParams();
    const router = useRouter();
    const nickname = searchParams.get("nickname") || "Anonymous";
    const userLimit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;
    const { theme } = useTheme();
    const { localStream, remoteStreams, joinCall, leaveCall } = useWebRTC(roomId);

    const myKeys = useRef<{ public: CryptoKey; private: CryptoKey } | null>(null);
    const otherUsersKeys = useRef<Map<string, CryptoKey>>(new Map());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const init = async () => {
            let userId = sessionStorage.getItem("userId");
            if (!userId) {
                userId = crypto.randomUUID();
                sessionStorage.setItem("userId", userId);
            }

            const keys = await generateKeyPair();
            myKeys.current = { public: keys.publicKey, private: keys.privateKey };

            socket.auth = { userId };
            socket.connect();

            const storedPassword = sessionStorage.getItem("temp_room_password");
            const password = storedPassword || searchParams.get("password");
            if (storedPassword) sessionStorage.removeItem("temp_room_password");

            socket.emit("join-room", { roomId, nickname, userLimit, password });
            setIsConnected(true);

            socket.on("error", (err: string) => {
                if (err === "Password required" || err === "Invalid password") {
                    setShowPasswordModal(true);
                    if (err === "Invalid password") alert("Invalid password");
                } else if (err === "You are muted") {
                    alert(err); // Just alert, don't redirect
                } else {
                    alert(err);
                    router.push("/");
                }
            });

            socket.on("room-role", (data: { role: string }) => {
                if (data.role === "creator") setIsCreator(true);
            });

            socket.on("kicked", (msg: string) => {
                alert(msg);
                router.push("/");
            });

            socket.on("muted", (msg: string) => {
                setIsMuted(true);
                alert(msg);
            });

            socket.on("unmuted", (msg: string) => {
                setIsMuted(false);
                alert(msg);
            });

            socket.on("room-participants", (data: { socketId: string; userId: string; nickname?: string; isMuted: boolean }[]) => {
                setParticipants(data);
                const newMap = new Map(nicknames);
                data.forEach(p => {
                    if (p.nickname) newMap.set(p.socketId, p.nickname);
                });
                setNicknames(newMap);
            });

            socket.on("user-muted", ({ userId }: { userId: string }) => {
                setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isMuted: true } : p));
                if (userId === sessionStorage.getItem("userId")) setIsMuted(true);
            });

            socket.on("user-unmuted", ({ userId }: { userId: string }) => {
                setParticipants(prev => prev.map(p => p.userId === userId ? { ...p, isMuted: false } : p));
                if (userId === sessionStorage.getItem("userId")) setIsMuted(false);
            });

            socket.on("room-info", (data: { count: number }) => {
                setParticipantCount(data.count);
            });

            socket.on("user-joined", async (data: { socketId: string; userId: string; nickname?: string }) => {
                if (data.nickname) {
                    setNicknames(prev => new Map(prev).set(data.socketId, data.nickname!));
                }
                setParticipants(prev => {
                    if (prev.find(p => p.socketId === data.socketId)) return prev;
                    return [...prev, { socketId: data.socketId, userId: data.userId, nickname: data.nickname }];
                });

                if (myKeys.current) {
                    const exportedPub = await exportKey(myKeys.current.public);
                    socket.emit("signal", {
                        target: data.socketId,
                        signal: { type: "offer-key", key: exportedPub },
                    });
                }
            });

            socket.on("user-left", (data: { socketId: string; userId: string }) => {
                otherUsersKeys.current.delete(data.socketId);
                setParticipants(prev => prev.filter(p => p.socketId !== data.socketId));
            });

            socket.on("signal", async (data: { sender: string; signal: any }) => {
                const { sender, signal } = data;
                if (signal.type === "offer-key") {
                    const importedKey = await importKey(signal.key, ["encrypt"]);
                    otherUsersKeys.current.set(sender, importedKey);
                    if (myKeys.current) {
                        const exportedPub = await exportKey(myKeys.current.public);
                        socket.emit("signal", {
                            target: sender,
                            signal: { type: "answer-key", key: exportedPub },
                        });
                    }
                } else if (signal.type === "answer-key") {
                    const importedKey = await importKey(signal.key, ["encrypt"]);
                    otherUsersKeys.current.set(sender, importedKey);
                }
            });

            socket.on("message-status", (data: { messageId: string; status: "delivered" | "read"; originalSenderId: string }) => {
                if (data.originalSenderId === socket.id) {
                    setMessages((prev) =>
                        prev.map((msg) => {
                            if (msg.id === data.messageId) {
                                if (msg.status === "read") return msg;
                                if (msg.status === "delivered" && data.status === "delivered") return msg;
                                return { ...msg, status: data.status };
                            }
                            return msg;
                        })
                    );
                }
            });

            socket.on("receive-message", async (data: { senderId: string; payload: any; messageId: string; roomId: string; type?: string }) => {
                const { senderId, payload, messageId, type } = data;

                socket.emit("message-delivered", {
                    roomId: data.roomId,
                    messageId,
                    senderId,
                    recipientId: socket.id
                });

                // Stress Test Bypass
                if (payload?.isStressTest) {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: messageId || crypto.randomUUID(),
                            senderId,
                            content: payload.content || "Stress Test Message",
                            timestamp: Date.now(),
                            type: "text",
                        },
                    ]);
                    return;
                }

                try {
                    const myEncryptedKey = payload.keys[socket.id || ""];
                    if (!myEncryptedKey) return;

                    if (!myKeys.current) return;
                    const aesKeyRaw = await decryptMessage(myKeys.current.private, myEncryptedKey);
                    const aesKey = await importSymKey(aesKeyRaw);

                    let content = "";
                    let fileData = undefined;

                    if (type === "file") {
                        content = "[FILE]";
                        fileData = payload.file;
                    } else {
                        content = await decryptSymMessage(aesKey, payload.content);
                    }

                    setMessages((prev) => [
                        ...prev,
                        {
                            id: messageId || crypto.randomUUID(),
                            senderId,
                            content,
                            timestamp: Date.now(),
                            type: (type as "text" | "file") || "text",
                            file: fileData,
                            encryptedKey: myEncryptedKey
                        },
                    ]);

                    socket.emit("message-read", {
                        roomId,
                        messageId,
                        senderId,
                        recipientId: socket.id
                    });
                } catch (err) {
                    console.error("Failed to decrypt message:", err);
                }
            });

            socket.on("user-typing", ({ socketId, nickname }: { socketId: string; nickname: string }) => {
                setTypingUsers(prev => new Set(prev).add(socketId));
                setNicknames(prev => new Map(prev).set(socketId, nickname));
            });

            socket.on("user-stopped-typing", ({ socketId }: { socketId: string }) => {
                setTypingUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(socketId);
                    return newSet;
                });
            });

            socket.on("message-reaction-update", (data: { messageId: string; reaction: string; senderId: string }) => {
                setMessages(prev => prev.map(msg => {
                    if (msg.id === data.messageId) {
                        const newReactions = { ...(msg.reactions || {}) };

                        // Check if user is toggling the same reaction
                        const currentUsers = newReactions[data.reaction] || [];
                        if (currentUsers.includes(data.senderId)) {
                            // Remove it (Toggle off)
                            newReactions[data.reaction] = currentUsers.filter(id => id !== data.senderId);
                            if (newReactions[data.reaction].length === 0) delete newReactions[data.reaction];
                        } else {
                            // Remove user from ALL other reactions first (Single reaction limit)
                            Object.keys(newReactions).forEach(key => {
                                const users = newReactions[key] || [];
                                if (users.includes(data.senderId)) {
                                    newReactions[key] = users.filter(id => id !== data.senderId);
                                    if (newReactions[key].length === 0) delete newReactions[key];
                                }
                            });

                            // Add new reaction
                            newReactions[data.reaction] = [...(newReactions[data.reaction] || []), data.senderId];
                        }
                        return { ...msg, reactions: newReactions };
                    }
                    return msg;
                }));
            });
        };

        init();

        return () => {
            socket.off("error");
            socket.off("room-info");
            socket.off("user-joined");
            socket.off("user-left");
            socket.off("signal");
            socket.off("receive-message");
            socket.off("message-status");
            socket.off("user-typing");
            socket.off("user-stopped-typing");
            socket.off("room-role");
            socket.off("kicked");
            socket.off("muted");
            socket.off("unmuted");
            socket.off("room-participants");
            socket.off("message-reaction-update");
            socket.disconnect();
        };
    }, [roomId, nickname, userLimit, router, searchParams]);

    const sendMessage = async () => {
        if (!inputMessage.trim() || !myKeys.current) return;

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        socket.emit("typing-stop", { roomId });

        try {
            const aesKey = await generateSymKey();
            const encryptedContent = await encryptSymMessage(aesKey, inputMessage);
            const rawAesKey = await exportSymKey(aesKey);
            const keysMap: Record<string, string> = {};

            for (const [userId, pubKey] of otherUsersKeys.current.entries()) {
                const encryptedAesKey = await encryptMessage(pubKey, rawAesKey);
                keysMap[userId] = encryptedAesKey;
            }

            const messageId = crypto.randomUUID();

            socket.emit("send-message", {
                roomId,
                payload: {
                    content: encryptedContent,
                    keys: keysMap,
                },
                senderId: socket.id,
                messageId,
                type: "text"
            });

            setMessages((prev) => [
                ...prev,
                {
                    id: messageId,
                    senderId: "me",
                    content: inputMessage,
                    timestamp: Date.now(),
                    status: "sent",
                    type: "text"
                },
            ]);

            setInputMessage("");
        } catch (err) {
            console.error("Failed to send message:", err);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputMessage(e.target.value);

        if (!typingTimeoutRef.current) {
            socket.emit("typing-start", { roomId });
        }

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            socket.emit("typing-stop", { roomId });
            typingTimeoutRef.current = null;
        }, 2000);
    };

    const handleEmojiClick = (emojiData: any) => {
        const emoji = emojiData.emoji;
        const input = inputRef.current;
        if (input) {
            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            const newValue = inputMessage.substring(0, start) + emoji + inputMessage.substring(end);
            setInputMessage(newValue);
            setTimeout(() => {
                input.focus();
                input.setSelectionRange(start + emoji.length, start + emoji.length);
            }, 0);
        } else {
            setInputMessage(inputMessage + emoji);
        }
        setShowEmojiPicker(false);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !myKeys.current) return;
        if (file.size > 10 * 1024 * 1024) {
            alert("File size must be less than 10MB");
            return;
        }
        setIsUploading(true);
        try {
            const fileAesKey = await generateSymKey();
            const fileBuffer = await file.arrayBuffer();
            const encryptedFileContent = await encryptFile(fileAesKey, fileBuffer);
            const encryptedBlob = new Blob([encryptedFileContent], { type: "application/octet-stream" });
            const formData = new FormData();
            formData.append("file", encryptedBlob, file.name);
            const response = await fetch("/api/upload", { method: "POST", body: formData });
            if (!response.ok) throw new Error("Upload failed");
            const fileData = await response.json();
            const rawFileAesKey = await exportSymKey(fileAesKey);
            const keysMap: Record<string, string> = {};
            for (const [userId, pubKey] of otherUsersKeys.current.entries()) {
                const encryptedKey = await encryptMessage(pubKey, rawFileAesKey);
                keysMap[userId] = encryptedKey;
            }
            if (myKeys.current && socket.id) {
                const myEncryptedKey = await encryptMessage(myKeys.current.public, rawFileAesKey);
                keysMap[socket.id] = myEncryptedKey;
            }
            const messageId = crypto.randomUUID();
            socket.emit("send-message", {
                roomId,
                payload: {
                    content: "[FILE]",
                    keys: keysMap,
                    file: {
                        id: fileData.fileId,
                        name: file.name,
                        size: file.size,
                        mimeType: file.type,
                    }
                },
                senderId: socket.id,
                messageId,
                type: "file"
            });
            setMessages((prev) => [
                ...prev,
                {
                    id: messageId,
                    senderId: "me",
                    content: "[FILE]",
                    timestamp: Date.now(),
                    status: "sent",
                    type: "file",
                    file: {
                        id: fileData.fileId,
                        name: file.name,
                        size: file.size,
                        mimeType: file.type,
                    },
                    encryptedKey: socket.id ? keysMap[socket.id] : undefined
                },
            ]);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (error) {
            console.error("File upload error:", error);
            alert("Failed to upload file");
        } finally {
            setIsUploading(false);
        }
    };

    const getTypingIndicator = () => {
        if (typingUsers.size === 0) return null;
        const typingNames = Array.from(typingUsers).map(socketId =>
            nicknames.get(socketId) || `User ${socketId.slice(0, 4)}`
        );
        if (typingNames.length === 1) return `${typingNames[0]} is typing...`;
        if (typingNames.length === 2) return `${typingNames[0]} and ${typingNames[1]} are typing...`;
        return `${typingNames.length} people are typing...`;
    };

    const handleDownload = async (fileId: string, fileName: string, encryptedKey: string) => {
        try {
            const response = await fetch(`/api/files/${fileId}`);
            if (!response.ok) throw new Error("Download failed");
            const encryptedBlob = await response.blob();
            const encryptedBuffer = await encryptedBlob.arrayBuffer();
            if (!myKeys.current) return;
            const aesKeyRaw = await decryptMessage(myKeys.current.private, encryptedKey);
            const aesKey = await importSymKey(aesKeyRaw);
            const decryptedBuffer = await decryptFile(aesKey, encryptedBuffer);
            const blob = new Blob([decryptedBuffer]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Download error:", error);
            alert("Failed to download file");
        }
    };

    const handleReaction = (messageId: string, emoji: string) => {
        if (!socket.id) return;

        // Optimistic update
        setMessages(prev => prev.map(msg => {
            if (msg.id === messageId) {
                const newReactions = { ...(msg.reactions || {}) };
                const users = newReactions[emoji] || [];

                // Check if user is toggling the same reaction
                if (users.includes(socket.id!)) {
                    newReactions[emoji] = users.filter(id => id !== socket.id);
                    if (newReactions[emoji].length === 0) delete newReactions[emoji];
                } else {
                    // Remove user from ALL other reactions first (Single reaction limit)
                    Object.keys(newReactions).forEach(key => {
                        const rUsers = newReactions[key] || [];
                        if (rUsers.includes(socket.id!)) {
                            newReactions[key] = rUsers.filter(id => id !== socket.id!);
                            if (newReactions[key].length === 0) delete newReactions[key];
                        }
                    });

                    // Add new reaction
                    newReactions[emoji] = [...users, socket.id!];
                }
                return { ...msg, reactions: newReactions };
            }
            return msg;
        }));

        socket.emit("message-reaction", {
            roomId,
            messageId,
            reaction: emoji,
            senderId: socket.id
        });
        setActiveReactionMessageId(null);
    };

    const COMMON_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "😡"];

    return (
        <div className="flex flex-col h-screen max-w-5xl mx-auto p-2 md:p-4">
            <Card className="flex-1 !py-0 !px-0 flex flex-col bg-background/50 backdrop-blur-sm border-border/50 shadow-2xl overflow-hidden">
                <CardHeader className="border-b border-border/40 py-4 px-6 flex flex-row items-center justify-between bg-background/40 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-emerald-500 to-cyan-500 p-2.5 rounded-xl shadow-lg shadow-emerald-500/20">
                            <Lock className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2 font-bold tracking-tight">
                                Room: <span className="font-mono text-emerald-500">{roomId}</span>
                            </CardTitle>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                                {isConnected ? "Encrypted Connection Active" : "Disconnected"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-muted/50 rounded-full p-1 border border-border/50">
                            <Button variant="ghost" size="sm" onClick={() => setShowParticipantsModal(true)} className="text-muted-foreground hover:text-foreground rounded-full h-8 px-3">
                                <Users className="w-4 h-4 mr-2" />
                                <span>{participantCount}</span>
                            </Button>
                            {isCreator && (
                                <Button variant="ghost" size="icon" onClick={() => setShowSettingsModal(true)} className="text-muted-foreground hover:text-foreground rounded-full h-8 w-8">
                                    <Settings className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                        <div className="h-6 w-px bg-border/50 mx-1" />
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={joinCall}
                            className="text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all"
                            title="Start Call"
                        >
                            <Phone className="w-5 h-5" />
                        </Button>
                        <ThemeToggle />
                    </div>
                </CardHeader>

                {localStream && (
                    <CallInterface
                        localStream={localStream}
                        remoteStreams={remoteStreams}
                        onLeave={leaveCall}
                        nicknames={nicknames}
                    />
                )}

                <CardContent className="flex-1 overflow-hidden p-0 relative">
                    <ScrollArea className="h-full px-4 py-2">
                        <div className="flex flex-col gap-4">
                            {messages.map((msg) => {
                                const isMe = msg.senderId === "me";
                                const senderName = isMe ? "Me" : (nicknames.get(msg.senderId) || `User ${msg.senderId.slice(0, 4)}`);

                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex ${isMe ? "justify-end" : "justify-start"} animate-fade-in-up`}
                                    >
                                        {!isMe && (
                                            <div className="flex flex-col items-start mr-2">
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                                    {senderName.charAt(0).toUpperCase()}
                                                </div>
                                            </div>
                                        )}
                                        <div className="relative group max-w-[80%]">
                                            {!isMe && (
                                                <span className="text-[10px] text-muted-foreground ml-1 mb-1 block">
                                                    {senderName}
                                                </span>
                                            )}
                                            <div
                                                className={`rounded-2xl px-4 py-3 relative shadow-md transition-all ${isMe
                                                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-tr-sm"
                                                    : "bg-card border border-border/50 text-foreground rounded-tl-sm hover:border-emerald-500/30"
                                                    }`}
                                            >
                                                {/* Reaction Button (Visible on Hover) */}
                                                <button
                                                    onClick={() => setActiveReactionMessageId(activeReactionMessageId === msg.id ? null : msg.id)}
                                                    className={`absolute ${isMe ? "-left-8" : "-right-8"} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all p-1.5 hover:bg-background/20 rounded-full backdrop-blur-sm`}
                                                >
                                                    <Smile className="w-4 h-4 text-muted-foreground" />
                                                </button>

                                                {/* Reaction Picker Popover */}
                                                {activeReactionMessageId === msg.id && (
                                                    <div className={`absolute ${isMe ? "right-full mr-2" : "left-full ml-2"} top-1/2 -translate-y-1/2 bg-popover/90 backdrop-blur-md border border-border rounded-full shadow-xl p-1.5 flex gap-1 z-50 animate-fade-in`}>
                                                        {COMMON_REACTIONS.map(emoji => (
                                                            <button
                                                                key={emoji}
                                                                onClick={() => handleReaction(msg.id, emoji)}
                                                                className="hover:bg-muted p-1.5 rounded-full text-lg transition-transform hover:scale-110"
                                                            >
                                                                {emoji}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                {msg.type === "file" && msg.file ? (
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2.5 rounded-xl ${isMe ? "bg-black/20" : "bg-muted"}`}>
                                                            <FileIcon className="w-6 h-6" />
                                                        </div>
                                                        <div className="flex flex-col overflow-hidden">
                                                            <span className="text-sm font-medium truncate max-w-[150px]">{msg.file.name}</span>
                                                            <span className="text-xs opacity-70">{(msg.file.size / 1024).toFixed(1)} KB</span>
                                                        </div>
                                                        {!isMe && msg.encryptedKey && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 hover:bg-black/10 rounded-full"
                                                                onClick={() => handleDownload(msg.file!.id, msg.file!.name, msg.encryptedKey!)}
                                                            >
                                                                <Download className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className={`markdown-content text-sm leading-relaxed break-words break-all whitespace-pre-wrap ${isMe ? 'text-white' : 'text-foreground'}`}>
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            components={{
                                                                p: ({ node, ...props }) => <p className="mb-1 last:mb-0" {...props} />,
                                                                a: ({ node, ...props }) => <a className="underline hover:opacity-80 transition-opacity" target="_blank" rel="noopener noreferrer" {...props} />,
                                                                code: ({ node, className, children, ...props }: any) => {
                                                                    const match = /language-(\w+)/.exec(className || '')
                                                                    return !match ? (
                                                                        <code className={`rounded px-1 py-0.5 font-mono text-xs ${isMe ? "bg-black/20" : "bg-muted"}`} {...props}>
                                                                            {children}
                                                                        </code>
                                                                    ) : (
                                                                        <code className={`block rounded p-2 font-mono text-xs overflow-x-auto my-1 ${isMe ? "bg-black/20" : "bg-muted"}`} {...props}>
                                                                            {children}
                                                                        </code>
                                                                    )
                                                                },
                                                                ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-1" {...props} />,
                                                                ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-1" {...props} />,
                                                                blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-current pl-2 italic my-1 opacity-80" {...props} />,
                                                            }}
                                                        >
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}

                                                {/* Reactions Display */}
                                                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                                    <div className={`absolute -bottom-3 ${isMe ? 'right-0' : 'left-0'} flex items-center gap-0.5 bg-background/80 backdrop-blur-md border border-border/50 rounded-full px-1.5 py-0.5 shadow-sm z-10`}>
                                                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                                                            <button
                                                                key={emoji}
                                                                onClick={() => handleReaction(msg.id, emoji)}
                                                                className={`text-[10px] min-w-[20px] h-[16px] flex items-center justify-center rounded-full transition-all hover:scale-110 ${users.includes(socket.id!) ? 'bg-emerald-500/20 text-emerald-500' : 'hover:bg-muted/50'}`}
                                                                title={users.map(u => nicknames.get(u) || u).join(", ")}
                                                            >
                                                                <span className="mr-0.5">{emoji}</span>
                                                                <span className="font-medium opacity-80">{users.length}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                <span className="text-[10px] opacity-60 block mt-1 flex items-center justify-end gap-1">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    {isMe && (
                                                        <span>
                                                            {msg.status === "sending" && <Check className="w-3 h-3 opacity-70" />}
                                                            {msg.status === "sent" && <Check className="w-3 h-3 opacity-70" />}
                                                            {msg.status === "delivered" && <CheckCheck className="w-3 h-3 opacity-70" />}
                                                            {msg.status === "read" && <CheckCheck className="w-3 h-3 text-blue-200" />}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                </CardContent>

                <div className="p-3 border-t border-border/40 bg-background/40 backdrop-blur-md">
                    {typingUsers.size > 0 && (
                        <div className="text-xs text-emerald-500 mb-2 italic animate-pulse flex items-center gap-1 px-2">
                            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" />
                            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce delay-75" />
                            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce delay-150" />
                            {getTypingIndicator()}
                        </div>
                    )}
                    <div className="relative">
                        {showEmojiPicker && (
                            <div className="absolute bottom-full right-0 mb-4 z-50 animate-fade-in-up">
                                <EmojiPicker
                                    onEmojiClick={handleEmojiClick}
                                    theme={"dark" as any}
                                    lazyLoadEmojis={true}
                                    style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '1px solid var(--border)', backgroundColor: '#0f172a' }}
                                />
                            </div>
                        )}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                sendMessage();
                            }}
                            className="relative flex items-center gap-2 bg-muted/30 rounded-3xl border border-border/50 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all p-1.5"
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => fileInputRef.current?.click()}
                                className="text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full h-9 w-9 transition-colors shrink-0"
                                disabled={isUploading}
                            >
                                {isUploading ? (
                                    <div className="w-4 h-4 border-2 border-muted-foreground border-t-emerald-500 rounded-full animate-spin" />
                                ) : (
                                    <Paperclip className="w-5 h-5" />
                                )}
                            </Button>

                            <Input
                                ref={inputRef}
                                value={inputMessage}
                                onChange={handleInputChange}
                                maxLength={1000}
                                placeholder="Type a secure message..."
                                className="flex-1 bg-transparent border-none text-foreground focus-visible:ring-0 px-2 py-3 h-auto shadow-none placeholder:text-muted-foreground/70"
                            />

                            {inputMessage.length > 0 && (
                                <span className={`text-[10px] font-mono mr-2 ${inputMessage.length > 900 ? "text-red-500 font-bold" : "text-muted-foreground/50"}`}>
                                    {inputMessage.length}/1000
                                </span>
                            )}

                            <div className="flex items-center gap-1 pr-1">
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    className={`h-9 w-9 rounded-full transition-colors ${showEmojiPicker ? 'text-emerald-500 bg-emerald-500/10' : 'text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10'}`}
                                >
                                    <Smile className="w-5 h-5" />
                                </Button>

                                <Button
                                    type="submit"
                                    size="icon"
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full h-9 w-9 shadow-lg shadow-emerald-500/20 transition-transform hover:scale-105 shrink-0"
                                    disabled={!isConnected}
                                >
                                    <Send className="w-4 h-4 ml-0.5" />
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            </Card>

            {/* Password Modal */}
            {
                showPasswordModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                        <Card className="w-full max-w-sm bg-slate-900 border-slate-800">
                            <CardHeader>
                                <CardTitle className="text-white">Password Required</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Input
                                    type="password"
                                    placeholder="Enter room password"
                                    value={passwordInput}
                                    onChange={(e) => setPasswordInput(e.target.value)}
                                    className="bg-slate-950 border-slate-800 text-white"
                                />
                                <Button
                                    onClick={() => {
                                        socket.emit("join-room", { roomId, nickname, userLimit, password: passwordInput });
                                        setShowPasswordModal(false);
                                    }}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                                >
                                    Join Room
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )
            }

            {/* Settings Modal */}
            {
                showSettingsModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowSettingsModal(false)}>
                        <Card className="w-full max-w-md bg-slate-900 border-slate-800" onClick={e => e.stopPropagation()}>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-white">Room Settings</CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => setShowSettingsModal(false)}>
                                    <X className="w-4 h-4 text-slate-400" />
                                </Button>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-400">User Limit</label>
                                    <Input
                                        type="number"
                                        placeholder="Max users"
                                        value={newLimit}
                                        onChange={(e) => setNewLimit(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-400">Update Password (leave empty to remove)</label>
                                    <Input
                                        type="password"
                                        placeholder="New password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="bg-slate-950 border-slate-800 text-white"
                                    />
                                </div>
                                <Button
                                    onClick={() => {
                                        socket.emit("update-room-settings", {
                                            roomId,
                                            limit: newLimit ? parseInt(newLimit) : undefined,
                                            password: newPassword
                                        });
                                        setShowSettingsModal(false);
                                        setNewPassword("");
                                        setNewLimit("");
                                    }}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                                >
                                    Save Changes
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )
            }

            {/* Participants Modal */}
            {
                showParticipantsModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowParticipantsModal(false)}>
                        <Card className="w-full max-w-md bg-slate-900 border-slate-800 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-800">
                                <CardTitle className="text-white">Participants ({participants.length})</CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => setShowParticipantsModal(false)}>
                                    <X className="w-4 h-4 text-slate-400" />
                                </Button>
                            </CardHeader>
                            <CardContent className="p-0 overflow-hidden flex-1">
                                <ScrollArea className="h-full max-h-[60vh]">
                                    <div className="p-4 space-y-2">
                                        {participants.map((p) => (
                                            <div key={p.socketId} className="flex items-center justify-between p-2 rounded bg-slate-950/50 border border-slate-800">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                                        <User className="w-4 h-4 text-emerald-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-white">
                                                            {p.nickname || "Anonymous"}
                                                            {p.socketId === socket.id && " (You)"}
                                                        </p>
                                                        <p className="text-xs text-slate-500">ID: {p.userId.slice(0, 8)}...</p>
                                                    </div>
                                                </div>
                                                {isCreator && p.socketId !== socket.id && (
                                                    <div className="flex items-center gap-1">
                                                        {p.isMuted ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-red-400 hover:text-red-300"
                                                                onClick={() => socket.emit("unmute-user", { roomId, targetUserId: p.userId })}
                                                                title="Unmute"
                                                            >
                                                                <MicOff className="w-4 h-4" />
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-slate-400 hover:text-yellow-400"
                                                                onClick={() => socket.emit("mute-user", { roomId, targetUserId: p.userId })}
                                                                title="Mute"
                                                            >
                                                                <Mic className="w-4 h-4" />
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-slate-400 hover:text-red-400"
                                                            onClick={() => socket.emit("kick-user", { roomId, targetUserId: p.userId })}
                                                            title="Kick"
                                                        >
                                                            <UserX className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>
                )
            }
        </div >
    );
}
