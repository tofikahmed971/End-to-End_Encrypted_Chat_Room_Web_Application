import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dbConnect from "./lib/db";

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "8000", 10);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(async () => {
    try {
        await dbConnect();
    } catch (e) {
        console.warn("MongoDB connection failed, running in memory-only mode:", e);
    }

    const httpServer = createServer(handler);

    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });

    console.log("✓ Socket.IO server initialized");

    // Track room users: RoomId -> UserId -> SocketCount
    const roomUsers = new Map<string, Map<string, number>>();
    // Track room limits: RoomId -> Limit
    const roomLimits = new Map<string, number>();
    // Track nicknames: SocketId -> Nickname
    const socketNicknames = new Map<string, string>();
    // Track call participants: RoomId -> Set<SocketId>
    const callParticipants = new Map<string, Set<string>>();

    interface RoomConfig {
        passwordHash?: string;
        creatorId: string;
        limit: number;
    }
    const roomConfigs = new Map<string, RoomConfig>();
    const mutedUsers = new Map<string, Set<string>>(); // RoomId -> Set<UserId>

    io.on("connection", (socket) => {
        if (dev) {
            console.log("\n========================================");
            console.log("NEW CLIENT CONNECTED:", socket.id);
            console.log("========================================\n");
        }

        const userId = socket.handshake.auth.userId;

        if (!userId) {
            console.log("No userId provided, ignoring");
            return;
        }

        socket.on("join-room", async ({ roomId, nickname, userLimit, password }: { roomId: string; nickname?: string; userLimit?: number; password?: string }) => {
            let config = roomConfigs.get(roomId);

            // Room Creation / Initialization
            if (!config) {
                const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;
                config = {
                    creatorId: userId,
                    limit: userLimit || 10,
                    passwordHash: hashedPassword
                };
                roomConfigs.set(roomId, config);
                roomLimits.set(roomId, config.limit);
            } else {
                if (config.passwordHash) {
                    if (!password) {
                        socket.emit("error", "Password required");
                        return;
                    }
                    const isMatch = await bcrypt.compare(password, config.passwordHash);
                    if (!isMatch) {
                        socket.emit("error", "Invalid password");
                        return;
                    }
                }
            }

            const currentLimit = config.limit;
            const users = roomUsers.get(roomId);
            const currentUniqueUsers = users ? users.size : 0;
            const isNewUser = !users || !users.has(userId);

            if (isNewUser && currentUniqueUsers >= currentLimit) {
                socket.emit("error", "Room is full");
                return;
            }

            socket.join(roomId);
            if (nickname) {
                socketNicknames.set(socket.id, nickname);
            }
            if (dev) console.log(`Socket ${socket.id} (User ${userId}) joined room ${roomId}`);

            if (!roomUsers.has(roomId)) {
                roomUsers.set(roomId, new Map());
            }
            const roomUserMap = roomUsers.get(roomId)!;
            const currentCount = roomUserMap.get(userId) || 0;
            roomUserMap.set(userId, currentCount + 1);

            socket.to(roomId).emit("user-joined", { socketId: socket.id, userId, nickname });
            io.to(roomId).emit("room-info", { count: roomUserMap.size, limit: currentLimit });

            const roomSockets = io.sockets.adapter.rooms.get(roomId);
            const participants: { socketId: string; userId: string; nickname?: string; isMuted: boolean }[] = [];
            if (roomSockets) {
                for (const sid of roomSockets) {
                    const s = io.sockets.sockets.get(sid);
                    if (s) {
                        const pUserId = s.handshake.auth.userId;
                        const isMuted = mutedUsers.get(roomId)?.has(pUserId) || false;
                        participants.push({
                            socketId: sid,
                            userId: pUserId,
                            nickname: socketNicknames.get(sid),
                            isMuted
                        });
                    }
                }
            }
            socket.emit("room-participants", participants);

            if (config.creatorId === userId) {
                socket.emit("room-role", { role: "creator" });
            }

            // Send current call participants if any
            if (callParticipants.has(roomId)) {
                const callUsers = Array.from(callParticipants.get(roomId)!);
                socket.emit("call-participants", callUsers);
            }
        });

        // Call Events
        socket.on("join-call", ({ roomId }) => {
            if (!callParticipants.has(roomId)) {
                callParticipants.set(roomId, new Set());
            }
            callParticipants.get(roomId)!.add(socket.id);
            socket.to(roomId).emit("user-connected-to-call", { socketId: socket.id });

        });

        socket.on("leave-call", ({ roomId }) => {
            if (callParticipants.has(roomId)) {
                callParticipants.get(roomId)!.delete(socket.id);
                if (callParticipants.get(roomId)!.size === 0) {
                    callParticipants.delete(roomId);
                }
            }
            socket.to(roomId).emit("user-disconnected-from-call", { socketId: socket.id });
        });

        socket.on("kick-user", ({ roomId, targetUserId }) => {
            const config = roomConfigs.get(roomId);
            if (!config || config.creatorId !== userId) {
                socket.emit("error", "Unauthorized");
                return;
            }
            const roomSockets = io.sockets.adapter.rooms.get(roomId);
            if (roomSockets) {
                for (const socketId of roomSockets) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s && s.handshake.auth.userId === targetUserId) {
                        s.emit("kicked", "You have been kicked from the room");
                        s.disconnect(true);
                    }
                }
            }
        });

        socket.on("mute-user", ({ roomId, targetUserId }) => {
            const config = roomConfigs.get(roomId);
            if (!config || config.creatorId !== userId) {
                socket.emit("error", "Unauthorized");
                return;
            }
            if (!mutedUsers.has(roomId)) mutedUsers.set(roomId, new Set());
            mutedUsers.get(roomId)!.add(targetUserId);

            const roomSockets = io.sockets.adapter.rooms.get(roomId);
            if (roomSockets) {
                for (const socketId of roomSockets) {
                    const s = io.sockets.sockets.get(socketId);
                    if (s && s.handshake.auth.userId === targetUserId) {
                        s.emit("muted", "You have been muted");
                    }
                }
            }
            io.to(roomId).emit("user-muted", { userId: targetUserId });
        });

        socket.on("unmute-user", ({ roomId, targetUserId }) => {
            const config = roomConfigs.get(roomId);
            if (!config || config.creatorId !== userId) {
                socket.emit("error", "Unauthorized");
                return;
            }
            if (mutedUsers.has(roomId)) {
                mutedUsers.get(roomId)!.delete(targetUserId);
                const roomSockets = io.sockets.adapter.rooms.get(roomId);
                if (roomSockets) {
                    for (const socketId of roomSockets) {
                        const s = io.sockets.sockets.get(socketId);
                        if (s && s.handshake.auth.userId === targetUserId) {
                            s.emit("unmuted", "You have been unmuted");
                        }
                    }
                }
                io.to(roomId).emit("user-unmuted", { userId: targetUserId });
            }
        });

        socket.on("update-room-settings", async ({ roomId, limit, password }) => {
            const config = roomConfigs.get(roomId);
            if (!config || config.creatorId !== userId) {
                socket.emit("error", "Unauthorized");
                return;
            }
            if (limit) {
                config.limit = limit;
                roomLimits.set(roomId, limit);
            }
            if (password !== undefined) {
                if (password === "") {
                    config.passwordHash = undefined;
                } else {
                    config.passwordHash = await bcrypt.hash(password, 10);
                }
            }
            const users = roomUsers.get(roomId);
            io.to(roomId).emit("room-info", { count: users ? users.size : 0, limit: config.limit });
        });

        socket.on("send-message", (data) => {
            const userId = socket.handshake.auth.userId;
            const muted = mutedUsers.get(data.roomId);
            if (muted && muted.has(userId)) {
                socket.emit("error", "You are muted");
                return;
            }
            if (dev) console.log("Received send-message. MessageId:", data.messageId, "Room:", data.roomId, "Sender:", data.senderId);
            socket.to(data.roomId).emit("receive-message", data);
            if (dev) console.log("Broadcasted receive-message to room:", data.roomId);
        });

        socket.on("message-delivered", (data) => {
            if (dev) console.log("Received message-delivered:", data, "Broadcasting to room:", data.roomId);
            io.to(data.roomId).emit("message-status", {
                messageId: data.messageId,
                status: "delivered",
                recipientId: data.recipientId,
                originalSenderId: data.senderId
            });
            if (dev) console.log("Broadcasted message-status (delivered) to room", data.roomId);
        });

        socket.on("message-read", (data) => {
            if (dev) console.log("Received message-read:", data, "Broadcasting to room:", data.roomId);
            io.to(data.roomId).emit("message-status", {
                messageId: data.messageId,
                status: "read",
                recipientId: data.recipientId,
                originalSenderId: data.senderId
            });
            if (dev) console.log("Broadcasted message-status (read) to room", data.roomId);
        });

        socket.on("message-reaction", (data: { roomId: string; messageId: string; reaction: string; senderId: string }) => {
            socket.to(data.roomId).emit("message-reaction-update", data);
        });

        socket.on("signal", (data) => {
            io.to(data.target).emit("signal", {
                sender: socket.id,
                signal: data.signal,
            });
        });

        socket.on("typing-start", ({ roomId }) => {
            const nickname = socketNicknames.get(socket.id) || `User ${socket.id.slice(0, 4)}`;
            socket.to(roomId).emit("user-typing", { socketId: socket.id, nickname });
        });

        socket.on("typing-stop", ({ roomId }) => {
            socket.to(roomId).emit("user-stopped-typing", { socketId: socket.id });
        });

        socket.on("disconnecting", () => {
            for (const roomId of socket.rooms) {
                if (roomId !== socket.id) {
                    // Handle Call Disconnect
                    if (callParticipants.has(roomId)) {
                        callParticipants.get(roomId)!.delete(socket.id);
                        if (callParticipants.get(roomId)!.size === 0) {
                            callParticipants.delete(roomId);
                        }
                        socket.to(roomId).emit("user-disconnected-from-call", { socketId: socket.id });
                    }

                    const users = roomUsers.get(roomId);
                    if (users) {
                        const currentCount = users.get(userId) || 0;
                        if (currentCount > 1) {
                            users.set(userId, currentCount - 1);
                        } else {
                            users.delete(userId);
                            if (users.size === 0) {
                                roomUsers.delete(roomId);
                                roomLimits.delete(roomId);
                                roomConfigs.delete(roomId);
                                mutedUsers.delete(roomId);
                            }
                        }
                        socket.to(roomId).emit("user-left", { socketId: socket.id, userId });
                        socketNicknames.delete(socket.id);
                        io.to(roomId).emit("room-info", { count: users.size });
                    }
                }
            }
        });

        socket.on("disconnect", () => {
            if (dev) console.log("Client disconnected:", socket.id);
        });
    });

    httpServer
        .once("error", (err) => {
            console.error(err);
            process.exit(1);
        })
        .listen(port, () => {
            console.log(`> Ready on http://${hostname}:${port}`);
        });
});
