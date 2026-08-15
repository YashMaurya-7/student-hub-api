// backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const dns = require("dns");
require("dotenv").config();

// Force IPv4
dns.setDefaultResultOrder("ipv4first");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_123";

const DB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://yashmaurya0071_db_user:NicikZKOn8NePhX7@studentresourcehub.yruinrf.mongodb.net/?appName=StudentResourceHub";

mongoose
  .connect(DB_URI)
  .then(() => console.log("✅ Database connected successfully!"))
  .catch((err) => console.log("❌ Database error:", err));

// ============================================================
// ========== EMAIL CONFIGURATION ==========
// ============================================================

const EMAIL_USER = process.env.EMAIL_USER || "yashmaurya0071@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS || "your-app-password";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  tls: { rejectUnauthorized: false },
  family: 4,
});

transporter.verify((error, success) => {
  if (error) console.log("❌ Email error:", error.message);
  else console.log("✅ Email configured!");
});

// ============================================================
// ========== SCHEMAS ==========
// ============================================================

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetPasswordOTP: { type: String },
    resetPasswordExpires: { type: Date },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

const resourceSchema = new mongoose.Schema(
  {
    id: String,
    title: { type: String, required: true },
    type: { type: String, enum: ["note", "book"], required: true },
    price: { type: Number, required: true },
    condition: { type: String, required: true },
    description: { type: String, default: "" },
    image: { type: String, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isSold: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const Resource = mongoose.model("Resource", resourceSchema);

// 🔥 Message Schema for Chat
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

// ============================================================
// ========== MIDDLEWARE ==========
// ============================================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied." });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token." });
    req.user = user;
    next();
  });
};

// ============================================================
// ========== ROOT ==========
// ============================================================

app.get("/", (req, res) => {
  res.send("🚀 Student Resource Hub API is running!");
});

// ============================================================
// ========== AUTH ROUTES ==========
// ============================================================

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered." });
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User created successfully!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials." });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials." });
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== FORGOT PASSWORD ==========
// ============================================================

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 10 * 60 * 1000;
    const hashedOTP = await bcrypt.hash(otp, 10);
    user.resetPasswordOTP = hashedOTP;
    user.resetPasswordExpires = expires;
    await user.save();

    await transporter.sendMail({
      from: `"Student Hub" <${EMAIL_USER}>`,
      to: email,
      subject: "🔐 Password Reset OTP",
      html: `<div><h2>Your OTP: <strong>${otp}</strong></h2><p>Valid for 10 minutes.</p></div>`,
    });
    res.json({ message: "OTP sent." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.resetPasswordExpires < Date.now())
      return res.status(400).json({ message: "OTP expired." });
    const isValid = await bcrypt.compare(otp, user.resetPasswordOTP);
    if (!isValid) return res.status(400).json({ message: "Invalid OTP." });
    res.json({ message: "OTP verified." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.resetPasswordExpires < Date.now())
      return res.status(400).json({ message: "OTP expired." });
    const isValid = await bcrypt.compare(otp, user.resetPasswordOTP);
    if (!isValid) return res.status(400).json({ message: "Invalid OTP." });
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ message: "Password reset successfully!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== RESOURCE ROUTES ==========
// ============================================================

app.get("/api/resources", async (req, res) => {
  try {
    const resources = await Resource.find().sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/resources/:id", async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id }).populate(
      "userId",
      "name email",
    );
    if (!resource) return res.status(404).json({ message: "Not found" });
    res.json(resource);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/auth/me/listings", authenticateToken, async (req, res) => {
  try {
    const resources = await Resource.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/resources", authenticateToken, async (req, res) => {
  try {
    const newResource = new Resource({
      ...req.body,
      userId: req.user.id,
      isSold: false,
    });
    const saved = await newResource.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.put("/api/resources/:id/mark-sold", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource) return res.status(404).json({ message: "Not found" });
    if (resource.userId.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });
    resource.isSold = true;
    await resource.save();
    res.json({ message: "Marked as Sold!" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.delete("/api/resources/:id", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource) return res.status(404).json({ message: "Not found" });
    if (resource.userId.toString() !== req.user.id)
      return res.status(403).json({ message: "Not authorized" });
    await Resource.findOneAndDelete({ id: req.params.id });
    res.json({ message: "Deleted successfully" });
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
      if (!resource) return res.status(404).json({ message: "Not found" });
      if (resource.isSold)
        return res.status(400).json({ message: "Already sold!" });

      const buyer = await User.findById(req.user.id);
      const seller = resource.userId;

      await transporter.sendMail({
        from: `"Student Hub" <${EMAIL_USER}>`,
        to: seller.email,
        subject: `📚 Request to Buy: ${resource.title}`,
        html: `<div><h2>Purchase Request</h2><p><strong>Buyer:</strong> ${buyer.name} (${buyer.email})</p><p><strong>Resource:</strong> ${resource.title}</p><p><strong>Price:</strong> ₹${resource.price}</p></div>`,
      });

      // Also create a chat message for the request
      const chatMsg = new Message({
        resourceId: resource.id,
        senderId: req.user.id,
        receiverId: seller._id,
        content: `I'm interested in buying "${resource.title}". Please contact me.`,
      });
      await chatMsg.save();

      res.json({
        message: "Request sent to seller and chat message created!",
        sellerId: seller._id,
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// ============================================================
// ========== 🔥 CHAT ROUTES ==========
// ============================================================

// Get all conversations for current user
app.get("/api/chat/conversations", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const messages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    }).sort({ createdAt: -1 });

    const conversations = {};
    for (const msg of messages) {
      const partnerId =
        msg.senderId.toString() === userId
          ? msg.receiverId.toString()
          : msg.senderId.toString();
      if (!conversations[partnerId]) {
        const partner = await User.findById(partnerId).select("name email");
        if (partner) {
          conversations[partnerId] = {
            userId: partnerId,
            name: partner.name,
            email: partner.email,
            lastMessage: msg.content,
            lastMessageTime: msg.createdAt,
            resourceId: msg.resourceId,
            unread: msg.senderId.toString() !== userId && !msg.read ? 1 : 0,
          };
        }
      } else {
        if (msg.senderId.toString() !== userId && !msg.read) {
          conversations[partnerId].unread += 1;
        }
      }
    }

    const result = Object.values(conversations).sort(
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime),
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get messages with a specific user (for a resource)
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

      // Mark messages as read
      await Message.updateMany(
        { senderId: userId, receiverId: currentUserId, read: false },
        { read: true },
      );

      res.json(messages);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

// Send a message
app.post("/api/chat/messages", authenticateToken, async (req, res) => {
  try {
    const { receiverId, resourceId, content } = req.body;
    const senderId = req.user.id;

    if (!content.trim())
      return res.status(400).json({ message: "Message cannot be empty." });

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
      "name",
    );

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 🔥 GET UNREAD COUNT (For Badge)
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
// ========== USER ROUTE ==========
// ============================================================

app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== TEST EMAIL ==========
// ============================================================

app.get("/api/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: `"Student Hub" <${EMAIL_USER}>`,
      to: EMAIL_USER,
      subject: "✅ Test",
      text: "Email works!",
    });
    res.json({ message: "Test email sent!" });
  } catch (err) {
    res.status(500).json({ message: "Email test failed: " + err.message });
  }
});

// ============================================================
// ========== SERVER START ==========
// ============================================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
