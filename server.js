// backend/server.js
const http = require("http");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const compression = require("compression");
const { Server } = require("socket.io");
require("dotenv").config();
const aiRecommender = require("./aiRecommender");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

app.use(compression());
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

app.use((req, res, next) => {
  if (req.url && req.url.startsWith("/api/")) {
    console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  }
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET || "super_secret_jwt_key_student_hub_2026_x99";
const ADMIN_SECRET_KEY =
  process.env.ADMIN_SECRET_KEY || "admin_hub_secret_2026";

const DB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://yashmaurya0071_db_user:NicikZKOn8NePhX7@studentresourcehub.yruinrf.mongodb.net/?appName=StudentResourceHub";

mongoose
  .connect(DB_URI)
  .then(() => console.log("✅ Database connected successfully!"))
  .catch((err) => console.error("❌ Database connection error:", err));

// ============================================================
// ========== EMAIL CONFIGURATION ==========
// ============================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.log(`[Email Mock] To: ${to} | Subject: ${subject}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("Resend email error:", response.status, detail);
  }
}

// ============================================================
// ========== SCHEMAS ==========
// ============================================================

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "" },
    college: { type: String, default: "" },
    phone: { type: String, default: "" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isBlocked: { type: Boolean, default: false },
    wishlist: { type: [String], default: [] },
    resetPasswordOTP: { type: String },
    resetPasswordExpires: { type: Date },
    // Verified Seller Membership
    isVerifiedSeller: { type: Boolean, default: false },
    membershipStatus: {
      type: String,
      enum: ["inactive", "active", "expired", "cancelled"],
      default: "inactive",
    },
    membershipPlan: { type: String, default: "" },
    membershipPrice: { type: Number, default: 99 },
    membershipStartDate: { type: Date },
    membershipExpiryDate: { type: Date },
    paymentId: { type: String, default: "" },
    autoRenew: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

// ============================================================
// ========== OWNER ADMIN INITIALIZATION ==========
// ============================================================
async function initOwnerAdminAccount() {
  try {
    const adminEmail = (
      process.env.ADMIN_EMAIL || "admin@eduresourcemine.com"
    )
      .toLowerCase()
      .trim();
    const adminPassword = process.env.ADMIN_PASSWORD || "AdminPass2026!";
    const adminName = process.env.ADMIN_NAME || "eduResourceMine Admin";

    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      adminUser = new User({
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: "admin",
        isBlocked: false,
      });
      await adminUser.save();
      console.log(`👑 Initialized Owner Admin account: ${adminEmail}`);
    } else {
      let changed = false;
      if (adminUser.role !== "admin") {
        adminUser.role = "admin";
        changed = true;
      }
      if (adminUser.isBlocked) {
        adminUser.isBlocked = false;
        changed = true;
      }
      if (changed) {
        await adminUser.save();
        console.log(`👑 Updated account role to admin: ${adminEmail}`);
      } else {
        console.log(`👑 Owner Admin account verified: ${adminEmail}`);
      }
    }
    await seedStarterResources();
  } catch (err) {
    console.error("⚠️ Failed to initialize owner admin account:", err.message);
  }
}

async function seedStarterResources() {
  try {
    const mlCount = await Resource.countDocuments({
      $or: [{ subject: "Machine Learning" }, { title: /Machine Learning/i }],
    });
    if (mlCount === 0) {
      const adminUser = await User.findOne({ role: "admin" });
      const ownerId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();

      const starters = [
        {
          id: "res_ml_complete_notes",
          title: "Machine Learning Complete Notes",
          type: "note",
          subject: "Machine Learning",
          price: 0,
          condition: "Digital Edition",
          description:
            "Comprehensive, beginner-friendly Machine Learning notes covering Regression, Classification, Decision Trees, and Neural Networks. Perfect for beginner students and exam preparation.",
          image:
            "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=500&auto=format&fit=crop&q=60",
          userId: ownerId,
          semester: "Semester 3",
          branch: "AI & DS",
          university: "SPPU",
          difficulty: "Beginner",
          tags: ["Machine Learning", "Notes", "SPPU", "AI & DS", "Beginner", "Exam Prep"],
          views: 142,
          downloads: 48,
          isFeatured: true,
          status: "approved",
        },
        {
          id: "res_ml_imp_questions",
          title: "Machine Learning Important Questions",
          type: "question_bank",
          subject: "Machine Learning",
          price: 0,
          condition: "Digital Edition",
          description:
            "Curated high-weightage question bank with step-by-step solutions for frequent university exam topics in SPPU AI & DS.",
          image:
            "https://images.unsplash.com/photo-1517842645767-c639042777db?w=500&auto=format&fit=crop&q=60",
          userId: ownerId,
          semester: "Semester 3",
          branch: "AI & DS",
          university: "SPPU",
          difficulty: "Beginner",
          tags: ["Machine Learning", "Question Bank", "Important Questions", "SPPU", "AI & DS"],
          views: 110,
          downloads: 39,
          isFeatured: true,
          status: "approved",
        },
        {
          id: "res_ml_pyqs",
          title: "Machine Learning Previous Year Questions",
          type: "pyq",
          subject: "Machine Learning",
          price: 0,
          condition: "Digital Edition",
          description:
            "Last 5 years solved university PYQ question papers with step-by-step answers and marking schemes for SPPU AI & DS Semester 3.",
          image:
            "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=500&auto=format&fit=crop&q=60",
          userId: ownerId,
          semester: "Semester 3",
          branch: "AI & DS",
          university: "SPPU",
          difficulty: "Beginner",
          tags: ["Machine Learning", "PYQ", "Previous Year Questions", "SPPU", "Past Papers"],
          views: 198,
          downloads: 75,
          isFeatured: true,
          status: "approved",
        },
        {
          id: "res_dsa_sppu_notes",
          title: "SPPU AI & DS Semester 3 DSA Material",
          type: "note",
          subject: "Data Structures",
          price: 0,
          condition: "Digital Edition",
          description:
            "Beginner-friendly comprehensive Data Structures and Algorithms material tailored for SPPU AI & DS syllabus. Covers arrays, linked lists, trees, and graphs.",
          image:
            "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=500&auto=format&fit=crop&q=60",
          userId: ownerId,
          semester: "Semester 3",
          branch: "AI & DS",
          university: "SPPU",
          difficulty: "Beginner",
          tags: ["Data Structures", "DSA", "SPPU", "AI & DS", "Semester 3", "Study Material"],
          views: 220,
          downloads: 90,
          isFeatured: true,
          status: "approved",
        },
      ];

      await Resource.insertMany(starters);
      console.log("📚 Seeded starter educational resources for AI recommendation!");
    }
  } catch (err) {
    console.error("⚠️ Error seeding starter resources:", err.message);
  }
}

