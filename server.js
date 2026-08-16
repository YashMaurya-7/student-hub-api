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
// Allow large base64 image uploads (up to 50mb)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_student_hub_2026_x99";
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "admin_hub_secret_2026";

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
    const error = new Error(`Resend request failed with status ${response.status}`);
    error.publicMessage = "Could not send the email. Please try again later.";
    throw error;
  }
}

// ============================================================
// ========== SCHEMAS ==========
// ============================================================

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
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
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

const resourceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ["note", "book"], required: true },
    subject: { type: String, default: "General", trim: true },
    price: { type: Number, required: true, min: 0 },
    condition: { type: String, required: true },
    description: { type: String, default: "" },
    image: { type: String, required: true }, // Cover photo
    images: { type: [String], default: [] }, // Description & gallery photos
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    views: { type: Number, default: 0 },
    isSold: { type: Boolean, default: false },
    status: { type: String, enum: ["approved", "pending", "rejected"], default: "approved" },
  },
  { timestamps: true }
);

const Resource = mongoose.model("Resource", resourceSchema);

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
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

// Review & Rating Schema
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
  { timestamps: true }
);

const Review = mongoose.model("Review", reviewSchema);

// Price Negotiation / Offer Schema
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
  { timestamps: true }
);

const Offer = mongoose.model("Offer", offerSchema);

// ============================================================
// ========== MIDDLEWARE ==========
// ============================================================

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied. Token missing." });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid or expired token." });

    try {
      const user = await User.findById(decoded.id).select("name email role isBlocked");
      if (!user) return res.status(401).json({ message: "User not found." });
      if (user.isBlocked) {
        return res.status(403).json({ message: "Your account has been blocked by the admin." });
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
// ========== ROOT & HEALTH ==========
// ============================================================

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "🚀 Student Resource Hub API is running smoothly!",
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
      return res.status(400).json({ message: "Name, email, and password are required." });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
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
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "Invalid email or password." });

    if (user.isBlocked) {
      return res.status(403).json({ message: "This account has been blocked by an administrator." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password." });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
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
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update current user profile
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
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Public profile of any user (by userId)
app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "name email avatar bio college createdAt"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    const listings = await Resource.find({ userId: user._id, status: "approved" }).sort({
      createdAt: -1,
    });
    const reviews = await Review.find({ sellerId: user._id }).populate("reviewerId", "name avatar");

    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = reviews.length ? (totalRating / reviews.length).toFixed(1) : "0.0";

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
    if (!user) return res.status(404).json({ message: "User with this email not found." });

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
        subject: "🔐 Password Reset OTP - Student Resource Hub",
        text: `Your Student Resource Hub password-reset OTP is ${otp}. It expires in 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background:#0f172a; color:#ffffff;">
            <h2 style="color: #14b8a6;">🔐 Password Reset OTP</h2>
            <p>Hi ${user.name},</p>
            <p>Your one-time password (OTP) is:</p>
            <div style="background: rgba(20,184,166,0.15); border:1px solid #14b8a6; padding: 12px; border-radius:8px; text-align:center; font-size: 28px; font-weight:bold; letter-spacing:4px; color: #14b8a6;">
              ${otp}
            </div>
            <p style="margin-top:14px; font-size: 0.9rem; color:#94a3b8;">This OTP is valid for <strong>10 minutes</strong>.</p>
            <hr style="border-color: rgba(255,255,255,0.1);"/>
            <p style="color: #64748b; font-size: 0.8rem;">Student Resource Hub</p>
          </div>
        `,
      });
      emailSent = true;
    } catch (emailErr) {
      console.warn("Could not send email, providing OTP in response for fallback/development.");
    }

    res.json({
      message: "OTP generated successfully!",
      emailSent,
      // Provide OTP in dev if email service isn't active
      otp: !RESEND_API_KEY ? otp : undefined,
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Could not create a password-reset OTP." });
  }
});

