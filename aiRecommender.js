// backend/aiRecommender.js
/**
 * EduResourceMine - AI-Powered Resource Recommendation Engine
 *
 * Implements:
 * 1. Natural Language Intent & Academic Entity Extractor
 * 2. Semantic Search & Multi-Factor Relevance Ranking
 * 3. Multi-Turn Context Memory & Follow-Up Question Generator
 * 4. Study Order & Actionable Recommendation Formatter
 * 5. Safe Fallback & Empty State Guidance (No Hallucinated Resources)
 */

// Subject Synonym & Acronym Dictionary
const SUBJECT_MAP = {
  "machine learning": "Machine Learning",
  ml: "Machine Learning",
  "artificial intelligence": "Artificial Intelligence",
  ai: "Artificial Intelligence",
  "deep learning": "Deep Learning",
  dl: "Deep Learning",
  "data structures": "Data Structures",
  "data structure": "Data Structures",
  dsa: "Data Structures",
  ds: "Data Structures",
  algorithms: "Data Structures",
  algo: "Data Structures",
  "database management systems": "Database Management Systems",
  "database management system": "Database Management Systems",
  dbms: "Database Management Systems",
  database: "Database Management Systems",
  sql: "Database Management Systems",
  "operating systems": "Operating Systems",
  "operating system": "Operating Systems",
  os: "Operating Systems",
  "computer networks": "Computer Networks",
  "computer network": "Computer Networks",
  cn: "Computer Networks",
  networking: "Computer Networks",
  "basic electrical engineering": "Basic Electrical Engineering",
  bee: "Basic Electrical Engineering",
  electrical: "Basic Electrical Engineering",
  "engineering mathematics": "Engineering Mathematics",
  mathematics: "Engineering Mathematics",
  maths: "Engineering Mathematics",
  math: "Engineering Mathematics",
  m1: "Engineering Mathematics 1",
  m2: "Engineering Mathematics 2",
  m3: "Engineering Mathematics 3",
  "object oriented programming": "Object Oriented Programming",
  oop: "Object Oriented Programming",
  oops: "Object Oriented Programming",
  java: "Java Programming",
  python: "Python Programming",
  "c++": "C++ Programming",
  cpp: "C++ Programming",
  "theory of computation": "Theory of Computation",
  toc: "Theory of Computation",
  automata: "Theory of Computation",
  "software engineering": "Software Engineering",
  se: "Software Engineering",
  "cloud computing": "Cloud Computing",
  cloud: "Cloud Computing",
  "cyber security": "Cyber Security",
  cyber: "Cyber Security",
  security: "Cyber Security",
  "web development": "Web Development",
  "web dev": "Web Development",
  "mht cet": "MHT CET",
  "mht-cet": "MHT CET",
  cet: "MHT CET",
};

// University / College Normalization Map
const UNIVERSITY_MAP = {
  sppu: "SPPU",
  "pune university": "SPPU",
  "savitribai phule pune university": "SPPU",
  mu: "Mumbai University",
  "mumbai university": "Mumbai University",
  vtu: "VTU",
  aktu: "AKTU",
  "anna university": "Anna University",
  gtu: "GTU",
  ipu: "IPU",
  du: "Delhi University",
};

// Branch / Stream Map
const BRANCH_MAP = {
  "ai & ds": "AI & DS",
  "ai and ds": "AI & DS",
  "ai/ds": "AI & DS",
  aids: "AI & DS",
  "computer science": "Computer Science",
  cs: "Computer Science",
  cse: "Computer Science",
  "information technology": "Information Technology",
  it: "Information Technology",
  mechanical: "Mechanical",
  mech: "Mechanical",
  civil: "Civil",
  electrical: "Electrical",
  electronics: "Electronics",
  entc: "Electronics & Telecommunication",
};

// Resource Type Keywords
const TYPE_PATTERNS = [
  { type: "pyq", regex: /\b(pyq|pyqs|previous year|past year|past paper|old paper|exam paper|question paper)\b/i },
  { type: "question_bank", regex: /\b(question bank|questions bank|imp questions|important questions|imp q|imp question|qb)\b/i },
  { type: "note", regex: /\b(note|notes|handwritten|lecture note|lecture notes|short notes|revision note|formula sheet)\b/i },
  { type: "book", regex: /\b(book|books|textbook|textbooks|reference book)\b/i },
];

/**
 * 1. Extract Academic Entities, Intent, and Constraints from Natural Language
 */
