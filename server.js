// backend/server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Base64 images ke liye

// ===== PORT (SIRF EK BAAR DECLARE) =====
const PORT = process.env.PORT || 5000; // <-- SIRF EK BAAR, process.env.PORT sahi hai

// ===== DATABASE CONNECTION =====
// Agar aapne .env file banayi hai toh yeh line kaam karegi, warna direct bhi daal sakte ho
const DB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://yashmaurya0071_db_user:NicikZKOn8NePhX7@studentresourcehub.yruinrf.mongodb.net/?appName=StudentResourceHub";

mongoose
  .connect(DB_URI)
  .then(() => console.log("✅ Database connected successfully!"))
  .catch((err) => console.log("❌ Database error:", err));

// ===== SCHEMA =====
const resourceSchema = new mongoose.Schema(
  {
    id: String,
    title: String,
    type: String,
    price: Number,
    condition: String,
    description: String,
    image: String,
  },
  { timestamps: true },
);

const Resource = mongoose.model("Resource", resourceSchema);

// Root route - taaki browser mein kholne par kuch dikhe
app.get("/", (req, res) => {
  res.send("🚀 Student Resource Hub API is running!");
});
// ===== API ROUTES =====
app.get("/api/resources", async (req, res) => {
  try {
    const resources = await Resource.find().sort({ createdAt: -1 });
    res.json(resources);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/resources", async (req, res) => {
  try {
    const newResource = new Resource(req.body);
    const savedResource = await newResource.save();
    res.status(201).json(savedResource);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/resources/:id", async (req, res) => {
  try {
    const deleted = await Resource.findOneAndDelete({ id: req.params.id });
    if (!deleted) {
      return res.status(404).json({ message: "Resource not found" });
    }
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ===== SERVER START (SIRF EK BAAR) =====
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
