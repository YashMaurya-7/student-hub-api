// backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Base64 images ke liye

// ===== PORT =====
const PORT = process.env.PORT || 5000;

// ===== JWT SECRET =====
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_123";

// ===== DATABASE CONNECTION =====
// ⚠️ IMPORTANT: Isme apna MONGODB_URI daalo (environment variable se ya direct)
const DB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://yashmaurya0071_db_user:NicikZKOn8NePhX7@studentresourcehub.yruinrf.mongodb.net/?appName=StudentResourceHub";

mongoose
  .connect(DB_URI)
  .then(() => console.log("✅ Database connected successfully!"))
  .catch((err) => console.log("❌ Database error:", err));

// ============================================================
// ========== SCHEMAS ==========
// ============================================================

// 1. USER SCHEMA
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

// 2. RESOURCE SCHEMA (userId added to track who uploaded)
const resourceSchema = new mongoose.Schema(
  {
    id: String,
    title: String,
    type: String,
    price: Number,
    condition: String,
    description: String,
    image: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Track uploader
  },
  { timestamps: true },
);

const Resource = mongoose.model("Resource", resourceSchema);

// ============================================================
// ========== MIDDLEWARE: AUTHENTICATE TOKEN ==========
// ============================================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

  if (!token) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token." });
    }
    req.user = user; // { id, email } store kar lo
    next();
  });
};

// ============================================================
// ========== ROOT ROUTE ==========
// ============================================================

app.get("/", (req, res) => {
  res.send("🚀 Student Resource Hub API with Auth is running!");
});

// ============================================================
// ========== AUTH ROUTES ==========
// ============================================================

// ----- SIGNUP -----
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    res.status(201).json({ message: "User created successfully!" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ----- LOGIN -----
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ============================================================
// ========== RESOURCE ROUTES ==========
// ============================================================

// ----- GET ALL RESOURCES (PUBLIC) -----
app.get("/api/resources", async (req, res) => {
  try {
    const resources = await Resource.find().sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ----- POST NEW RESOURCE (PROTECTED) -----
app.post("/api/resources", authenticateToken, async (req, res) => {
  try {
    const newResource = new Resource({
      ...req.body,
      userId: req.user.id, // Track who uploaded
    });
    const savedResource = await newResource.save();
    res.status(201).json(savedResource);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(400).json({ message: err.message });
  }
});

// ----- DELETE RESOURCE (PROTECTED) -----
app.delete("/api/resources/:id", authenticateToken, async (req, res) => {
  try {
    const deleted = await Resource.findOneAndDelete({ id: req.params.id });
    if (!deleted) {
      return res.status(404).json({ message: "Resource not found" });
    }
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== SERVER START ==========
// ============================================================

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