function extractEntitiesAndIntent(text = "", previousContext = {}) {
  const lower = text.toLowerCase().trim();

  const extracted = {
    subject: previousContext.subject || null,
    semester: previousContext.semester || null,
    university: previousContext.university || null,
    branch: previousContext.branch || null,
    resourceTypes: Array.isArray(previousContext.resourceTypes) ? [...previousContext.resourceTypes] : [],
    difficulty: previousContext.difficulty || null,
    purpose: previousContext.purpose || null,
    isUrgent: false,
    rawQuery: text,
  };

  // Detect Subject
  for (const [key, canonical] of Object.entries(SUBJECT_MAP)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(lower)) {
      extracted.subject = canonical;
      break;
    }
  }

  // Detect Semester
  const semMatch = lower.match(/\b(semester\s*([1-8])|sem\s*([1-8])|([1-8])(?:st|nd|rd|th)?\s*sem|s([1-8]))\b/i);
  if (semMatch) {
    const num = semMatch[2] || semMatch[3] || semMatch[4] || semMatch[5];
    if (num) {
      extracted.semester = `Semester ${num}`;
    }
  }

  // Detect University
  for (const [key, canonical] of Object.entries(UNIVERSITY_MAP)) {
    const regex = new RegExp(`\\b${key}\\b`, "i");
    if (regex.test(lower)) {
      extracted.university = canonical;
      break;
    }
  }

  // Detect Branch
  for (const [key, canonical] of Object.entries(BRANCH_MAP)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    if (regex.test(lower)) {
      extracted.branch = canonical;
      break;
    }
  }

  // Detect Resource Types requested
  const matchedTypes = [];
  for (const item of TYPE_PATTERNS) {
    if (item.regex.test(lower)) {
      matchedTypes.push(item.type);
    }
  }
  if (matchedTypes.length > 0) {
    extracted.resourceTypes = matchedTypes;
  }

  // Detect Difficulty Level
  if (/\b(beginner|easy|basics?|weak in|starter|fundamentals?|simple)\b/i.test(lower)) {
    extracted.difficulty = "Beginner";
  } else if (/\b(advanced|deep|in-depth|expert|hard)\b/i.test(lower)) {
    extracted.difficulty = "Advanced";
  } else if (/\b(intermediate|moderate)\b/i.test(lower)) {
    extracted.difficulty = "Intermediate";
  }

  // Detect Purpose & Urgency
  if (/\b(tomorrow|tonight|few hours|urgent|emergency)\b/i.test(lower)) {
    extracted.isUrgent = true;
    extracted.purpose = "Last-Minute Exam Prep";
  } else if (/\b(exam|examination|test|midterm|endsem|finals?|prepare|preparation)\b/i.test(lower)) {
    extracted.purpose = "Exam Preparation";
  } else if (/\b(revise|revision|quick review|summary)\b/i.test(lower)) {
    extracted.purpose = "Quick Revision";
  } else if (/\b(concept|learning|study|understand)\b/i.test(lower)) {
    extracted.purpose = "Concept Learning";
  }

  return extracted;
}

/**
 * 2. Calculate Semantic & Metadata Match Score between Query Context and a Resource
 */