app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email?.trim().toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (!user.resetPasswordOTP || !user.resetPasswordExpires || user.resetPasswordExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
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
    if (!user.resetPasswordOTP || !user.resetPasswordExpires || user.resetPasswordExpires < Date.now()) {
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
// ========== WISHLIST / BOOKMARKS ==========
// ============================================================

// Get user wishlist items
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

// Get user wishlist IDs for quick check
app.get("/api/wishlist/ids", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("wishlist");
    res.json(user ? user.wishlist : []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Toggle wishlist item
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

// Get all approved resources (with filtering)
app.get("/api/resources", async (req, res) => {
  try {
    const { type, subject, search } = req.query;
    const filter = { status: { $ne: "rejected" } };

    if (type && type !== "all") {
      filter.type = type;
    }
    if (subject && subject !== "all") {
      filter.subject = new RegExp(`^${subject}$`, "i");
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
      ];
    }

    const resources = await Resource.find(filter)
      .populate("userId", "name email avatar college")
      .sort({ createdAt: -1 });

    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get single resource (increments view count)
app.get("/api/resources/:id", async (req, res) => {
  try {
    const resource = await Resource.findOneAndUpdate(
      { id: req.params.id },
      { $inc: { views: 1 } },
      { new: true }
    ).populate("userId", "name email avatar college");

    if (!resource) return res.status(404).json({ message: "Resource not found" });
    res.json(resource);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get current user's listings
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

// Create new resource (supports separate cover photo & description photos)
app.post("/api/resources", authenticateToken, async (req, res) => {
  try {
    const { id, title, type, subject, price, condition, description, image, images } = req.body;

    if (!title || !type || price === undefined || !condition) {
      return res.status(400).json({ message: "Title, type, price, and condition are required." });
    }

    // Cover image is required
    const coverImage = image || (Array.isArray(images) && images.length ? images[0] : null);
    if (!coverImage) {
      return res.status(400).json({ message: "Please upload a Cover Photo for your resource." });
    }

    // Process additional images if provided
    let galleryImages = [];
    if (Array.isArray(images) && images.length) {
      galleryImages = images;
    } else {
      galleryImages = [coverImage];
    }

    const newResource = new Resource({
      id: id || Date.now().toString(),
      title: title.trim(),
      type,
      subject: subject ? subject.trim() : "General",
      price: Number(price),
      condition,
      description: description ? description.trim() : "",
      image: coverImage,
      images: galleryImages,
      userId: req.user.id,
      isSold: false,
      status: "approved",
    });

    const saved = await newResource.save();
    const populated = await Resource.findById(saved._id).populate("userId", "name email avatar");
    res.status(201).json(populated);
  } catch (err) {
    console.error("Create resource error:", err);
    res.status(400).json({ message: err.message });
  }
});

// Edit resource (Owner or Admin)
app.put("/api/resources/:id", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource) {
      return res.status(404).json({ message: "Resource not found" });
    }

    // Check ownership or admin
    if (resource.userId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to edit this resource." });
    }

    const { title, type, subject, price, condition, description, image, images } = req.body;

    if (title) resource.title = title.trim();
    if (type) resource.type = type;
    if (subject) resource.subject = subject.trim();
    if (price !== undefined) resource.price = Number(price);
    if (condition) resource.condition = condition;
    if (description !== undefined) resource.description = description.trim();
    if (image) resource.image = image;
    if (Array.isArray(images) && images.length > 0) resource.images = images;

    await resource.save();
    const populated = await Resource.findOne({ id: req.params.id }).populate("userId", "name email avatar");

    res.json({ message: "Resource updated successfully!", resource: populated });
  } catch (err) {
    console.error("Edit error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Mark resource as sold
app.put("/api/resources/:id/mark-sold", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource) return res.status(404).json({ message: "Resource not found" });
    if (resource.userId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    resource.isSold = !resource.isSold;
    await resource.save();
    res.json({
      message: resource.isSold ? "Resource marked as Sold!" : "Resource marked as Available!",
      isSold: resource.isSold,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete resource (Owner or Admin)
app.delete("/api/resources/:id", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource) return res.status(404).json({ message: "Resource not found" });
    if (resource.userId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized." });
    }

    await Resource.findOneAndDelete({ id: req.params.id });
    // Also clean up offers/messages related if needed
    await Offer.deleteMany({ resourceId: req.params.id });

    res.json({ message: "Resource deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Request to Buy (Email + Message)
app.post("/api/resources/:id/request-buy", authenticateToken, async (req, res) => {
  try {
    const resource = await Resource.findOne({ id: req.params.id }).populate("userId", "name email");
    if (!resource) return res.status(404).json({ message: "Resource not found" });
    if (resource.isSold) return res.status(400).json({ message: "Resource is already sold!" });

    const buyer = await User.findById(req.user.id);
    const seller = resource.userId;

    if (seller._id.toString() === req.user.id) {
      return res.status(400).json({ message: "You cannot request to buy your own resource." });
    }

    let emailSent = true;
    try {
      await sendEmail({
        to: seller.email,
        subject: `📚 Purchase Request: ${resource.title}`,
        text: `${buyer.name} (${buyer.email}) wants to buy "${resource.title}" for ₹${resource.price}.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; background:#0f172a; color:#ffffff;">
            <h2 style="color: #14b8a6;">📚 Purchase Request</h2>
            <p><strong>Buyer:</strong> ${buyer.name} (${buyer.email})</p>
            <p><strong>Resource:</strong> ${resource.title}</p>
            <p><strong>Price:</strong> ₹${resource.price}</p>
            <p style="color:#94a3b8; font-size:0.9rem;">Check your messages on Student Resource Hub to communicate with the buyer.</p>
          </div>
        `,
      });
    } catch (emailError) {
      emailSent = false;
    }

    const chatMsg = new Message({
      resourceId: resource.id,
      senderId: req.user.id,
      receiverId: seller._id,
      content: `👋 Hi! I'm interested in purchasing "${resource.title}" for ₹${resource.price}. Please let me know how we can coordinate.`,
    });
    await chatMsg.save();

    res.json({
      message: "Purchase request sent! A conversation has been initiated in Messages.",
      sellerId: seller._id,
      emailSent,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== RATINGS & REVIEWS ==========
// ============================================================

// Submit or update rating & review for seller
app.post("/api/reviews", authenticateToken, async (req, res) => {
  try {
    const { sellerId, resourceId, rating, comment } = req.body;

    if (!sellerId || !rating) {
      return res.status(400).json({ message: "Seller ID and a 1-5 star rating are required." });
    }

    if (sellerId === req.user.id) {
      return res.status(400).json({ message: "You cannot review yourself." });
    }

    const seller = await User.findById(sellerId);
    if (!seller) return res.status(404).json({ message: "Seller not found." });

    // Check if review already exists from this user for this seller
    let review = await Review.findOne({ sellerId, reviewerId: req.user.id, resourceId });

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

    const populated = await Review.findById(review._id).populate("reviewerId", "name avatar");
    res.status(201).json({ message: "Review submitted successfully!", review: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all reviews for a seller
app.get("/api/reviews/seller/:sellerId", async (req, res) => {
  try {
    const reviews = await Review.find({ sellerId: req.params.sellerId })
      .populate("reviewerId", "name avatar")
      .sort({ createdAt: -1 });

    const total = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = reviews.length ? (total / reviews.length).toFixed(1) : "0.0";

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
// ========== PRICE OFFERS / NEGOTIATION ==========
// ============================================================

// Submit an offer
app.post("/api/offers", authenticateToken, async (req, res) => {
  try {
    const { resourceId, offeredPrice, message } = req.body;
    if (!resourceId || offeredPrice === undefined) {
      return res.status(400).json({ message: "Resource ID and offered price are required." });
    }

    const resource = await Resource.findOne({ id: resourceId }).populate("userId", "name email");
    if (!resource) return res.status(404).json({ message: "Resource not found." });

    if (resource.userId._id.toString() === req.user.id) {
      return res.status(400).json({ message: "You cannot make an offer on your own resource." });
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

    // Create automated chat message
    const offerMsg = new Message({
      resourceId: resource.id,
      senderId: req.user.id,
      receiverId: resource.userId._id,
      content: `💰 [Price Offer] Proposed ₹${offeredPrice} (Original: ₹${resource.price})${message ? ` - Note: "${message}"` : ""}`,
    });
    await offerMsg.save();

    res.status(201).json({ message: "Offer submitted successfully!", offer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user's incoming and outgoing offers
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

// Update offer status (Accept / Reject)
app.put("/api/offers/:id/status", authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'accepted' or 'rejected'." });
    }

    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ message: "Offer not found." });

    if (offer.sellerId.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Only the seller can update the offer status." });
    }

    offer.status = status;
    await offer.save();

    // Send chat message update
    const statusMsg = new Message({
      resourceId: offer.resourceId,
      senderId: req.user.id,
      receiverId: offer.buyerId,
      content: `🤝 [Offer Update] The offer of ₹${offer.offeredPrice} for "${offer.resourceTitle}" was ${status.toUpperCase()} by the seller.`,
    });
    await statusMsg.save();

    res.json({ message: `Offer ${status}!`, offer });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ============================================================
// ========== ADMIN PANEL ROUTES ==========
// ============================================================

// Admin analytics & stats
app.get("/api/admin/stats", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalResources = await Resource.countDocuments();
    const activeListings = await Resource.countDocuments({ isSold: false, status: { $ne: "rejected" } });
    const soldListings = await Resource.countDocuments({ isSold: true });
    const totalOffers = await Offer.countDocuments();
    const totalReviews = await Review.countDocuments();

    res.json({
      totalUsers,
      totalResources,
      activeListings,
      soldListings,
      totalOffers,
      totalReviews,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin list all resources
app.get("/api/admin/resources", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const resources = await Resource.find()
      .populate("userId", "name email role isBlocked")
      .sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin approve / reject resource
app.put("/api/admin/resources/:id/status", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const resource = await Resource.findOne({ id: req.params.id });
    if (!resource) return res.status(404).json({ message: "Resource not found" });

    resource.status = status;
    await resource.save();

    res.json({ message: `Resource status updated to ${status}`, resource });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin list all users
app.get("/api/admin/users", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin toggle block / unblock user
app.put("/api/admin/users/:id/block", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot block an administrator." });
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({
      message: user.isBlocked ? `User ${user.name} has been blocked.` : `User ${user.name} has been unblocked.`,
      isBlocked: user.isBlocked,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin delete user
app.delete("/api/admin/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "admin") {
      return res.status(400).json({ message: "Cannot delete an administrator." });
    }

    await User.findByIdAndDelete(req.params.id);
    await Resource.deleteMany({ userId: req.params.id });
    await Review.deleteMany({ $or: [{ sellerId: req.params.id }, { reviewerId: req.params.id }] });

    res.json({ message: "User and associated resources deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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
        const partner = await User.findById(partnerId).select("name email avatar");
        if (partner) {
          conversations[partnerId] = {
            userId: partnerId,
            name: partner.name,
            email: partner.email,
            avatar: partner.avatar || "",
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
      (a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime)
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/chat/messages/:userId/:resourceId", authenticateToken, async (req, res) => {
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
      { read: true }
    );

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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

    const populated = await Message.findById(newMessage._id).populate("senderId", "name avatar");
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
// ========== SERVER START ==========
// ============================================================

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
