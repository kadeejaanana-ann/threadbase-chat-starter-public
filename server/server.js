import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { createServer } from "http";
import { Server } from "socket.io";
import { verifyToken } from "./middleware/auth.js";

const app = express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// Demo users - log in as either to test chat in two windows.
const USERS = [
  {
    userId: 1,
    name: "Ada",
    email: "ada@threadbase.dev",
    password: "password",
  },
  {
    userId: 2,
    name: "Linus",
    email: "linus@threadbase.dev",
    password: "password",
  },
];

// POST /auth/login -> { accessToken, user }
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body ?? {};

  const found = USERS.find(
    (u) => u.email === email && u.password === password
  );

  if (!found) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = jwt.sign(
    { userId: found.userId, name: found.name },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({
    accessToken,
    user: {
      userId: found.userId,
      name: found.name,
    },
  });
});

// A normal protected route
app.get("/api/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

// Create HTTP server from Express
const httpServer = createServer(app);

// Attach Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

// Socket authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("No token provided"));
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    socket.data.user = payload;

    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

// Socket connections
io.on("connection", (socket) => {
  // Join a thread's chat room
  socket.on("room:join", (roomId) => {
    socket.join(roomId);
  });

  // Send a chat message
  socket.on("chat:message", ({ roomId, text }) => {
    const message = {
      id: crypto.randomUUID(),
      text,
      user: socket.data.user.name,
      at: Date.now(),
    };

    io.to(roomId).emit("chat:message", message);
  });
});

const PORT = process.env.PORT ?? 3001;

httpServer.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
  console.log("  POST /auth/login");
  console.log("  Socket.io: ready");
});