function scoreResource(resource, context) {
  let score = 0;
  let matchReasons = [];

  const resTitle = (resource.title || "").toLowerCase();
  const resSubject = (resource.subject || "").toLowerCase();
  const resDesc = (resource.description || "").toLowerCase();
  const resType = (resource.type || "").toLowerCase();
  const resSem = (resource.semester || "").toLowerCase();
  const resBranch = (resource.branch || "").toLowerCase();
  const resUniv = (resource.university || "").toLowerCase();
  const resDiff = (resource.difficulty || "Beginner").toLowerCase();
  const resTags = Array.isArray(resource.tags) ? resource.tags.map((t) => t.toLowerCase()) : [];

  // A. Subject Match (Weight: 35 points)
  if (context.subject) {
    const targetSub = context.subject.toLowerCase();
    if (resSubject === targetSub || resTitle.includes(targetSub)) {
      score += 35;
      matchReasons.push("Exact Subject Match");
    } else {
      // Semantic Relatedness (e.g. AI <-> Machine Learning, DSA <-> Data Structures)
      const RELATED = {
        "artificial intelligence": ["machine learning", "deep learning", "ai & ds", "ai"],
        "machine learning": ["artificial intelligence", "deep learning", "ai & ds", "ai"],
        "data structures": ["dsa", "data structures & algorithms", "algorithms"],
        "computer networks": ["networking", "cyber security"],
      };
      const relatedList = RELATED[targetSub] || [];
      let isRelated = false;
      for (const rel of relatedList) {
        if (resSubject.includes(rel) || resTitle.includes(rel) || resBranch.includes(rel)) {
          score += 30;
          matchReasons.push("Related Subject Match");
          isRelated = true;
          break;
        }
      }

      if (!isRelated) {
        // Partial / keyword match on subject words
        const subWords = targetSub.split(/\s+/).filter((w) => w.length > 2);
        let matchCount = 0;
        for (const w of subWords) {
          if (resTitle.includes(w) || resSubject.includes(w) || resDesc.includes(w) || resTags.includes(w)) {
            matchCount++;
          }
        }
        if (matchCount > 0) {
          const partialScore = Math.min(26, Math.round((matchCount / subWords.length) * 28));
          score += partialScore;
          matchReasons.push("Subject Topic Match");
        }
      }
    }
  } else {
    // If no specific canonical subject extracted, inspect non-stopword tokens in rawQuery
    const rawTokens = (context.rawQuery || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 3 &&
          ![
            "need",
            "give",
            "show",
            "some",
            "want",
            "have",
            "with",
            "from",
            "that",
            "this",
            "what",
            "should",
            "study",
            "lecture",
            "notes",
            "material",
            "resource",
            "resources",
          ].includes(w),
      );

    if (rawTokens.length > 0) {
      let tokenMatches = 0;
      for (const token of rawTokens) {
        if (
          resTitle.includes(token) ||
          resSubject.includes(token) ||
          resDesc.includes(token) ||
          resUniv.includes(token)
        ) {
          tokenMatches++;
        }
      }
      if (tokenMatches > 0) {
        score += Math.min(30, tokenMatches * 15);
        matchReasons.push("Topic Keyword Match");
      } else {
        // Query had specific topic words but none matched this resource
        return { score: 0, reasons: [] };
      }
    } else {
      score += 10;
    }
  }

  // B. Resource Type Match (Weight: 25 points)
  if (context.resourceTypes && context.resourceTypes.length > 0) {
    let typeMatched = false;
    for (const requestedType of context.resourceTypes) {
      if (requestedType === "pyq") {
        if (resType === "pyq" || resTitle.includes("pyq") || resDesc.includes("pyq") || resTitle.includes("previous year")) {
          score += 25;
          typeMatched = true;
          matchReasons.push("PYQ Match");
          break;
        }
      } else if (requestedType === "question_bank") {
        if (resType === "question_bank" || resTitle.includes("question") || resDesc.includes("important question") || resTitle.includes("important")) {
          score += 25;
          typeMatched = true;
          matchReasons.push("Question Bank Match");
          break;
        }
      } else if (requestedType === "note") {
        if (resType === "note" || resTitle.includes("note") || resDesc.includes("note")) {
          score += 25;
          typeMatched = true;
          matchReasons.push("Notes Match");
          break;
        }
      } else if (requestedType === "book") {
        if (resType === "book" || resTitle.includes("book")) {
          score += 25;
          typeMatched = true;
          matchReasons.push("Book Match");
          break;
        }
      }
    }
    if (!typeMatched) {
      score += 5;
    }
  } else {
    score += 15;
  }

  // C. Semester Match (Weight: 15 points)
  if (context.semester) {
    const targetSem = context.semester.toLowerCase();
    if (resSem === targetSem || resTitle.includes(targetSem) || resDesc.includes(targetSem)) {
      score += 15;
      matchReasons.push(`${context.semester} Match`);
    } else if (resSem && resSem !== "semester 1" && resSem !== targetSem) {
      score -= 10;
    }
  } else {
    score += 8;
  }

  // D. University & Course/Branch Match (Weight: 10 points)
  if (context.university) {
    const targetUniv = context.university.toLowerCase();
    if (resUniv.includes(targetUniv) || resTitle.includes(targetUniv) || resDesc.includes(targetUniv)) {
      score += 6;
      matchReasons.push(`${context.university} Match`);
    }
  }
  if (context.branch) {
    const targetBranch = context.branch.toLowerCase();
    if (resBranch.includes(targetBranch) || resTitle.includes(targetBranch) || resDesc.includes(targetBranch)) {
      score += 4;
      matchReasons.push(`${context.branch} Match`);
    }
  }

  // E. Difficulty & Purpose Match (Weight: 10 points)
  if (context.difficulty) {
    const targetDiff = context.difficulty.toLowerCase();
    if (resDiff === targetDiff || resDesc.includes(targetDiff) || resTitle.includes(targetDiff)) {
      score += 7;
      matchReasons.push(`${context.difficulty}-friendly`);
    } else if (context.difficulty === "Beginner" && (resTitle.includes("easy") || resDesc.includes("easy"))) {
      score += 7;
      matchReasons.push("Easy to understand");
    }
  }
  if (context.purpose === "Exam Preparation" || context.purpose === "Last-Minute Exam Prep") {
    if (resType === "pyq" || resType === "question_bank" || resTitle.includes("imp") || resTitle.includes("pyq")) {
      score += 5;
    }
  }

  // F. Popularity & Quality Boost (Weight: 5 points)
  if (resource.isFeatured) score += 2;
  if (resource.downloads > 0) score += Math.min(3, Math.round(resource.downloads / 5));

  // Clamp score between 10 and 98
  const normalizedScore = Math.max(10, Math.min(98, Math.round(score)));

  return {
    score: normalizedScore,
    reasons: matchReasons,
  };
}

