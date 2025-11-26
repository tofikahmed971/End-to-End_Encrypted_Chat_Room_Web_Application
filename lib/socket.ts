import { io } from "socket.io-client";

// "undefined" means the URL will be computed from the `window.location` object
const URL = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;

export const socket = io(URL, {
    autoConnect: false,
});