if (mongoose.connection.readyState === 1) {
  initOwnerAdminAccount();
} else {
  mongoose.connection.once("open", () => {
    initOwnerAdminAccount();
  });
}

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: { type: String, required: true, unique: true },
    paymentId: { type: String, default: "" },
    signature: { type: String, default: "" },
    amount: { type: Number, required: true }, // in INR
    currency: { type: String, default: "INR" },
    planId: { type: String, default: "monthly" },
    status: {
      type: String,
      enum: ["created", "success", "failed", "cancelled"],
      default: "created",
    },
    paymentMethod: { type: String, default: "UPI / Card" },
    receipt: { type: String, default: "" },
  },
  { timestamps: true },
);

const Payment = mongoose.model("Payment", paymentSchema);

const resourceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, required: true },
    subject: { type: String, default: "General", trim: true },
    price: { type: Number, required: true, min: 0 },
    condition: { type: String, required: true },
    description: { type: String, default: "" },
    image: { type: String, required: true },
    images: { type: [String], default: [] },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    views: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    isSold: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    semester: { type: String, default: "Semester 1", trim: true },
    branch: { type: String, default: "General", trim: true },
    university: { type: String, default: "", trim: true },
    difficulty: { type: String, default: "Beginner", trim: true },
    tags: { type: [String], default: [] },
    topics: { type: [String], default: [] },
    fileUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      default: "approved",
    },
  },
  { timestamps: true },
);

const Resource = mongoose.model("Resource", resourceSchema);

const reportSchema = new mongoose.Schema(
  {
    resourceId: { type: String, required: true },
    resourceTitle: { type: String, default: "" },
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    details: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "resolved", "dismissed"],
      default: "pending",
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

const Report = mongoose.model("Report", reportSchema);

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

const Setting = mongoose.model("Setting", settingSchema);

async function getSetting(key, defaultValue) {
  try {
    const s = await Setting.findOne({ key });
    return s ? s.value : defaultValue;
  } catch (err) {
    return defaultValue;
  }
}

const messageSchema = new mongoose.Schema(
  {
    resourceId: { type: String, required: true },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const Message = mongoose.model("Message", messageSchema);

const reviewSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    resourceId: { type: String, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

const Review = mongoose.model("Review", reviewSchema);

const offerSchema = new mongoose.Schema(
  {
    resourceId: { type: String, required: true },
    resourceTitle: { type: String, default: "" },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    offeredPrice: { type: Number, required: true },
    originalPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    message: { type: String, default: "" },
  },
  { timestamps: true },
);

const Offer = mongoose.model("Offer", offerSchema);

// Optimized MongoDB Database Indexes for High-Speed Queries
resourceSchema.index({ createdAt: -1 });
resourceSchema.index({ status: 1, createdAt: -1 });
resourceSchema.index({ userId: 1, createdAt: -1 });
resourceSchema.index({ type: 1, subject: 1 });
resourceSchema.index({ isFeatured: 1 });
resourceSchema.index({ semester: 1, branch: 1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ resourceId: 1 });
messageSchema.index({ senderId: 1, receiverId: 1, resourceId: 1, createdAt: 1 });
messageSchema.index({ receiverId: 1, read: 1 });
reviewSchema.index({ sellerId: 1, createdAt: -1 });
offerSchema.index({ sellerId: 1, createdAt: -1 });
offerSchema.index({ buyerId: 1, createdAt: -1 });

// ============================================================
// ========== MIDDLEWARE ==========
// ============================================================

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token)
    return res.status(401).json({ message: "Access denied. Token missing." });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err)
      return res.status(403).json({ message: "Invalid or expired token." });

    try {
      const user = await User.findById(decoded.id).select(
        "name email role isBlocked",
      );
      if (!user) return res.status(401).json({ message: "User not found." });
      if (user.isBlocked) {
        return res
          .status(403)
          .json({ message: "Your account has been blocked by the admin." });
      }
      req.user = {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role || "user",
      };
      next();
    } catch (dbErr) {
      return res.status(500).json({ message: "Auth validation error" });
    }
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
};

// ============================================================
// ========== REAL-TIME SOCKET.IO NOTIFICATIONS & MESSAGING ==========
// ============================================================

io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    socket.handshake.query?.token ||
    socket.handshake.headers?.authorization?.split(" ")[1];

  if (!token) {
    return next(new Error("Authentication token required"));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  const userRoom = `user_${socket.userId}`;
  socket.join(userRoom);

  socket.on("join_conversation", ({ partnerId, resourceId }) => {
    if (partnerId && resourceId) {
      const convRoom =
        [socket.userId, partnerId].sort().join("_") + `_${resourceId}`;
      socket.join(convRoom);
    }
  });

  socket.on("leave_conversation", ({ partnerId, resourceId }) => {
    if (partnerId && resourceId) {
      const convRoom =
        [socket.userId, partnerId].sort().join("_") + `_${resourceId}`;
      socket.leave(convRoom);
    }
  });
});

// Helper to broadcast real-time unread notifications to a specific user
async function emitUnreadCount(userId) {
  if (!userId) return;
  try {
    const count = await Message.countDocuments({
      receiverId: userId,
      read: false,
    });
    io.to(`user_${userId}`).emit("unread_count_update", { unreadCount: count });
  } catch (err) {
    console.error("Error emitting unread count:", err);
  }
}

// ============================================================
// ========== ROOT & HEALTH ==========
// ============================================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "🚀 eduResourceMine API is running!",
    version: "2.0.0",
  });
});