/**
 * 3. Search and Rank Approved Resources from the Database
 */
function searchAndRankResources(context, resources = []) {
  const scoredList = [];

  for (const resource of resources) {
    // Only approved, unsold resources
    if (resource.status !== "approved") continue;

    const { score, reasons } = scoreResource(resource, context);

    // Minimum relevance threshold: 40% match
    if (score >= 40) {
      scoredList.push({
        resource,
        matchScore: score,
        reasons,
      });
    }
  }

  // Sort descending by matchScore
  scoredList.sort((a, b) => b.matchScore - a.matchScore);

  return scoredList;
}

/**
 * 4. Generate Study Order Recommendation
 */
function generateStudyOrder(topRankedItems) {
  if (!topRankedItems || topRankedItems.length === 0) return [];

  const pyqs = topRankedItems.filter(
    (i) =>
      i.resource.type === "pyq" ||
      i.resource.title.toLowerCase().includes("pyq") ||
      i.resource.title.toLowerCase().includes("previous year")
  );
  const qb = topRankedItems.filter(
    (i) =>
      (i.resource.type === "question_bank" ||
        i.resource.title.toLowerCase().includes("important") ||
        i.resource.title.toLowerCase().includes("question bank")) &&
      !i.resource.title.toLowerCase().includes("pyq") &&
      !i.resource.title.toLowerCase().includes("previous year") &&
      i.resource.type !== "pyq"
  );
  const notes = topRankedItems.filter(
    (i) =>
      (i.resource.type === "note" ||
        i.resource.title.toLowerCase().includes("notes") ||
        i.resource.title.toLowerCase().includes("note")) &&
      i.resource.type !== "pyq" &&
      i.resource.type !== "question_bank"
  );
  const books = topRankedItems.filter(
    (i) =>
      i.resource.type === "book" &&
      !i.resource.title.toLowerCase().includes("pyq") &&
      !i.resource.title.toLowerCase().includes("question")
  );

  const ordered = [];
  if (notes.length > 0) {
    ordered.push(`1. ${notes[0].resource.title} (Build core conceptual foundation)`);
  }
  if (qb.length > 0) {
    ordered.push(`${ordered.length + 1}. ${qb[0].resource.title} (Master high-frequency exam questions)`);
  }
  if (pyqs.length > 0) {
    ordered.push(`${ordered.length + 1}. ${pyqs[0].resource.title} (Simulate exam questions & test timing)`);
  }
  if (books.length > 0 && ordered.length < 3) {
    ordered.push(`${ordered.length + 1}. ${books[0].resource.title} (Comprehensive reference)`);
  }

  return ordered;
}

/**
 * 5. Handle Incomplete User Queries with Helpful Follow-up Questions
 */
function checkIncompleteQuery(context, rawQuery) {
  const lower = (rawQuery || "").toLowerCase().trim();

  // Purely generic demand without subject (e.g. "I need notes", "give me study material")
  const isPurelyGeneric =
    /^(i need|give me|show me|want|looking for)?\s*(some\s*)?(notes|study material|resources|materials|material|books?|papers?|pyqs?)[\s.?!]*$/i.test(
      lower,
    );
  if (isPurelyGeneric && !context.subject) {
    return {
      isIncomplete: true,
      followUp: "Sure! Which subject or topic are you looking for study material in?",
      quickOptions: [
        "Machine Learning",
        "Data Structures",
        "Engineering Mathematics",
        "Operating Systems",
        "Computer Networks",
      ],
    };
  }

  // If user specifically asked for notes for a subject like "I need notes for Data Structures" without semester
  const isVagueSubjectOnly =
    /^(i need notes for|give me notes for|notes for|study material for)\s+([a-z\s]+)$/i.test(
      lower,
    );
  if (isVagueSubjectOnly && context.subject && !context.semester) {
    return {
      isIncomplete: true,
      followUp: `Sure! Which semester are you studying in for ${context.subject}?`,
      quickOptions: [
        "Semester 1",
        "Semester 2",
        "Semester 3",
        "Semester 4",
        "Semester 5",
        "Semester 6",
      ],
    };
  }

  return { isIncomplete: false };
}

