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
import { Send, User, Lock, Check, CheckCheck, Smile, Paperclip, FileIcon, Download, Image as ImageIcon } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

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
        url?: string; // For decrypted file blob URL
    };
    encryptedKey?: string; // Store the encrypted AES key for this user
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

    const searchParams = useSearchParams();
    const router = useRouter();
    const nickname = searchParams.get("nickname") || "Anonymous";
    const userLimit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;

    // My keys
    const myKeys = useRef<{ public: CryptoKey; private: CryptoKey } | null>(null);

    // Other users' public keys: Map<userId, CryptoKey>
    const otherUsersKeys = useRef<Map<string, CryptoKey>>(new Map());

    // Messages end ref for auto-scroll
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
            // 0. Get or Create User ID
            let userId = sessionStorage.getItem("userId");
            if (!userId) {
                userId = crypto.randomUUID();
                sessionStorage.setItem("userId", userId);
            }

            // 1. Generate my keys
            const keys = await generateKeyPair();
            myKeys.current = { public: keys.publicKey, private: keys.privateKey };

            // 2. Connect to socket with userId
            socket.auth = { userId };
            socket.connect();

            // 3. Join room with nickname and limit
            socket.emit("join-room", { roomId, nickname, userLimit });
            setIsConnected(true);

            // 4. Listeners
            socket.on("error", (err: string) => {
                alert(err);
                router.push("/");
            });

            socket.on("room-info", (data: { count: number }) => {
                setParticipantCount(data.count);
            });

            socket.on("user-joined", async (data: { socketId: string; userId: string; nickname?: string }) => {
                console.log("User joined:", data);

                if (data.nickname) {
                    setNicknames(prev => new Map(prev).set(data.socketId, data.nickname!));
                }

                // Initiate Key Exchange: Send my Public Key to the new socket
                if (myKeys.current) {
                    const exportedPub = await exportKey(myKeys.current.public);
                    socket.emit("signal", {
                        target: data.socketId,
                        signal: { type: "offer-key", key: exportedPub },
                    });
                }
            });

            socket.on("user-left", (data: { socketId: string; userId: string }) => {
                console.log("User left:", data);
                otherUsersKeys.current.delete(data.socketId);
            });

            socket.on("signal", async (data: { sender: string; signal: any }) => {
                const { sender, signal } = data;

                if (signal.type === "offer-key") {
                    // Received a Public Key from someone
                    const importedKey = await importKey(signal.key, ["encrypt"]);
                    otherUsersKeys.current.set(sender, importedKey);
                    console.log("Received public key from:", sender);

                    // If I haven't sent my key to them, send it back
                    if (myKeys.current) {
                        const exportedPub = await exportKey(myKeys.current.public);
                        socket.emit("signal", {
                            target: sender,
                            signal: { type: "answer-key", key: exportedPub },
                        });
                    }
                } else if (signal.type === "answer-key") {
                    // Received a Public Key in response to my offer
                    const importedKey = await importKey(signal.key, ["encrypt"]);
                    otherUsersKeys.current.set(sender, importedKey);
                    console.log("Received answer key from:", sender);
                }
            });

            socket.on("message-status", (data: { messageId: string; status: "delivered" | "read"; originalSenderId: string }) => {
                console.log("Received message-status:", data, "My socket.id:", socket.id);
                if (data.originalSenderId === socket.id) {
                    console.log("Updating status for my message:", data.messageId, "to", data.status);
                    setMessages((prev) =>
                        prev.map((msg) => {
                            if (msg.id === data.messageId) {
                                console.log("Found message to update. Current status:", msg.status, "New status:", data.status);
                                // Upgrade status: sent -> delivered -> read
                                // If already read, don't go back to delivered
                                if (msg.status === "read") return msg;
                                if (msg.status === "delivered" && data.status === "delivered") return msg;
                                return { ...msg, status: data.status };
                            }
                            return msg;
                        })
                    );
                } else {
                    console.log("Message status not for me. Original sender:", data.originalSenderId, "Me:", socket.id);
                }
            });

            socket.on("receive-message", async (data: { senderId: string; payload: any; messageId: string; roomId: string; type?: string }) => {
                console.log("=== RECEIVE-MESSAGE EVENT ===");
                console.log("Full data:", JSON.stringify(data, null, 2));
                console.log("Sender ID:", data.senderId);
                console.log("Message ID:", data.messageId);
                console.log("My socket.id:", socket.id);

                const { senderId, payload, messageId, type } = data;

                // Emit Delivered immediately
                console.log("Emitting message-delivered for messageId:", messageId, "original sender:", senderId);
                socket.emit("message-delivered", {
                    roomId: data.roomId,
                    messageId,
                    senderId, // original sender's socket.id
                    recipientId: socket.id
                });

                try {
                    // 1. Find the encrypted AES key for ME
                    const myEncryptedKey = payload.keys[socket.id || ""];
                    if (!myEncryptedKey) {
                        console.error("No key found for me in message");
                        return;
                    }

                    // 2. Decrypt AES key with my Private Key
                    if (!myKeys.current) return;
                    const aesKeyRaw = await decryptMessage(myKeys.current.private, myEncryptedKey);

                    // 3. Import AES Key
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
                            encryptedKey: myEncryptedKey // Store for later use (download)
                        },
                    ]);

                    // Emit Read after successfully displaying the message
                    console.log("Emitting message-read for messageId:", messageId, "original sender:", senderId);
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
                console.log("Received user-typing event. SocketId:", socketId, "Nickname:", nickname);
                setTypingUsers(prev => {
                    const newSet = new Set(prev).add(socketId);
                    console.log("Updated typingUsers. New size:", newSet.size, "Users:", Array.from(newSet));
                    return newSet;
                });
                setNicknames(prev => new Map(prev).set(socketId, nickname));
            });

            socket.on("user-stopped-typing", ({ socketId }: { socketId: string }) => {
                console.log("Received user-stopped-typing event. SocketId:", socketId);
                setTypingUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(socketId);
                    console.log("Updated typingUsers after delete. New size:", newSet.size);
                    return newSet;
                });
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
            socket.disconnect();
        };
    }, [roomId, nickname, userLimit, router]);

    const sendMessage = async () => {
        if (!inputMessage.trim() || !myKeys.current) return;

        // Clear typing indicator immediately
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        socket.emit("typing-stop", { roomId });

        try {
            // 1. Generate Session AES Key
            const aesKey = await generateSymKey();

            // 2. Encrypt Message with AES Key
            const encryptedContent = await encryptSymMessage(aesKey, inputMessage);

            // 3. Export AES Key
            const rawAesKey = await exportSymKey(aesKey);

            // 4. Encrypt AES Key for EACH participant
            const keysMap: Record<string, string> = {};

            // For other users
            for (const [userId, pubKey] of otherUsersKeys.current.entries()) {
                const encryptedAesKey = await encryptMessage(pubKey, rawAesKey);
                keysMap[userId] = encryptedAesKey;
            }

            const messageId = crypto.randomUUID();

            // Send to server
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

            // Add to local UI
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

        // Emit typing-start
        console.log("Emitting typing-start to room:", roomId);
        socket.emit("typing-start", { roomId });

        // Clear previous timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Set timeout to emit typing-stop after 2 seconds
        typingTimeoutRef.current = setTimeout(() => {
            console.log("Emitting typing-stop to room:", roomId);
            socket.emit("typing-stop", { roomId });
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

            // Set cursor position after emoji
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
            // 1. Generate File AES Key
            const fileAesKey = await generateSymKey();

            // 2. Encrypt File Content
            const fileBuffer = await file.arrayBuffer();
            const encryptedFileContent = await encryptFile(fileAesKey, fileBuffer);

            // 3. Create Blob from encrypted content for upload
            // encryptedFileContent is now ArrayBuffer
            const encryptedBlob = new Blob([encryptedFileContent], { type: "application/octet-stream" });
            const formData = new FormData();
            formData.append("file", encryptedBlob, file.name);

            // 4. Upload Encrypted File
            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) throw new Error("Upload failed");
            const fileData = await response.json();

            // 5. Encrypt File AES Key for EACH participant (same as message keys)
            const rawFileAesKey = await exportSymKey(fileAesKey);
            const keysMap: Record<string, string> = {};

            // For other users
            for (const [userId, pubKey] of otherUsersKeys.current.entries()) {
                const encryptedKey = await encryptMessage(pubKey, rawFileAesKey);
                keysMap[userId] = encryptedKey;
            }

            // Encrypt key for myself too
            if (myKeys.current && socket.id) {
                const myEncryptedKey = await encryptMessage(myKeys.current.public, rawFileAesKey);
                keysMap[socket.id] = myEncryptedKey;
            }

            const messageId = crypto.randomUUID();

            // 6. Send Message with File Metadata
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

            // Add to local UI
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

            // Reset file input
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

        if (typingNames.length === 1) {
            return `${typingNames[0]} is typing...`;
        } else if (typingNames.length === 2) {
            return `${typingNames[0]} and ${typingNames[1]} are typing...`;
        } else {
            return `${typingNames.length} people are typing...`;
        }
    };

    const handleDownload = async (fileId: string, fileName: string, encryptedKey: string) => {
        try {
            // 1. Fetch Encrypted File
            const response = await fetch(`/api/files/${fileId}`);
            if (!response.ok) throw new Error("Download failed");

            const encryptedBlob = await response.blob();
            const encryptedBuffer = await encryptedBlob.arrayBuffer();

            // 2. Decrypt AES Key
            if (!myKeys.current) return;
            const aesKeyRaw = await decryptMessage(myKeys.current.private, encryptedKey);
            const aesKey = await importSymKey(aesKeyRaw);

            // 3. Decrypt File Content
            // decryptFile now accepts ArrayBuffer directly
            const decryptedBuffer = await decryptFile(aesKey, encryptedBuffer);

            // 4. Create Download Link
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

    return (
        <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
            <Card className="flex-1 flex flex-col bg-slate-900 border-slate-800">
                <CardHeader className="border-b border-slate-800 py-3 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-emerald-400" />
                        <CardTitle className="text-slate-100 text-lg">Room: {roomId}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <User className="w-4 h-4" />
                        <span>{participantCount} Online</span>
                        <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-500"}`} />
                    </div>
                </CardHeader>

                <CardContent className="flex-1 p-0 overflow-hidden relative">
                    <ScrollArea className="h-full p-4">
                        <div className="space-y-4 pb-4">
                            {messages.map((msg) => {
                                const isMe = msg.senderId === "me";
                                const senderName = isMe ? "Me" : (nicknames.get(msg.senderId) || `User ${msg.senderId.slice(0, 4)}`);

                                return (
                                    <div
                                        key={msg.id}
                                        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                                    >
                                        {!isMe && (
                                            <span className="text-[10px] text-slate-400 mb-1 ml-1">
                                                {senderName}
                                            </span>
                                        )}
                                        <div
                                            className={`max-w-[80%] rounded-lg px-4 py-2 ${isMe
                                                ? "bg-emerald-600 text-white"
                                                : "bg-slate-800 text-slate-100"
                                                }`}
                                        >
                                            {msg.type === "file" && msg.file ? (
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-black/20 rounded-lg">
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
                                                            className="h-8 w-8 hover:bg-black/20 rounded-full"
                                                            onClick={() => handleDownload(msg.file!.id, msg.file!.name, msg.encryptedKey!)}
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : (
                                                <p>{msg.content}</p>
                                            )}

                                            <span className="text-[10px] opacity-50 block mt-1 flex items-center justify-end gap-1">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                                {isMe && (
                                                    <span>
                                                        {msg.status === "sending" && <Check className="w-3 h-3 text-slate-400" />}
                                                        {msg.status === "sent" && <Check className="w-3 h-3 text-slate-300" />}
                                                        {msg.status === "delivered" && <CheckCheck className="w-3 h-3 text-slate-300" />}
                                                        {msg.status === "read" && <CheckCheck className="w-3 h-3 text-blue-400" />}
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>
                </CardContent>

                <div className="p-4 border-t border-slate-800 bg-slate-900">
                    {typingUsers.size > 0 && (
                        <div className="text-xs text-slate-400 mb-2 italic">
                            {getTypingIndicator()}
                        </div>
                    )}
                    <div className="relative">
                        {showEmojiPicker && (
                            <div className="absolute bottom-full right-0 mb-2 z-50">
                                <EmojiPicker
                                    onEmojiClick={handleEmojiClick}
                                    theme={"dark" as any}
                                    lazyLoadEmojis={true}
                                />
                            </div>
                        )}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                sendMessage();
                            }}
                            className="flex gap-2"
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
                                className="text-slate-400 hover:text-emerald-400 hover:bg-slate-800"
                                disabled={isUploading}
                            >
                                {isUploading ? (
                                    <div className="w-4 h-4 border-2 border-slate-400 border-t-emerald-400 rounded-full animate-spin" />
                                ) : (
                                    <Paperclip className="w-5 h-5" />
                                )}
                            </Button>

                            <div className="relative flex-1">
                                <Input
                                    ref={inputRef}
                                    value={inputMessage}
                                    onChange={handleInputChange}
                                    placeholder="Type a secure message..."
                                    className="bg-slate-950 border-slate-800 text-slate-100 focus:ring-emerald-500 pr-10"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-slate-800"
                                >
                                    <Smile className="h-4 w-4 text-slate-400 hover:text-emerald-400" />
                                </Button>
                            </div>
                            <Button
                                type="submit"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={!isConnected}
                            >
                                <Send className="w-4 h-4" />
                            </Button>
                        </form>
                    </div>
                </div>
            </Card>
        </div>
    );
}
