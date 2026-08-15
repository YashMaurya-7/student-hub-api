// backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
require("dotenv").config();

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

// Render's free web services block outbound SMTP ports, including 587.  Use an
// HTTPS email API instead so password-reset messages work after deployment.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    const error = new Error("RESEND_API_KEY or EMAIL_FROM is missing.");
    error.publicMessage = "Email service is not configured yet.";
    throw error;
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
    const error = new Error(
      `Resend request failed with status ${response.status}`,
    );
    error.publicMessage = "Could not send the email. Please try again later.";
    throw error;
  }
}

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

// Message Schema for Chat
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
    const email = req.body.email?.trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required." });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });

    const otp = crypto.randomInt(100000, 1000000).toString();
    const expires = Date.now() + 10 * 60 * 1000;
    const hashedOTP = await bcrypt.hash(otp, 10);
    user.resetPasswordOTP = hashedOTP;
    user.resetPasswordExpires = expires;
    await user.save();

    try {
      await sendEmail({
        to: email,
        subject: "🔐 Password Reset OTP",
        text: `Your Student Resource Hub password-reset OTP is ${otp}. It expires in 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
            <h2 style="color: #0f172a;">🔐 Password Reset OTP</h2>
            <p>Hi ${user.name},</p>
            <p>Your OTP is: <strong style="font-size: 28px; color: #14b8a6;">${otp}</strong></p>
            <p>This OTP is valid for <strong>10 minutes</strong>.</p>
            <hr />
            <p style="color: #94a3b8; font-size: 0.8rem;">Student Resource Hub</p>
          </div>
        `,
      });
      console.log("✅ Email sent to:", email);
    } catch (emailErr) {
      // Do not leave an OTP in the database when it was not delivered, and
      // never send a reset OTP back to the browser.
      user.resetPasswordOTP = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      return res.status(503).json({
        message:
          emailErr.publicMessage ||
          "Could not send the OTP. Please try again later.",
      });
    }

    res.json({ message: "OTP sent to your email. It expires in 10 minutes." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Could not create a password-reset OTP." });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (
      !user.resetPasswordOTP ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < Date.now()
    )
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
    if (
      !user.resetPasswordOTP ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < Date.now()
    )
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

// 🔥 ===== EDIT RESOURCE (PUT) - Owner only =====
app.put("/api/resources/:id", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    // Check if user is the owner
    if (resource.userId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Not authorized to edit this resource" });
    }

    // Update fields
    const { title, type, price, condition, description } = req.body;
    resource.title = title || resource.title;
    resource.type = type || resource.type;
    resource.price = price !== undefined ? price : resource.price;
    resource.condition = condition || resource.condition;
    resource.description = description || resource.description;

    await resource.save();
    res.json({ message: "Resource updated successfully!", resource });
  } catch (err) {
    console.error("Edit error:", err);
    res.status(500).json({ message: err.message });
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

      // A chat request should still be created if the optional email
      // notification fails (for example, while Resend is in test mode).
      let emailSent = true;
      try {
        await sendEmail({
          to: seller.email,
          subject: `📚 Request to Buy: ${resource.title}`,
          text: `${buyer.name} (${buyer.email}) is interested in buying "${resource.title}" for ₹${resource.price}.`,
          html: `<div><h2>Purchase Request</h2><p><strong>Buyer:</strong> ${buyer.name} (${buyer.email})</p><p><strong>Resource:</strong> ${resource.title}</p><p><strong>Price:</strong> ₹${resource.price}</p></div>`,
        });
      } catch (emailError) {
        emailSent = false;
        console.error("Purchase-request email failed:", emailError.message);
      }

      const chatMsg = new Message({
        resourceId: resource.id,
        senderId: req.user.id,
        receiverId: seller._id,
        content: `I'm interested in buying "${resource.title}". Please contact me.`,
      });
      await chatMsg.save();

      res.json({
        message: emailSent
          ? "Request sent to the seller and chat message created!"
          : "Request sent in Messages. The email notification could not be delivered.",
        sellerId: seller._id,
        emailSent,
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
        { senderId: userId, receiverId: currentUserId, read: false },
        { read: true },
      );

      res.json(messages);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

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

// GET UNREAD COUNT
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
    if (!EMAIL_FROM) {
      return res
        .status(503)
        .json({ message: "Email service is not configured yet." });
    }
    const match = EMAIL_FROM.match(/<([^>]+)>/);
    const recipient =
      process.env.EMAIL_TEST_RECIPIENT || (match ? match[1] : EMAIL_FROM);
    await sendEmail({
      to: recipient,
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