/**
 * 6. Main Chatbot Pipeline - Orchestrates Natural Language Understanding & Recommendations
 */
async function processChatbotQuery({ message, conversationHistory = [], currentContext = {}, allResources = [] }) {
  // 1. Extract entities & academic intent
  const context = extractEntitiesAndIntent(message, currentContext);

  // 2. Check for missing critical info to ask follow-up questions
  const incompleteCheck = checkIncompleteQuery(context, message);
  if (incompleteCheck.isIncomplete) {
    return {
      reply: incompleteCheck.followUp,
      quickOptions: incompleteCheck.quickOptions,
      recommendations: [],
      studyOrder: [],
      followUp: incompleteCheck.followUp,
      extractedContext: context,
    };
  }

  // 3. Search and Rank from EduResourceMine's actual database
  const rankedResults = searchAndRankResources(context, allResources);

  // 4. Handle No Results Found (Do NOT invent fake resources)
  if (rankedResults.length === 0) {
    const suggestedSearches = [];
    if (context.subject) {
      suggestedSearches.push(`${context.subject} Notes`);
      suggestedSearches.push(`${context.subject} PYQs`);
      suggestedSearches.push(`${context.subject} Question Bank`);
    } else {
      suggestedSearches.push("Data Structures Notes");
      suggestedSearches.push("Machine Learning PYQs");
      suggestedSearches.push("BEE Notes");
    }

    return {
      reply: `I couldn't find an exact match in EduResourceMine for your requirement.\n\nTry searching for:\n${suggestedSearches.map((s) => `• ${s}`).join("\n")}\n\nYou can also try changing the semester or resource type.`,
      quickOptions: suggestedSearches,
      recommendations: [],
      studyOrder: [],
      followUp: null,
      extractedContext: context,
    };
  }

  // 5. Select Top Recommendations (up to 3-4 top matches)
  const topMatches = rankedResults.slice(0, 4);

  // Format Top Recommended Items for Frontend Cards
  const recommendations = topMatches.map((item) => ({
    id: item.resource.id,
    title: item.resource.title,
    type: item.resource.type || "note",
    subject: item.resource.subject || context.subject || "General",
    semester: item.resource.semester || context.semester || "Semester 1",
    branch: item.resource.branch || context.branch || "General",
    university: item.resource.university || context.university || "",
    difficulty: item.resource.difficulty || context.difficulty || "Beginner",
    description: item.resource.description || "Verified educational resource available on EduResourceMine.",
    matchScore: item.matchScore,
    matchReasons: item.reasons,
    price: item.resource.price || 0,
    image: item.resource.image || "",
    isFeatured: item.resource.isFeatured || false,
    views: item.resource.views || 0,
    downloads: item.resource.downloads || 0,
  }));

  // Generate Suggested Study Order
  const studyOrder = generateStudyOrder(topMatches);

  // 6. Build Contextual Friendly Reply Message
  const parts = [];
  if (context.difficulty === "Beginner") parts.push("beginner-friendly");
  if (context.subject) parts.push(context.subject);
  if (context.semester) parts.push(context.semester);
  if (context.university) parts.push(context.university);
  if (context.branch) parts.push(context.branch);

  const descriptor = parts.length > 0 ? parts.join(" ") : "relevant";

  let replyText = "";
  if (context.isUrgent) {
    replyText = `Understood! ⏳ Since your exam is coming up, here are the highest-priority study materials from EduResourceMine for quick revision:\n`;
  } else if (context.purpose === "Exam Preparation") {
    replyText = `Got it! 👌 You're looking for ${descriptor} resources, optimized for exam preparation.\n\nHere are the best matches from EduResourceMine:`;
  } else {
    replyText = `Here are the most relevant ${descriptor} resources from EduResourceMine for you:`;
  }

  return {
    reply: replyText,
    recommendations,
    studyOrder,
    followUp: null,
    extractedContext: context,
    quickOptions: [],
  };
}

module.exports = {
  extractEntitiesAndIntent,
  scoreResource,
  searchAndRankResources,
  generateStudyOrder,
  processChatbotQuery,
  SUBJECT_MAP,
  UNIVERSITY_MAP,
};