// ============================================================
// ========== AUTH ROUTES ==========
// ============================================================

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password, adminKey } = req.body;
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are required." });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existingUser) {
      return res.status(400).json({ message: "Email is already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const role = adminKey && adminKey === ADMIN_SECRET_KEY ? "admin" : "user";

    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role,
    });
    await newUser.save();

    res.status(201).json({
      message: `Account created successfully! ${role === "admin" ? "(Admin privileges granted)" : ""}`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user)
      return res.status(400).json({ message: "Invalid email or password." });

    if (user.isBlocked) {
      return res
        .status(403)
        .json({
          message: "This account has been blocked by an administrator.",
        });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password." });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || "user",
        avatar: user.avatar || "",
        bio: user.bio || "",
        college: user.college || "",
        phone: user.phone || "",
        isVerifiedSeller: isUserVerifiedSeller(user),
        membershipStatus: user.membershipStatus || "inactive",
        membershipPlan: user.membershipPlan || "",
        membershipExpiryDate: user.membershipExpiryDate || null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Admin email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res
        .status(401)
        .json({ message: "Invalid administrator credentials." });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "This administrator account has been blocked.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Invalid administrator credentials." });
    }

    // STRICT ADMIN ROLE CHECK: Non-admin users are rejected with 403 Forbidden
    if (user.role !== "admin") {
      return res.status(403).json({
        message:
          "Access Denied: This account does not have administrator privileges.",
      });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || "",
        bio: user.bio || "",
        college: user.college || "",
        phone: user.phone || "",
        isVerifiedSeller: isUserVerifiedSeller(user),
        membershipStatus: user.membershipStatus || "inactive",
      },
      message: "Admin authentication successful.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    // Auto-check expiry
    if (user.membershipExpiryDate && new Date() > new Date(user.membershipExpiryDate)) {
      if (user.isVerifiedSeller || user.membershipStatus === "active") {
        user.isVerifiedSeller = false;
        user.membershipStatus = "expired";
        await user.save();
      }
    }

    const userObj = user.toObject();
    userObj.isVerifiedSeller = isUserVerifiedSeller(user);
    res.json(userObj);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/users/profile", authenticateToken, async (req, res) => {
  try {
    const { name, bio, college, phone, avatar } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name.trim();
    if (bio !== undefined) user.bio = bio.trim();
    if (college !== undefined) user.college = college.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    res.json({
      message: "Profile updated successfully!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        college: user.college,
        phone: user.phone,
        isVerifiedSeller: isUserVerifiedSeller(user),
        membershipStatus: user.membershipStatus || "inactive",
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "name email avatar bio college isVerifiedSeller membershipStatus membershipExpiryDate createdAt",
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    const userObj = user.toObject();
    userObj.isVerifiedSeller = isUserVerifiedSeller(user);

    const listings = await Resource.find({
      userId: user._id,
      status: "approved",
    }).sort({
      createdAt: -1,
    });
    const reviews = await Review.find({ sellerId: user._id }).populate(
      "reviewerId",
      "name avatar",
    );

    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = reviews.length
      ? (totalRating / reviews.length).toFixed(1)
      : "0.0";

    res.json({
      user,
      listings,
      reviews,
      avgRating: parseFloat(avgRating),
      reviewCount: reviews.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== FORGOT / RESET PASSWORD ==========
// ============================================================

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email });
    if (!user)
      return res
        .status(404)
        .json({ message: "User with this email not found." });

    const otp = crypto.randomInt(100000, 1000000).toString();
    const expires = Date.now() + 10 * 60 * 1000;
    const hashedOTP = await bcrypt.hash(otp, 10);
    user.resetPasswordOTP = hashedOTP;
    user.resetPasswordExpires = expires;
    await user.save();

    let emailSent = false;
    try {
      await sendEmail({
        to: email,
        subject: "Password Reset OTP - eduResourceMine",
        text: `Your OTP is ${otp}. Valid for 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background:#0f172a; color:#ffffff;">
            <h2 style="color: #14b8a6;">Password Reset OTP</h2>
            <p>Hi ${user.name},</p>
            <p>Your OTP is: <strong style="font-size: 28px; color: #14b8a6;">${otp}</strong></p>
            <p style="margin-top:14px; font-size: 0.9rem; color:#94a3b8;">Valid for <strong>10 minutes</strong>.</p>
          </div>
        `,
      });
      emailSent = true;
    } catch (emailErr) {
      console.warn(
        "Email send failed, providing OTP in response for development.",
      );
    }

    res.json({
      message: "OTP generated successfully!",
      emailSent,
      otp: !RESEND_API_KEY ? otp : undefined,
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Could not create password-reset OTP." });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email?.trim().toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (
      !user.resetPasswordOTP ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < Date.now()
    ) {
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }
    const isValid = await bcrypt.compare(otp, user.resetPasswordOTP);
    if (!isValid) return res.status(400).json({ message: "Invalid OTP code." });
    res.json({ message: "OTP verified successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email: email?.trim().toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (
      !user.resetPasswordOTP ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < Date.now()
    ) {
      return res.status(400).json({ message: "OTP has expired." });
    }
    const isValid = await bcrypt.compare(otp, user.resetPasswordOTP);
    if (!isValid) return res.status(400).json({ message: "Invalid OTP code." });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successfully! You can now log in." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== VERIFIED SELLER MEMBERSHIP & PAYMENT ==========
// ============================================================

const PAYMENT_SECRET =
  process.env.PAYMENT_SECRET || "edu_verified_membership_secret_2026_x99";

const MEMBERSHIP_PLANS = {
  monthly: {
    id: "monthly",
    name: "Verified Seller Monthly",
    price: 99, // ₹99 / month
    currency: "INR",
    durationDays: 30,
    features: [
      "Verified Seller badge",
      "Verified label on seller profile",
      "Verified label on seller's uploaded resources",
      "Better visibility for resources",
      "Priority placement in relevant resource listings",
      "Seller analytics",
      "Priority support",
    ],
  },
};

function isUserVerifiedSeller(user) {
  if (!user) return false;
  if (!user.isVerifiedSeller) return false;
  if (
    user.membershipExpiryDate &&
    new Date() > new Date(user.membershipExpiryDate)
  ) {
    return false;
  }
  return (
    user.membershipStatus === "active" || user.membershipStatus === "cancelled"
  );
}

function generatePaymentSignature(orderId, paymentId) {
  return crypto
    .createHmac("sha256", PAYMENT_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

// 1. Create Membership Order
app.post("/api/membership/create-order", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    const plan = MEMBERSHIP_PLANS.monthly;
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(4).toString("hex");
    const orderId = `order_${timestamp}_${randomHex}`;

    const payment = new Payment({
      userId: user._id,
      orderId,
      amount: plan.price,
      currency: plan.currency,
      planId: plan.id,
      status: "created",
      receipt: `RCPT-${timestamp.toString().slice(-6)}`,
    });
    await payment.save();

    res.json({
      orderId,
      amount: plan.price,
      currency: plan.currency,
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        features: plan.features,
      },
      key: process.env.RAZORPAY_KEY_ID || "rzp_test_edu_resource_mine",
      mode: process.env.RAZORPAY_KEY_ID ? "live" : "sandbox",
    });
  } catch (err) {
    console.error("Create membership order error:", err);
    res.status(500).json({ message: "Failed to create membership order." });
  }
});

// 2. Gateway Simulator for Test/Sandbox (Generates authentic cryptographic signature)
app.post(
  "/api/membership/simulate-payment",
  authenticateToken,
  async (req, res) => {
    try {
      const { orderId, paymentMethod } = req.body;
      const payment = await Payment.findOne({
        orderId,
        userId: req.user.id,
        status: "created",
      });

      if (!payment) {
        return res
          .status(400)
          .json({ message: "Invalid or expired order for simulation." });
      }

      const paymentId = `pay_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const signature = generatePaymentSignature(orderId, paymentId);

      res.json({
        orderId,
        paymentId,
        signature,
        paymentMethod: paymentMethod || "UPI",
        status: "simulated_success",
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 3. Verify Payment & Activate Membership (Server-Side Validation)
app.post(
  "/api/membership/verify-payment",
  authenticateToken,
  async (req, res) => {
    try {
      const { orderId, paymentId, signature, paymentMethod } = req.body;

      if (!orderId || !paymentId || !signature) {
        return res
          .status(400)
          .json({ message: "Order ID, Payment ID, and Signature are required." });
      }

      const payment = await Payment.findOne({
        orderId,
        userId: req.user.id,
        status: "created",
      });

      if (!payment) {
        return res
          .status(400)
          .json({ message: "Order not found or has already been processed." });
      }

      // Cryptographic signature validation
      let isSignatureValid = false;
      if (process.env.RAZORPAY_KEY_SECRET) {
        const expected = crypto
          .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
          .update(`${orderId}|${paymentId}`)
          .digest("hex");
        isSignatureValid = expected === signature;
      } else {
        const expected = generatePaymentSignature(orderId, paymentId);
        isSignatureValid = expected === signature;
      }

      if (!isSignatureValid) {
        payment.status = "failed";
        await payment.save();
        return res.status(400).json({
          message:
            "Payment verification failed: Invalid cryptographic payment signature.",
        });
      }

      // Mark payment as successful
      payment.status = "success";
      payment.paymentId = paymentId;
      payment.signature = signature;
      payment.paymentMethod = paymentMethod || "UPI / Card";
      await payment.save();

      // Activate User Membership
      const user = await User.findById(req.user.id);
      const now = new Date();
      let startDate = now;
      let expiryDate;

      // Extend if user is already verified and has remaining time
      if (
        user.membershipExpiryDate &&
        new Date(user.membershipExpiryDate) > now
      ) {
        startDate = user.membershipStartDate || now;
        expiryDate = new Date(
          new Date(user.membershipExpiryDate).getTime() + 30 * 24 * 60 * 60 * 1000,
        );
      } else {
        expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      user.isVerifiedSeller = true;
      user.membershipStatus = "active";
      user.membershipPlan = "monthly";
      user.membershipPrice = 99;
      user.membershipStartDate = startDate;
      user.membershipExpiryDate = expiryDate;
      user.paymentId = paymentId;
      user.autoRenew = true;
      await user.save();

      const sanitizedUser = user.toObject();
      delete sanitizedUser.password;

      res.json({
        success: true,
        message: "Congratulations! You are now a Verified Seller.",
        isVerifiedSeller: true,
        user: sanitizedUser,
        membership: {
          status: user.membershipStatus,
          plan: user.membershipPlan,
          price: user.membershipPrice,
          startDate: user.membershipStartDate,
          expiryDate: user.membershipExpiryDate,
          validUntil: user.membershipExpiryDate,
          paymentId: user.paymentId,
        },
      });
    } catch (err) {
      console.error("Verify payment error:", err);
      res.status(500).json({ message: "Server error during payment verification." });
    }
  },
);

// 4. Get Membership Status
app.get("/api/membership/status", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found." });

    const now = new Date();
    // Expiry check
    if (user.membershipExpiryDate && now > new Date(user.membershipExpiryDate)) {
      if (user.isVerifiedSeller || user.membershipStatus === "active") {
        user.isVerifiedSeller = false;
        user.membershipStatus = "expired";
        await user.save();
      }
    }

    const isVerified = isUserVerifiedSeller(user);
    const plan = MEMBERSHIP_PLANS.monthly;

    res.json({
      isVerifiedSeller: isVerified,
      isVerified: isVerified,
      membershipStatus: user.membershipStatus || "inactive",
      status: user.membershipStatus || "inactive",
      membershipPlan: user.membershipPlan || "monthly",
      plan: user.membershipPlan || "monthly",
      membershipPrice: user.membershipPrice || 99,
      price: user.membershipPrice || 99,
      membershipStartDate: user.membershipStartDate || null,
      membershipExpiryDate: user.membershipExpiryDate || null,
      expiryDate: user.membershipExpiryDate || null,
      autoRenew: user.autoRenew || false,
      paymentId: user.paymentId || "",
      planDetails: {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        features: plan.features,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 5. Cancel Membership (Retains verified status until expiry date)
app.post("/api/membership/cancel", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    if (user.membershipStatus !== "active") {
      return res
        .status(400)
        .json({ message: "No active membership to cancel." });
    }

    user.membershipStatus = "cancelled";
    user.autoRenew = false;
    await user.save();

    const sanitizedUser = user.toObject();
    delete sanitizedUser.password;

    res.json({
      success: true,
      message:
        "Your membership renewal has been cancelled. You will remain a Verified Seller until your current paid period ends.",
      status: "cancelled",
      validUntil: user.membershipExpiryDate,
      user: sanitizedUser,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 6. Payment History
app.get("/api/membership/history", authenticateToken, async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .select("orderId paymentId amount currency planId status paymentMethod receipt createdAt");

    res.json({ success: true, payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== WISHLIST ==========
// ============================================================

app.get("/api/wishlist", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const savedIds = user.wishlist || [];
    const resources = await Resource.find({ id: { $in: savedIds } })
      .populate("userId", "name email avatar")
      .sort({ createdAt: -1 });

    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/wishlist/ids", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("wishlist");
    res.json(user ? user.wishlist : []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/wishlist/:id", authenticateToken, async (req, res) => {
  try {
    const resourceId = req.params.id;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const existsIndex = user.wishlist.indexOf(resourceId);
    let isSaved = false;

    if (existsIndex > -1) {
      user.wishlist.splice(existsIndex, 1);
      isSaved = false;
    } else {
      user.wishlist.push(resourceId);
      isSaved = true;
    }

    await user.save();
    res.json({
      saved: isSaved,
      message: isSaved ? "Added to your wishlist!" : "Removed from wishlist.",
      wishlist: user.wishlist,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== RESOURCE ROUTES ==========
// ============================================================

// Lightweight in-memory catalog cache for near-instant resource loading (< 5ms)
let resourceCatalogCache = {
  data: null,
  timestamp: 0,
  ttl: 30000, // 30 seconds TTL
};

function invalidateResourceCache() {
  resourceCatalogCache.data = null;
  resourceCatalogCache.timestamp = 0;
}

app.get("/api/resources", async (req, res) => {
  try {
    const now = Date.now();
    if (
      resourceCatalogCache.data &&
      now - resourceCatalogCache.timestamp < resourceCatalogCache.ttl
    ) {
      res.set("Cache-Control", "public, max-age=5, stale-while-revalidate=30");
      return res.json(resourceCatalogCache.data);
    }

    const filter = { status: { $ne: "rejected" } };
    // Project only necessary fields (exclude full gallery images and large fileUrls from initial list view to drastically reduce payload size)
    const resources = await Resource.find(filter)
      .select("-images -fileUrl")
      .populate(
        "userId",
        "name email avatar college isVerifiedSeller membershipStatus membershipExpiryDate",
      )
      .sort({ createdAt: -1 })
      .lean();

    // Controlled Priority Placement: Active verified sellers' listings receive transparent priority tier
    resources.sort((a, b) => {
      const aVerified = isUserVerifiedSeller(a.userId);
      const bVerified = isUserVerifiedSeller(b.userId);

      if (aVerified && !bVerified) return -1;
      if (!aVerified && bVerified) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    resourceCatalogCache.data = resources;
    resourceCatalogCache.timestamp = now;

    res.set("Cache-Control", "public, max-age=5, stale-while-revalidate=30");
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/resources/:id", async (req, res) => {
  try {
    const resource = await Resource.findOneAndUpdate(
      { id: req.params.id },
      { $inc: { views: 1 } },
      { new: true },
    ).populate(
      "userId",
      "name email avatar college isVerifiedSeller membershipStatus membershipExpiryDate",
    );

    if (!resource)
      return res.status(404).json({ message: "Resource not found" });
    res.json(resource);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/auth/me/listings", authenticateToken, async (req, res) => {
  try {
    const resources = await Resource.find({ userId: req.user.id })
      .populate("userId", "name email avatar")
      .sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/resources", authenticateToken, async (req, res) => {
  try {
    const {
      id,
      title,
      type,
      subject,
      price,
      condition,
      description,
      image,
      images,
    } = req.body;

    if (!title || !type || price === undefined || !condition) {
      return res
        .status(400)
        .json({ message: "Title, type, price, and condition are required." });
    }

    const coverImage =
      image || (Array.isArray(images) && images.length ? images[0] : null);
    if (!coverImage) {
      return res
        .status(400)
        .json({ message: "Please upload a Cover Photo for your resource." });
    }

    let galleryImages = [];
    if (Array.isArray(images) && images.length) {
      galleryImages = images;
    } else {
      galleryImages = [coverImage];
    }

    const manualApproval = await getSetting("manualApprovalRequired", true);
    const initialStatus =
      req.user.role === "admin" || !manualApproval ? "approved" : "pending";

    const {
      semester,
      branch,
      fileUrl,
      fileName,
    } = req.body;

    const newResource = new Resource({
      id: id || Date.now().toString(),
      title: title.trim(),
      type,
      subject: subject ? String(subject).trim() : "General",
      semester: semester ? String(semester).trim() : "Semester 1",
      branch: branch ? String(branch).trim() : "General",
      price: Number(price),
      condition,
      description: description ? description.trim() : "",
      image: coverImage,
      images: galleryImages,
      fileUrl: fileUrl || "",
      fileName: fileName || "",
      downloads: 0,
      isFeatured: false,
      userId: req.user.id,
      isSold: false,
      status: initialStatus,
    });

    const saved = await newResource.save();
    invalidateResourceCache();
    const populated = await Resource.findById(saved._id).populate(
      "userId",
      "name email avatar",
    );
    res.status(201).json(populated);
  } catch (err) {
    console.error("Create resource error:", err);
    res.status(400).json({ message: err.message });
  }
});

// Download tracking endpoint
app.get("/api/resources/:id/download", async (req, res) => {
  try {
    const resource = await Resource.findOneAndUpdate(
      { id: req.params.id },
      { $inc: { downloads: 1 } },
      { new: true },
    );
    if (!resource)
      return res.status(404).json({ message: "Resource not found" });

    res.json({
      success: true,
      downloads: resource.downloads,
      fileUrl: resource.fileUrl || resource.image,
      fileName: resource.fileName || `${resource.title}.pdf`,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// User resource reporting endpoint
app.post("/api/resources/:id/report", authenticateToken, async (req, res) => {
  try {
    const { reason, details, description } = req.body;
    if (!reason) {
      return res.status(400).json({ message: "Report reason is required." });
    }

    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource)
      return res.status(404).json({ message: "Resource not found" });

    const report = new Report({
      resourceId: resource.id,
      resourceTitle: resource.title,
      reporterId: req.user.id,
      reason,
      details: details ? details.trim() : (description ? description.trim() : ""),
      status: "pending",
    });

    await report.save();
    res.status(201).json({
      success: true,
      message:
        "Report submitted successfully. Our administration team will review it.",
      report,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/resources/:id", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource)
      return res.status(404).json({ message: "Resource not found" });

    if (
      resource.userId.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to edit this resource." });
    }

    const {
      title,
      type,
      subject,
      price,
      condition,
      description,
      image,
      images,
    } = req.body;

    if (title) resource.title = title.trim();
    if (type) resource.type = type;
    if (subject) resource.subject = subject.trim();
    if (price !== undefined) resource.price = Number(price);
    if (condition) resource.condition = condition;
    if (description !== undefined) resource.description = description.trim();
    if (image) resource.image = image;
    if (Array.isArray(images) && images.length > 0) resource.images = images;

    await resource.save();
    invalidateResourceCache();
    const populated = await Resource.findOne({ id: req.params.id }).populate(
      "userId",
      "name email avatar",
    );

    res.json({
      message: "Resource updated successfully!",
      resource: populated,
    });
  } catch (err) {
    console.error("Edit error:", err);
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/resources/:id/mark-sold", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource)
      return res.status(404).json({ message: "Resource not found" });
    if (
      resource.userId.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized." });
    }

    resource.isSold = !resource.isSold;
    await resource.save();
    invalidateResourceCache();
    res.json({
      message: resource.isSold
        ? "Resource marked as Sold!"
        : "Resource marked as Available!",
      isSold: resource.isSold,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/resources/:id", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource)
      return res.status(404).json({ message: "Resource not found" });
    if (
      resource.userId.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized." });
    }

    await Resource.findOneAndDelete({ id: req.params.id });
    await Offer.deleteMany({ resourceId: req.params.id });
    invalidateResourceCache();

    res.json({ message: "Resource deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post(
  "/api/resources/:id/request-buy",
  authenticateToken,
  async (req, res) => {
    try {
      const resource = await Resource.findOne({ id: req.params.id }).populate(
        "userId",
        "name email",
      );
      if (!resource)
        return res.status(404).json({ message: "Resource not found" });
      if (resource.isSold)
        return res.status(400).json({ message: "Resource is already sold!" });

      const buyer = await User.findById(req.user.id);
      const seller = resource.userId;

      if (seller._id.toString() === req.user.id) {
        return res
          .status(400)
          .json({ message: "You cannot request to buy your own resource." });
      }

      try {
        await sendEmail({
          to: seller.email,
          subject: `Purchase Request: ${resource.title}`,
          text: `${buyer.name} (${buyer.email}) wants to buy "${resource.title}" for ₹${resource.price}.`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background:#0f172a; color:#ffffff;">
            <h2 style="color: #14b8a6;">Purchase Request</h2>
            <p><strong>Buyer:</strong> ${buyer.name} (${buyer.email})</p>
            <p><strong>Resource:</strong> ${resource.title}</p>
            <p><strong>Price:</strong> ₹${resource.price}</p>
          </div>
        `,
        });
      } catch (emailError) {}

      const chatMsg = new Message({
        resourceId: resource.id,
        senderId: req.user.id,
        receiverId: seller._id,
        content: `Hi! I'm interested in purchasing "${resource.title}" for ₹${resource.price}. Please let me know how we can coordinate.`,
        read: false,
      });
      await chatMsg.save();

      const populatedChatMsg = await Message.findById(chatMsg._id).populate(
        "senderId",
        "name avatar email",
      );

      // Real-time broadcast notification to the seller in 0ms!
      const sellerUnreadCount = await Message.countDocuments({
        receiverId: seller._id,
        read: false,
      });
      io.to(`user_${seller._id}`).emit("new_message", {
        message: populatedChatMsg,
        unreadCount: sellerUnreadCount,
        resourceId: resource.id,
        senderId: req.user.id,
        senderName: buyer.name,
      });

      res.json({
        message:
          "Purchase request sent! A conversation has been initiated in Messages.",
        sellerId: seller._id,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ============================================================
// ========== REVIEWS ==========
// ============================================================

app.post("/api/reviews", authenticateToken, async (req, res) => {
  try {
    const { sellerId, resourceId, rating, comment } = req.body;

    if (!sellerId || !rating) {
      return res
        .status(400)
        .json({ message: "Seller ID and a 1-5 star rating are required." });
    }

    if (sellerId === req.user.id) {
      return res.status(400).json({ message: "You cannot review yourself." });
    }

    const seller = await User.findById(sellerId);
    if (!seller) return res.status(404).json({ message: "Seller not found." });

    let review = await Review.findOne({
      sellerId,
      reviewerId: req.user.id,
      resourceId,
    });

    if (review) {
      review.rating = Number(rating);
      review.comment = comment ? comment.trim() : "";
      await review.save();
    } else {
      review = new Review({
        sellerId,
        reviewerId: req.user.id,
        resourceId: resourceId || "",
        rating: Number(rating),
        comment: comment ? comment.trim() : "",
      });
      await review.save();
    }

    const populated = await Review.findById(review._id).populate(
      "reviewerId",
      "name avatar",
    );
    res
      .status(201)
      .json({ message: "Review submitted successfully!", review: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/reviews/seller/:sellerId", async (req, res) => {
  try {
    const reviews = await Review.find({ sellerId: req.params.sellerId })
      .populate("reviewerId", "name avatar")
      .sort({ createdAt: -1 });

    const total = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = reviews.length
      ? (total / reviews.length).toFixed(1)
      : "0.0";

    res.json({
      reviews,
      avgRating: parseFloat(avgRating),
      totalReviews: reviews.length,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== OFFERS ==========
// ============================================================

app.post("/api/offers", authenticateToken, async (req, res) => {
  try {
    const { resourceId, offeredPrice, message } = req.body;
    if (!resourceId || offeredPrice === undefined) {
      return res
        .status(400)
        .json({ message: "Resource ID and offered price are required." });
    }

    const resource = await Resource.findOne({ id: resourceId }).populate(
      "userId",
      "name email",
    );
    if (!resource)
      return res.status(404).json({ message: "Resource not found." });

    if (resource.userId._id.toString() === req.user.id) {
      return res
        .status(400)
        .json({ message: "You cannot make an offer on your own resource." });
    }

    const offer = new Offer({
      resourceId: resource.id,
      resourceTitle: resource.title,
      buyerId: req.user.id,
      sellerId: resource.userId._id,
      offeredPrice: Number(offeredPrice),
      originalPrice: resource.price,
      message: message ? message.trim() : "",
      status: "pending",
    });
    await offer.save();

    const offerMsg = new Message({
      resourceId: resource.id,
      senderId: req.user.id,
      receiverId: resource.userId._id,
      content: `Price Offer: Proposed ₹${offeredPrice} (Original: ₹${resource.price})${message ? ` - Note: "${message}"` : ""}`,
    });
    await offerMsg.save();

    res.status(201).json({ message: "Offer submitted successfully!", offer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/offers", authenticateToken, async (req, res) => {
  try {
    const offers = await Offer.find({
      $or: [{ sellerId: req.user.id }, { buyerId: req.user.id }],
    })
      .populate("buyerId", "name email avatar")
      .populate("sellerId", "name email avatar")
      .sort({ createdAt: -1 });

    res.json(offers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.put("/api/offers/:id/status", authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["accepted", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Status must be 'accepted' or 'rejected'." });
    }

    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: "Offer not found." });

    if (
      offer.sellerId.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Only the seller can update the offer status." });
    }

    offer.status = status;
    await offer.save();

    const statusMsg = new Message({
      resourceId: offer.resourceId,
      senderId: req.user.id,
      receiverId: offer.buyerId,
      content: `Offer Update: The offer of ₹${offer.offeredPrice} for "${offer.resourceTitle}" was ${status.toUpperCase()} by the seller.`,
    });
    await statusMsg.save();

    res.json({ message: `Offer ${status}!`, offer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== ADMIN ROUTES ==========
// ============================================================

// 1. Dashboard Overview Stats & Recent Activity
app.get(
  "/api/admin/stats",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Parallelize all count and aggregate queries for near-instant response
      const [
        totalUsers,
        newUsersThisMonth,
        totalResources,
        pendingSubmissions,
        approvedResources,
        rejectedResources,
        activeListings,
        soldListings,
        totalOffers,
        totalReviews,
        pendingReports,
        verifiedSellers,
        viewSumResult,
        recentResources,
        recentUsers,
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ createdAt: { $gte: startOfMonth } }),
        Resource.countDocuments(),
        Resource.countDocuments({ status: "pending" }),
        Resource.countDocuments({ status: "approved" }),
        Resource.countDocuments({ status: "rejected" }),
        Resource.countDocuments({ isSold: false, status: "approved" }),
        Resource.countDocuments({ isSold: true }),
        Offer.countDocuments(),
        Review.countDocuments(),
        Report.countDocuments({ status: "pending" }),
        User.countDocuments({ isVerifiedSeller: true }),
        Resource.aggregate([
          {
            $group: {
              _id: null,
              totalViews: { $sum: "$views" },
              totalDownloads: { $sum: "$downloads" },
            },
          },
        ]),
        Resource.find()
          .populate("userId", "name email isVerifiedSeller")
          .sort({ createdAt: -1 })
          .limit(5)
          .select("-images -fileUrl"),
        User.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .select("-password"),
      ]);

      const totalViews = viewSumResult.length
        ? viewSumResult[0].totalViews || 0
        : 0;
      const totalDownloads = viewSumResult.length
        ? viewSumResult[0].totalDownloads || 0
        : 0;

      res.json({
        totalUsers,
        newUsersThisMonth,
        totalResources,
        pendingSubmissions,
        pendingResources: pendingSubmissions,
        approvedResources,
        rejectedResources,
        activeListings,
        soldListings,
        totalOffers,
        totalReviews,
        totalViews,
        totalDownloads,
        pendingReports,
        verifiedSellers,
        recentResources,
        recentUsers,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 2. Resource Management Listing with Filtering & Search
app.get(
  "/api/admin/resources",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const {
        search,
        status,
        type,
        semester,
        featured,
        page = 1,
        limit = 15,
      } = req.query;
      const query = {};

      if (status && status !== "all") {
        query.status = status;
      }
      if (type && type !== "all") {
        query.type = type;
      }
      if (semester && semester !== "all") {
        query.semester = semester;
      }
      if (featured && featured !== "all") {
        query.isFeatured = featured === "true";
      }
      if (search && search.trim()) {
        const q = search.trim();
        query.$or = [
          { title: { $regex: q, $options: "i" } },
          { subject: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
        ];
      }

      const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const total = await Resource.countDocuments(query);
      const resources = await Resource.find(query)
        .populate("userId", "name email college isVerifiedSeller")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("-images");

      res.json({
        resources,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)) || 1,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 3. Admin Direct Resource Creation
app.post(
  "/api/admin/resources",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const {
        title,
        type,
        subject,
        semester,
        branch,
        price,
        condition,
        description,
        image,
        fileUrl,
        fileName,
        status,
        isFeatured,
      } = req.body;

      if (!title || !type || price === undefined) {
        return res
          .status(400)
          .json({ message: "Title, type, and price are required." });
      }

      const coverImg =
        image ||
        "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=400";

      const newResource = new Resource({
        id: Date.now().toString(),
        title: title.trim(),
        type,
        subject: subject ? subject.trim() : "General",
        semester: semester ? semester.trim() : "Semester 1",
        branch: branch ? branch.trim() : "General",
        price: Number(price),
        condition: condition || "Good",
        description: description ? description.trim() : "",
        image: coverImg,
        images: [coverImg],
        fileUrl: fileUrl || "",
        fileName: fileName || "",
        downloads: 0,
        userId: req.user.id,
        status: status || "approved",
        isFeatured: Boolean(isFeatured),
      });

      const saved = await newResource.save();
      invalidateResourceCache();
      res.status(201).json({
        success: true,
        message: "Resource created successfully.",
        resource: saved,
      });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  },
);

// 4. Admin Edit Any Resource Details
app.put(
  "/api/admin/resources/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const resource = await Resource.findOne({ id: req.params.id });
      if (!resource)
        return res.status(404).json({ message: "Resource not found." });

      const fields = [
        "title",
        "type",
        "subject",
        "semester",
        "branch",
        "price",
        "condition",
        "description",
        "image",
        "fileUrl",
        "fileName",
        "status",
        "isFeatured",
        "isSold",
      ];

      fields.forEach((field) => {
        if (req.body[field] !== undefined) {
          resource[field] = req.body[field];
        }
      });

      if (req.body.image) {
        resource.images = [req.body.image];
      }

      await resource.save();
      invalidateResourceCache();
      const updated = await Resource.findOne({ id: req.params.id }).populate(
        "userId",
        "name email college",
      );
      res.json({
        success: true,
        message: "Resource updated successfully.",
        resource: updated,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 5. Admin Delete Resource Permanently
app.delete(
  "/api/admin/resources/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const resource = await Resource.findOneAndDelete({ id: req.params.id });
      if (!resource)
        return res.status(404).json({ message: "Resource not found." });
      await Report.deleteMany({ resourceId: req.params.id });
      invalidateResourceCache();
      res.json({ success: true, message: "Resource deleted permanently." });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 6. Admin Update Status (Approve / Reject / Pending)
app.put(
  "/api/admin/resources/:id/status",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { status } = req.body;
      if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const resource = await Resource.findOne({ id: req.params.id });
      if (!resource)
        return res.status(404).json({ message: "Resource not found" });

      resource.status = status;
      await resource.save();
      invalidateResourceCache();

      res.json({
        success: true,
        message: `Resource status updated to ${status}`,
        resource,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 7. Admin Toggle Featured Status
app.put(
  "/api/admin/resources/:id/feature",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const resource = await Resource.findOne({ id: req.params.id });
      if (!resource)
        return res.status(404).json({ message: "Resource not found." });

      resource.isFeatured = !resource.isFeatured;
      await resource.save();
      invalidateResourceCache();

      res.json({
        success: true,
        isFeatured: resource.isFeatured,
        message: resource.isFeatured
          ? "Resource marked as Featured."
          : "Resource removed from Featured.",
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 8. Admin User Management with Search & Resource Counts
app.get(
  "/api/admin/users",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { search, role, status, page = 1, limit = 15 } = req.query;
      const query = {};

      if (role && role !== "all") query.role = role;
      if (status === "active") query.isBlocked = false;
      if (status === "blocked") query.isBlocked = true;
      if (search && search.trim()) {
        const q = search.trim();
        query.$or = [
          { name: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { college: { $regex: q, $options: "i" } },
        ];
      }

      const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const total = await User.countDocuments(query);
      const users = await User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      // Count resources for each user
      const userIds = users.map((u) => u._id);
      const counts = await Resource.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
      ]);
      const countMap = {};
      counts.forEach((c) => {
        countMap[c._id.toString()] = c.count;
      });

      const enrichedUsers = users.map((u) => ({
        ...u,
        resourceCount: countMap[u._id.toString()] || 0,
      }));

      res.json({
        users: enrichedUsers,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)) || 1,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 9. Admin Toggle User Block / Suspension
app.put(
  "/api/admin/users/:id/block",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.role === "admin") {
        return res
          .status(403)
          .json({ message: "Cannot block an administrator." });
      }

      user.isBlocked = !user.isBlocked;
      await user.save();

      res.json({
        success: true,
        message: user.isBlocked
          ? `User ${user.name} has been suspended.`
          : `User ${user.name} has been reactivated.`,
        isBlocked: user.isBlocked,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 10. Admin Delete User
app.delete(
  "/api/admin/users/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.role === "admin") {
        return res
          .status(403)
          .json({ message: "Cannot delete an administrator." });
      }

      await User.findByIdAndDelete(req.params.id);
      await Resource.deleteMany({ userId: req.params.id });
      await Review.deleteMany({
        $or: [{ sellerId: req.params.id }, { reviewerId: req.params.id }],
      });

      res.json({
        success: true,
        message: "User and associated resources deleted successfully.",
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 11. Admin Moderation Reports Queue
app.get(
  "/api/admin/reports",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { status, page = 1, limit = 15 } = req.query;
      const query = {};
      if (status && status !== "all") query.status = status;

      const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const total = await Report.countDocuments(query);
      const reports = await Report.find(query)
        .populate("reporterId", "name email")
        .populate("resolvedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      res.json({
        reports,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)) || 1,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 12. Admin Update Report Status (Resolve / Dismiss)
app.put(
  "/api/admin/reports/:id",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { status } = req.body;
      const report = await Report.findById(req.params.id);
      if (!report)
        return res.status(404).json({ message: "Report not found." });

      report.status = status;
      report.resolvedBy = req.user.id;
      report.resolvedAt = new Date();
      await report.save();

      res.json({
        success: true,
        message: `Report marked as ${status}.`,
        report,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 13. Admin Unpublish/Delete Reported Resource & Resolve Report
app.delete(
  "/api/admin/reports/:id/resource",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const report = await Report.findById(req.params.id);
      if (!report)
        return res.status(404).json({ message: "Report not found." });

      await Resource.findOneAndDelete({ id: report.resourceId });
      report.status = "resolved";
      report.resolvedBy = req.user.id;
      report.resolvedAt = new Date();
      await report.save();

      res.json({
        success: true,
        message: "Reported resource deleted and report resolved.",
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 14. Admin Analytics (Most Popular, Views, Downloads, Growth)
app.get(
  "/api/admin/analytics",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const topViewed = await Resource.find({ status: "approved" })
        .populate("userId", "name college")
        .sort({ views: -1 })
        .limit(10)
        .select(
          "id title type subject views downloads price condition createdAt userId isFeatured",
        );

      const topDownloaded = await Resource.find({ status: "approved" })
        .populate("userId", "name college")
        .sort({ downloads: -1 })
        .limit(10)
        .select(
          "id title type subject views downloads price condition createdAt userId isFeatured",
        );

      const topContributors = await Resource.aggregate([
        { $match: { status: "approved" } },
        {
          $group: {
            _id: "$userId",
            count: { $sum: 1 },
            totalViews: { $sum: "$views" },
            totalDownloads: { $sum: "$downloads" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            _id: 1,
            count: 1,
            totalViews: 1,
            totalDownloads: 1,
            "user.name": 1,
            "user.email": 1,
            "user.college": 1,
            "user.isVerifiedSeller": 1,
          },
        },
      ]);

      res.json({
        topViewed,
        topDownloaded,
        topContributors,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// 15. Admin Platform Settings
app.get(
  "/api/admin/settings",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const manualApprovalRequired = await getSetting(
        "manualApprovalRequired",
        true,
      );
      const maintenanceMode = await getSetting("maintenanceMode", false);
      res.json({ manualApprovalRequired, maintenanceMode });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

app.put(
  "/api/admin/settings",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { manualApprovalRequired, maintenanceMode } = req.body;
      if (manualApprovalRequired !== undefined) {
        await Setting.findOneAndUpdate(
          { key: "manualApprovalRequired" },
          { value: Boolean(manualApprovalRequired) },
          { upsert: true, new: true },
        );
      }
      if (maintenanceMode !== undefined) {
        await Setting.findOneAndUpdate(
          { key: "maintenanceMode" },
          { value: Boolean(maintenanceMode) },
          { upsert: true, new: true },
        );
      }
      res.json({
        success: true,
        message: "Platform settings updated successfully.",
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ============================================================
// ========== CHAT ROUTES ==========
// ============================================================

app.get("/api/chat/conversations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ createdAt: -1 });

    const conversations = {};
    for (const msg of messages) {
      if (!msg.senderId || !msg.receiverId) continue;

      const sId = msg.senderId.toString();
      const rId = msg.receiverId.toString();
      const partnerId = sId === userId ? rId : sId;

      if (!conversations[partnerId]) {
        const partner =
          await User.findById(partnerId).select("name email avatar");
        const partnerName = partner ? partner.name : "Student (Inactive)";
        const partnerAvatar = partner ? partner.avatar || "" : "";

        conversations[partnerId] = {
          userId: partnerId,
          name: partnerName,
          avatar: partnerAvatar,
          lastMessage: msg.content || "",
          lastMessageTime: msg.createdAt,
          resourceId: msg.resourceId || "",
          unread: sId !== userId && !msg.read ? 1 : 0,
        };
      } else {
        if (sId !== userId && !msg.read) {
          conversations[partnerId].unread =
            (conversations[partnerId].unread || 0) + 1;
        }
      }
    }

    const result = Object.values(conversations).sort(
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime),
    );

    res.json(result);
  } catch (err) {
    console.error("Conversations error:", err);
    res.status(500).json({ message: err.message });
  }
});

app.get(
  "/api/chat/messages/:userId/:resourceId",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId, resourceId } = req.params;
      const currentUserId = req.user.id;

      const messages = await Message.find({
        resourceId: resourceId,
        $or: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId },
        ],
      }).sort({ createdAt: 1 });

      await Message.updateMany(
        {
          senderId: userId,
          receiverId: currentUserId,
          resourceId: resourceId,
          read: false,
        },
        { read: true },
      );

      // Real-time update receiver's unread badge (clears to 0 for this conversation)
      emitUnreadCount(currentUserId);

      res.json(messages);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// Real-time Mark As Read Endpoint
app.put(
  "/api/chat/read/:userId/:resourceId",
  authenticateToken,
  async (req, res) => {
    try {
      const { userId, resourceId } = req.params;
      const currentUserId = req.user.id;

      await Message.updateMany(
        {
          senderId: userId,
          receiverId: currentUserId,
          resourceId: resourceId,
          read: false,
        },
        { read: true },
      );

      const unreadCount = await Message.countDocuments({
        receiverId: currentUserId,
        read: false,
      });

      io.to(`user_${currentUserId}`).emit("unread_count_update", {
        unreadCount,
      });
      res.json({ success: true, unreadCount });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

app.post("/api/chat/messages", authenticateToken, async (req, res) => {
  try {
    const { receiverId, resourceId, content } = req.body;
    const senderId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const newMessage = new Message({
      resourceId,
      senderId,
      receiverId,
      content: content.trim(),
      read: false,
    });

    await newMessage.save();
    const populated = await Message.findById(newMessage._id).populate(
      "senderId",
      "name avatar email",
    );

    // 1. Compute receiver's real-time unread messages count
    const receiverUnreadCount = await Message.countDocuments({
      receiverId,
      read: false,
    });

    // 2. Real-time emit to receiver's private room (instantly updates their existing message bar badge)
    io.to(`user_${receiverId}`).emit("new_message", {
      message: populated,
      unreadCount: receiverUnreadCount,
      resourceId,
      senderId: req.user.id,
      senderName: req.user.name,
    });

    // 3. Real-time emit to active conversation room (for instant in-chat message appending)
    const convRoom =
      [senderId, receiverId].sort().join("_") + `_${resourceId}`;
    io.to(convRoom).emit("chat_message", populated);

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/chat/unread", authenticateToken, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiverId: req.user.id,
      read: false,
    });
    res.json({ unread: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== AI CHATBOT & RECOMMENDATION ROUTES ==========
// ============================================================

app.post("/api/ai/recommend", async (req, res) => {
  try {
    const { message, conversationHistory, context } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Message cannot be empty." });
    }

    const allResources = await Resource.find({
      status: { $ne: "rejected" },
    }).lean();

    const result = await aiRecommender.processChatbotQuery({
      message: message.trim(),
      conversationHistory: conversationHistory || [],
      currentContext: context || {},
      allResources,
    });

    res.json(result);
  } catch (err) {
    console.error("❌ AI recommendation error:", err.message);
    res.status(500).json({
      message: "Error processing recommendation query.",
      error: err.message,
    });
  }
});

app.get("/api/ai/suggestions", (req, res) => {
  res.json({
    welcomeMessage:
      "Hi! 👋 I'm EduResourceMine AI. Tell me what you're looking for, and I'll recommend the best study resources for you.",
    prompts: [
      "I need ML notes for Semester 3.",
      "Show me PYQs for AI.",
      "I have an exam tomorrow. What should I study?",
      "Recommend beginner-friendly resources for Data Structures.",
    ],
  });
});

// ============================================================
// ========== STATIC & ROUTING ==========
// ============================================================

app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// ============================================================
// ========== SERVER START ==========
// ============================================================

server.listen(PORT, () => {
  console.log(`🚀 eduResourceMine Server running on http://localhost:${PORT}`);
});
