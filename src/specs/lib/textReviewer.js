/**
 * TalentTree Specs Generator — Text Reviewer
 *
 * A second-pass "editor" over extracted or pasted brief text. Fixes the
 * cosmetic extraction artifacts that made output look unprofessional
 * (user-reported 2026-08: "random enters", broken words, stray spaces):
 *
 *   - broken words from PDF glyph-run splits:
 *       "term s" -> "terms", "i nsurance" -> "insurance",
 *       "Th e" -> "The", "Reta il" -> "Retail",
 *       "lead ership" -> "leadership", "opportunitie s" -> "opportunities"
 *   - soft visual line wraps inside sentences, including line-break
 *     hyphenation: "e-\ncommerce" -> "e-commerce"
 *   - stray spaces around hyphens in compounds: "Full - time" -> "Full-time"
 *   - spaces before punctuation: "journeys , CRM" -> "journeys, CRM"
 *   - inconsistent bullet spacing: "•   item" / "• - item" -> "• item"
 *   - whitespace-only lines and runs of 3+ blank lines
 *   - consecutive duplicate lines (page-break artifacts) and duplicate
 *     application lines
 *   - legacy application address: applications@talenttree.co.za -> CV@talenttree.co.za
 *
 * Design notes
 * ------------
 * Broken-word merging only happens when the joined token is in
 * WORD_DICTIONARY (curated job-brief vocabulary). Two space-separated
 * words are therefore never merged unless their concatenation is a known
 * word, which keeps "R and D" and "full time" untouched.
 *
 * A fragment that is itself a complete common word (article, pronoun,
 * preposition, single letter, or a blocker word such as "sure") earns no
 * points, and a candidate merge is only accepted when at least one
 * fragment is clearly a broken piece. This is what keeps
 * "the m anager" -> "the manager" instead of "them anager", and
 * "as sure" -> "as sure" instead of "assure".
 *
 * Soft-wrap reflow is deliberately conservative: a line is joined only when
 * it begins with a lowercase continuation and the previous line is not a
 * recognised heading/numbered item or a completed sentence. This preserves
 * document structure while removing PDF/Word visual wrapping before output.
 *
 * The pass is idempotent — reviewText(reviewText(x)) === reviewText(x) —
 * because it is applied in BOTH parse.js (after extraction) and
 * sanitize.js (after redaction); the second run must be a no-op.
 */

// ── Words that are essentially always standalone ───────────────────────────
// If either fragment of a would-be merge is one of these (or a single
// letter), that fragment contributes no "broken piece" evidence.
const STANDALONE_WORDS = new Set([
  // single letters
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n",
  "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",
  // articles / prepositions / conjunctions
  "an", "the", "and", "or", "but", "if", "as", "at", "by", "for", "from",
  "in", "into", "of", "off", "on", "onto", "out", "over", "to", "up",
  "with", "within", "without", "under", "upon", "among", "between",
  "during", "through", "until", "while", "after", "before", "again",
  "once", "here", "there", "where", "when", "why", "how", "what",
  "which", "who", "whom", "whose", "per", "via", "near", "since",
  // auxiliaries / be / modal
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does",
  "did", "done", "doing", "have", "has", "had", "having", "will",
  "would", "shall", "should", "can", "could", "may", "might", "must",
  // pronouns
  "we", "you", "he", "she", "it", "they", "them", "their", "these",
  "those", "this", "that", "i", "me", "my", "us", "our", "yours", "his",
  "her", "hers", "its", "him",
  // determiners / adverbs / misc function words
  "all", "any", "both", "each", "few", "more", "most", "other", "some",
  "such", "than", "then", "also", "too", "very", "just", "now", "still",
  "only", "no", "not", "so", "yes", "ever", "never", "always", "often",
  "same", "every", "own", "let", "get", "got", "put", "set", "say",
  "said", "see", "saw", "use", "used", "make", "made", "take", "took",
  "come", "came", "go", "went", "gone", "find", "found", "give", "gave",
  "given", "tell", "told", "ask", "asked", "call", "called", "know",
  "knew", "think", "felt", "keep", "kept", "look", "looks", "looking",
  "need", "needs", "needed", "want", "wants", "wanted",
]);

// Blocker words: content words where "frag1 frag2" is a realistic
// two-word phrase, so the merge must be refused even if one fragment
// looks like a broken piece. (e.g. "as sure" must not become "assure")
const BLOCKER_WORDS = new Set([
  "sure", "tend", "fall", "hold", "sight", "ken", "lie", "mind", "case",
]);

// ── Curated job-brief vocabulary ────────────────────────────────────────────
// The ONLY strings that a broken-word merge may produce. Kept to common
// recruitment/HR/business vocabulary; deliberately excludes words that are
// usually two-word phrases (handover, set up, show case, break even...)
// and archaic/prone words (thee, thou).
const WORDS = [
  // headline / user-reported
  "the", "terms", "term", "interest", "interests", "insurance", "retail",
  "leadership", "leader", "leaders", "opportunity", "opportunities",
  "experience", "experiences", "experienced",
  // organisation & structure
  "manager", "managers", "management", "managerial", "director",
  "directors", "directorate", "officer", "officers", "chairperson", "chair",
  "chairman", "board", "team", "teams", "department", "departments",
  "division", "branch", "branches", "unit", "units", "group", "groups",
  "company", "companies", "organisation", "organization", "organisational",
  "organizational", "stakeholder", "stakeholders", "vendor", "vendors",
  "supplier", "suppliers", "partner", "partners", "agency", "agencies",
  "franchise", "franchises", "retailer", "retailers", "bank", "banks",
  "centre", "center", "headquarters", "section", "sections", "enterprise",
  "enterprises", "corporation", "corporate", "firm", "firms", "practice",
  "practices", "divisional",
  // people
  "candidate", "candidates", "applicant", "applicants", "employee",
  "employees", "staff", "workforce", "consultant", "consultants",
  "specialist", "specialists", "professional", "professionals",
  "practitioner", "practitioners", "contractor", "contractors",
  "supervisor", "supervisors", "coordinator", "coordinators",
  "administrator", "administrators", "accountant", "accountants",
  "analyst", "analysts", "engineer", "engineers", "developer",
  "developers", "designer", "designers", "architect", "architects",
  "programmer", "programmers", "researcher", "researchers", "scientist",
  "scientists", "technician", "technicians", "operator", "operators",
  "clerk", "clerks", "assistant", "assistants", "secretary", "secretaries",
  "executive", "executives", "principal", "principals", "associate",
  "associates", "apprentice", "apprentices", "mentor", "mentors",
  "trainee", "trainees", "intern", "interns", "volunteer", "volunteers",
  // roles & vacancies
  "vacancy", "vacancies", "job", "jobs", "role", "roles", "position",
  "positions", "post", "posts", "career", "careers", "profession",
  "employment", "employed", "employing", "employer", "employers", "work",
  "works", "worker", "workers", "working", "occupation", "occupations",
  "field", "fields", "sector", "sectors", "industry", "industries",
  "discipline", "disciplines", "vocation", "vocational", "trade", "trades",
  "craft", "crafts",
  // locations
  "office", "offices", "store", "stores", "outlet", "outlets", "factory",
  "plant", "depot", "depots", "warehouse", "warehouses", "head", "heads",
  "site", "sites", "premises", "campus", "campuses", "location",
  "locations", "address", "addresses", "area", "areas", "region",
  "regions", "province", "provinces", "city", "cities", "town", "towns",
  "district", "districts", "suburb", "suburbs", "suburban", "urban",
  "rural", "national", "regional", "local", "global", "international",
  "south", "african",
  // clients & services
  "client", "clients", "customer", "customers", "consumer", "consumers",
  "audience", "audiences", "account", "accounts", "portfolio",
  "portfolios", "business", "businesses", "service", "services",
  "solution", "solutions", "product", "products", "delivery",
  "deliveries", "support", "supports", "assistance", "care", "advice",
  "advisory", "consulting", "consultancy", "adviser", "advisers",
  "advisor", "advisors",
  // money & finance
  "salary", "salaries", "wage", "wages", "pay", "payment", "payments",
  "pension", "pensions", "medical", "benefit", "benefits", "package",
  "packages", "allowance", "allowances", "bonus", "bonuses", "incentive",
  "incentives", "commission", "commissions", "remuneration",
  "compensation", "stipend", "stipends", "funding", "fund", "funds",
  "finance", "financial", "budget", "budgets", "income", "revenue",
  "revenues", "expense", "expenses", "expenditure", "cost", "costs",
  "fee", "fees", "price", "prices", "pricing", "value", "values",
  "valuation", "estimate", "estimates", "quotation", "quotations", "quote",
  "quotes", "tender", "tenders", "bid", "bids", "bidding", "currency",
  "currencies", "rand", "rands", "deposit", "deposits", "transaction",
  "transactions", "invoice", "invoices", "ledger", "ledgers", "credit",
  "credits", "debit", "debits", "accounting", "audit", "audits", "auditor",
  "auditors", "tax", "taxes", "discount", "discounts", "rebate", "rebates",
  "premium", "premiums", "policy", "policies", "claim", "claims",
  "coverage", "excess", "deductible", "insurer", "insurers", "broker",
  "brokers", "underwriter", "underwriters",
  // planning & operations
  "project", "projects", "programme", "programmes", "program", "programs",
  "initiative", "initiatives", "campaign", "campaigns", "strategy",
  "strategies", "plan", "plans", "planning", "schedule", "schedules",
  "scheduling", "timetable", "timetables", "deadline", "deadlines",
  "target", "targets", "goal", "goals", "objective", "objectives",
  "purpose", "purposes", "mission", "missions", "vision", "visions",
  "roadmap", "roadmaps", "framework", "frameworks", "structure",
  "structures", "process", "processes", "procedure", "procedures",
  "protocol", "protocols", "workflow", "workflows", "method", "methods",
  "methodology", "technique", "techniques", "approach", "approaches",
  "system", "systems", "platform", "platforms", "software", "hardware",
  "application", "applications", "website", "websites", "database",
  "databases", "network", "networks", "server", "servers", "mobile",
  "device", "devices", "equipment", "tool", "tools", "instrument",
  "instruments", "material", "materials", "supplies", "inventory",
  "inventories", "stock", "stocks", "order", "orders", "purchase",
  "purchases", "procurement", "sourcing", "supply", "logistics",
  "transport", "transportation", "shipping", "fulfilment",
  "warehousing", "manufacturing", "production",
  "manufacture", "operation", "operations", "operational", "operating",
  "maintenance", "repair", "repairs", "installation", "installations",
  "commissioning", "testing", "test", "tests", "trial", "trials", "pilot",
  "pilots", "inspection", "inspections", "compliance", "compliant",
  "regulation", "regulations", "regulatory", "legal", "law", "laws",
  "statute", "statutes", "licence", "licences", "license", "licenses",
  "permit", "permits", "certificate", "certificates", "certified",
  "certification", "accreditation", "accreditations", "registration",
  "registrations", "registered", "enrolment", "enrollment",
  "qualification", "qualifications", "diploma", "diplomas", "degree",
  "degrees", "bachelor", "bachelors", "master", "masters", "school",
  "schools", "college", "university", "universities", "education",
  "educational", "matric", "matriculated", "literacy", "numeracy",
  "fluent", "proficiency", "proficient", "language", "languages",
  "english", "afrikaans", "isizulu", "isixhosa",
  // quality & performance
  "quality", "excellence", "excellent", "outstanding", "exceptional",
  "superior", "performance", "productivity", "efficiency",
  "effective", "effectively", "efficient", "efficiently", "results",
  "result", "outcome", "outcomes", "success", "successful",
  "successfully", "improvement", "improvements", "improve", "improved",
  "improving", "growth", "grow", "grew", "growing", "develop", "developed",
  "developing", "development", "innovation", "innovative", "innovate",
  "creativity", "creative", "competence", "competent", "competency",
  "competencies", "capability", "capabilities", "capacity", "capacities",
  "potential", "potentials", "advantage", "advantages", "competitive",
  "competitiveness", "reputation", "reputational", "integrity", "ethics",
  "ethical", "accountability", "accountable", "responsibility",
  "responsibilities", "responsible", "reliability", "reliable",
  "dependable", "consistent", "consistently", "thorough", "thoroughly",
  "meticulous", "attention", "accuracy", "accurate", "accurately",
  "precision", "precise", "precisely", "timely", "time", "punctual",
  "prompt", "promptly", "swift", "swiftly", "rapid", "rapidly", "fast",
  "quick", "quickly", "speed", "speeds",
  // skills & knowledge
  "skill", "skills", "knowledge",
  "expertise", "expert", "experts", "specialism", "specialisms",
  "technical", "technological", "technology", "technologies",
  "scientific", "mathematical", "numerical", "mathematics", "statistics",
  "statistical", "data", "analytics", "analysis", "analytical", "analytic",
  "analytically", "research", "investigation", "investigations",
  "investigate", "investigated", "investigating", "evaluation",
  "evaluations", "evaluate", "evaluated", "evaluating", "assessment",
  "assessments", "assess", "assessed", "assessing", "monitoring",
  "monitor", "monitored", "monitors", "measurement", "measurements",
  "measure", "measured", "measuring", "tracking", "tracing", "reporting",
  "reports", "report", "reported", "documentation", "document",
  "documents", "documented", "record", "records", "recording", "recorded",
  "archive", "archives", "archived", "filing", "file", "files",
  "information", "intelligence", "insight", "insights", "review",
  "reviews", "reviewed", "reviewing", "verification", "verified", "verify",
  "verifying", "validation", "validated", "validate", "validating",
  "assurance", "guarantee", "guarantees", "warranty", "warranties",
  // communication
  "communication", "communications", "communicate", "communicated",
  "communicating", "presentation", "presentations", "present", "presented",
  "presenting", "presenter", "presenters", "verbal", "written", "writing",
  "write", "wrote", "writes", "writer", "writers", "reader", "readers",
  "read", "reading", "speaking", "speaker", "speakers", "listen",
  "listening", "listener", "listeners", "negotiation", "negotiations",
  "negotiate", "negotiated", "negotiating", "negotiator", "negotiators",
  "discussion", "discussions", "discuss", "discussed", "discussing",
  "debate", "debates", "consultation", "consultations", "consult",
  "consulted", "conference", "conferences", "meeting", "meetings", "met",
  "meet", "gather", "gathering", "forum", "forums", "workshop",
  "workshops", "training", "train", "trained", "trainer", "trainers",
  "tutor", "tutors", "tutoring", "coaching", "coach", "coached", "coaches",
  "mentoring", "mentorship", "induction", "onboarding", "orientation",
  "briefing", "briefings", "brief", "briefs", "notice", "notices",
  "notification", "notifications", "announcement", "announcements",
  "announce", "announced", "announcing", "publicity", "public", "private",
  "confidential", "confidentiality", "privacy", "privately", "secret",
  "discretion", "discreet", "discreetly", "security", "safeguard",
  "safeguards", "protect", "protected", "protecting", "protection",
  "oversight", "supervision", "supervise", "supervised", "supervising",
  // interpersonal
  "interpersonal", "personal", "personnel", "personality", "character",
  "characteristic", "characteristics", "attitude", "attitudes",
  "behaviour", "behaviors", "behavior", "behaviours", "manner", "manners",
  "conduct", "disciplined", "motivation", "motivated",
  "motivational", "drive", "driven", "drives", "proactivity", "proactive",
  "proactively", "adaptability", "adaptable", "adapt", "adapting",
  "flexible", "flexibility", "resilience", "resilient", "perseverance",
  "persevere", "persevering", "determination", "determined", "committed",
  "commitment", "commitments", "dedication", "dedicated", "loyal",
  "loyalty", "honesty", "honest", "trustworthy", "trust", "trusted",
  "trusts", "respect", "respectful", "respectfully", "courteous",
  "courtesy", "empathy", "empathetic", "compassion", "compassionate",
  "collaboration", "collaborative", "collaborate", "collaborated",
  "collaborating", "collaborator", "collaborators", "cooperation",
  "cooperative", "cooperate", "cooperated", "cooperating", "teamwork",
  "cohesion", "cohesive", "unity", "unified", "diversity", "diverse",
  "inclusion", "inclusive", "inclusivity", "cultural", "culture",
  "cultures", "environment", "environmental", "atmosphere", "climate",
  "workplace", "workload", "people", "person", "persons", "individual",
  "individuals", "citizen", "citizens", "community", "communities",
  "society", "social",
  // problem solving
  "problem", "problems", "troubleshoot", "troubleshooting",
  "troubleshooter", "troubleshooters", "diagnosis", "diagnoses", "diagnose",
  "diagnosed", "diagnosing", "solve", "solved", "solving", "solver",
  "resolve", "resolved", "resolving", "resolution", "resolutions", "remedy",
  "remedies", "fix", "fixed", "fixing", "correct", "corrected",
  "correcting", "correction", "corrections", "adjust", "adjusted",
  "adjusting", "adjustment", "adjustments", "modify", "modified",
  "modifying", "modification", "modifications", "revise", "revised",
  "revising", "revision", "revisions", "revamp", "revamped", "revamping",
  "overhaul", "overhauled", "overhauling", "restructure", "restructured",
  "restructuring", "reorganisation", "reorganization", "reorganise",
  "reorganized", "reorganizing", "reorganised",
  "reorganising", "streamline", "streamlined", "streamlining", "simplify",
  "simplified", "simplifying", "simplification", "simplifications",
  "automate", "automated", "automating", "automation", "optimize",
  "optimised", "optimizing", "optimization", "optimise",
  "optimising", "optimisation", "optimisations", "maximise",
  "maximised", "maximising", "maximisation", "minimise", "minimised",
  "minimising", "minimisation", "reduce", "reduced", "reducing",
  "reduction", "reductions", "increase", "increased", "increasing",
  "increment", "increments", "expanded", "expanding", "expansion",
  "expansions", "extend", "extended", "extending", "scale", "scaled",
  "scaling", "scalable", "scalability",
  // thinking & analysis
  "understanding", "understand", "understood", "understands",
  "comprehension", "comprehensive", "comprehensively", "detailed", "detail",
  "details", "careful", "carefully", "critical", "critically", "critique",
  "critiques", "criticise", "criticised", "criticising", "log", "logs",
  "logging", "logged", "coordination", "coordinating", "coordinated",
  "coordinate", "coordinates", "align", "aligned", "aligning", "alignment",
  "alignments", "synchronize", "synchronised", "synchronizing",
  "synchronization", "synchronisation", "sync", "synchronise",
  "synchronising", "integrate",
  "integrated", "integrating", "integration", "integrations",
  "consolidate", "consolidated", "consolidating", "consolidation",
  "consolidations", "merge", "merged", "merging", "merger", "mergers",
  "combine", "combined", "combining", "combination", "combinations",
  "unify", "unifying", "unification", "standardise",
  "standardised", "standardising", "standardisation", "standardize",
  "standardized", "standardizing", "standardization",
  "harmonise", "harmonised", "harmonising", "harmonisation", "rationalise",
  "rationalised", "rationalising", "rationalisation", "effectiveness",
  "output", "outputs", "yield", "yields", "throughput", "rank", "ranked",
  "ranking", "ranks", "grade", "grades", "graded", "grading", "grader",
  "graders", "band", "bands", "level", "levels", "tier", "tiers",
  "category", "categories", "categorise", "categorised", "categorising",
  "categorisation", "categorize", "categorized", "categorizing",
  "categorization", "classification", "classifications",
  "classify", "classified", "classifying", "sort", "sorted", "sorting",
  "filter", "filters", "filtered", "filtering", "segment", "segments",
  "segmented", "segmenting", "segmentation", "cluster", "clusters",
  "clustered", "clustering", "mastery", "mastered", "mastering",
  "specialise", "specialised", "specialising", "specialisation",
  "specialization", "specialize", "specialized", "specializing",
  "niche", "niches", "focus", "focused", "focusing",
  "focal", "priority", "priorities", "prioritise", "prioritised",
  "prioritising", "prioritisation", "prioritize", "prioritized",
  "prioritizing", "prioritization",
  // verbs of doing
  "deliver", "delivered", "delivering", "deliverable", "deliverables",
  "produce", "produced", "producing", "manage", "managed", "managing",
  "lead", "leading", "leads", "driving", "maintain", "maintained",
  "maintaining", "implement", "implemented", "implementing",
  "implementation", "handle", "handled", "handling", "administer",
  "administered", "administering", "administration", "guide", "guided",
  "guiding", "guidance", "assist",
  "assisted", "assisting", "help", "helped", "helping", "contribute",
  "contributed", "contributing", "contribution", "contributions",
  "achieve", "achieved", "achieving", "achievement", "achievements",
  "accomplish", "accomplished", "accomplishing", "accomplishment",
  "accomplishments", "attain", "attained", "attaining", "generate",
  "generated", "generating", "generation", "created", "creates",
  "creating", "create", "creation",
  "launch", "launched", "launching", "open", "opened", "opening",
  "openings", "close", "closed", "closing", "start", "started",
  "starting", "begin", "began", "beginning", "continue", "continued",
  "continuing", "ongoing", "current", "currently", "recent", "recently",
  "new", "newly", "latest", "existing", "establish", "established",
  "establishing", "establishment", "operate", "operated",
  // time & duration
  "annual", "annually", "monthly", "weekly", "daily", "hourly", "part",
  "full", "permanent", "temporary", "temp", "temporarily",
  "contract", "contracts", "contracted", "probation",
  "probationary", "tenure", "duration", "period", "year", "years", "month",
  "months", "week", "weeks", "day", "days", "date", "dates",
  "shift", "shifts", "night", "nights", "weekend",
  "weekends", "holiday", "holidays", "vacation", "leave", "sick",
  "casual", "overtime", "hour", "hours",
  "timeframe",
  // contact & general
  "welcome", "example", "examples", "email", "emails", "mail", "phone",
  "phones", "number", "numbers", "contact", "contacts",
  "info", "reference", "references", "referee",
  "referees", "recommendation", "recommendations", "testimonial",
  "testimonials", "submitted", "submitting",
  "submission", "submissions", "sales", "statement", "country",
  "government", "provincial", "municipal", "marketing", "banking",
  "life", "live", "lifestyle",
  // acronyms (split all-caps: "CR M" -> "CRM")
  "crm", "hr", "it", "ms",
];

const WORD_DICTIONARY = new Set(WORDS.map((w) => w.toLowerCase()));

// ── Hyphenated compounds that must never have spaces around the hyphen ─────
const HYPHEN_COMPOUNDS = [
  ["full", "time"],
  ["part", "time"],
  ["long", "term"],
  ["short", "term"],
  ["mid", "term"],
  ["e", "mail"],
  ["e", "commerce"],
  ["e", "learning"],
  ["e", "portfolio"],
  ["e", "sign"],
  ["co", "ordination"],
  ["co", "author"],
  ["co", "founder"],
  ["co", "ordinator"],
  ["on", "line"],
  ["off", "line"],
  ["on", "site"],
  ["off", "site"],
  ["on", "road"],
  ["on", "boarding"],
  ["self", "service"],
  ["self", "assessment"],
  ["self", "assessed"],
  ["self", "driven"],
  ["self", "employed"],
  ["self", "taught"],
  ["self", "starter"],
  ["cross", "functional"],
  ["cross", "selling"],
  ["cross", "departmental"],
  ["multi", "disciplinary"],
  ["multi", "skilled"],
  ["hands", "on"],
  ["decision", "making"],
  ["problem", "solving"],
  ["client", "facing"],
  ["customer", "facing"],
  ["detail", "oriented"],
  ["result", "oriented"],
  ["data", "driven"],
  ["people", "oriented"],
  ["team", "player"],
  ["market", "research"],
  ["quality", "assurance"],
  ["business", "continuity"],
  ["risk", "management"],
  ["project", "management"],
  ["stakeholder", "management"],
  ["workforce", "management"],
  ["change", "management"],
  ["time", "management"],
  ["service", "delivery"],
  ["value", "added"],
  ["well", "known"],
  ["well", "rounded"],
  ["cost", "effective"],
  ["high", "volume"],
  ["low", "cost"],
];

// Bullet glyphs seen in extracted PDFs/DOCX (• · ▪ ● ► ■ ‣ ◦)
const BULLET_GLYPHS = "[\\u2022\\u00b7\\u25aa\\u25cf\\u25b8\\u25ba\\u25c6\\u2023\\u25e6]";
const BULLET_RUN_RE = new RegExp(`^(?:${BULLET_GLYPHS}[ \\t]*)+`);

// Lines that ARE application instructions (used to drop duplicated apply
// lines). Deliberately anchored: a line that merely *contains*
// CV@talenttree.co.za (e.g. "Contact: CV@talenttree.co.za or [removed]")
// must NOT be treated as an apply instruction, or it would swallow the real
// apply line that follows it.
const APPLY_LINE_RE =
  /^(?:apply\b|send\s+(?:your\s+|me\s+|a\s+)?(?:cv|resum|application)\b|email\s+(?:your\s+|me\s+|a\s+)?(?:cv|resum|application)\b|to\s+apply\b|submit\s+your\s+application\b|please\s+send\s+(?:your\s+|me\s+)?(?:cv|resum)\b)/i;

function isApplyLine(line) {
  return APPLY_LINE_RE.test(line);
}

// ── Broken-word merging ─────────────────────────────────────────────────────

function fragmentPoints(frag) {
  // A fragment earns points only if it looks like a genuinely broken piece:
  // not a single letter, not a common standalone word, not a blocker word.
  if (frag.length < 2) return 0;
  const lower = frag.toLowerCase();
  if (STANDALONE_WORDS.has(lower)) return 0;
  if (BLOCKER_WORDS.has(lower)) return 0;
  return 60;
}

function mergeBrokenWords(line) {
  if (line.indexOf(" ") < 0) return line;
  let out = line;

  for (let pass = 0; pass < 6; pass++) {
    const tokens = [...out.matchAll(/[A-Za-z]{1,20}/g)];
    if (tokens.length < 2) break;

    const candidates = [];
    for (let i = 0; i + 1 < tokens.length; i++) {
      const m1 = tokens[i];
      const m2 = tokens[i + 1];
      // Must be separated by exactly one space (tabs/multi-spaces = layout, not a split)
      const between = out.slice(m1.index + m1[0].length, m2.index);
      if (between !== " ") continue;
      const merged = m1[0] + m2[0];
      if (!WORD_DICTIONARY.has(merged.toLowerCase())) continue;
      // At least one fragment must look like a broken piece
      if (fragmentPoints(m1[0]) + fragmentPoints(m2[0]) < 60) continue;
      candidates.push({
        index: m1.index,
        end: m2.index + m2[0].length,
        score: fragmentPoints(m1[0]) + fragmentPoints(m2[0]),
        merged,
      });
    }

    if (candidates.length === 0) break;

    // Resolve overlaps: prefer higher score, then leftmost
    candidates.sort((a, b) => b.score - a.score || a.index - b.index);
    const taken = [];
    for (const c of candidates) {
      if (taken.some((t) => c.index < t.end && c.end > t.index)) continue;
      taken.push(c);
    }
    taken.sort((a, b) => b.index - a.index);

    let next = out;
    for (const c of taken) {
      next = next.slice(0, c.index) + c.merged + next.slice(c.end);
    }
    if (next === out) break;
    out = next;
  }

  return out;
}

// ── Line normalisation ──────────────────────────────────────────────────────

function normaliseLine(line) {
  let l = line.trim();
  if (!l) return "";
  // Bullet glyph run with inconsistent spacing -> single "• "
  const m = l.match(BULLET_RUN_RE);
  if (m) {
    let rest = l.slice(m[0].length);
    // Double marker artifact: "• - item" -> "• item"
    // (only when the dash is followed by whitespace, so "• -5%" is kept)
    rest = rest.replace(/^[-\u2013\u2014][ \t]+/, "");
    l = rest ? `\u2022 ${rest}` : "";
  }
  return l;
}

// ── Soft visual-wrap reflow ─────────────────────────────────────────────────

const NUMBERED_ITEM_RE = /^\d{1,2}[.)]\s+/;
const KNOWN_HEADING_RE = /^(?:about\s+(?:the\s+)?(?:company|client|organisation|organization|business|role)|client\s+overview|role\s+(?:overview|summary|description)|position\s+(?:overview|summary|description)|job\s+(?:overview|summary|description)|key\s+focus\s+areas|key\s+responsibilities|responsibilities|requirements|qualifications|skills(?:\s*&\s*experience)?|experience|competencies|benefits|what\s+we\s+offer|location(?:\s*&\s*type)?|work\s+arrangement|employment\s+type|how\s+to\s+apply|application|apply|to\s+apply)[:\-]?$/i;

function isStructuralPreviousLine(line) {
  return NUMBERED_ITEM_RE.test(line) || KNOWN_HEADING_RE.test(line);
}

function reflowSoftWrappedLines(text) {
  const lines = text.split("\n");
  const out = [];

  for (const line of lines) {
    if (!line) {
      out.push("");
      continue;
    }

    const prevIndex = out.length - 1;
    const previous = prevIndex >= 0 ? out[prevIndex] : "";
    const startsAsLowercaseContinuation = /^[a-z]/.test(line);
    const previousIsCompleteSentence = /[.!?;:]$/.test(previous);

    if (
      previous &&
      startsAsLowercaseContinuation &&
      !previousIsCompleteSentence &&
      !isStructuralPreviousLine(previous)
    ) {
      // Preserve a real hyphen across a visual line wrap: "e-\ncommerce"
      // becomes "e-commerce". Other continuation lines receive one space.
      out[prevIndex] = previous.endsWith("-") ? `${previous}${line}` : `${previous} ${line}`;
      continue;
    }

    out.push(line);
  }

  return out.join("\n");
}

// ── Duplicate line removal ──────────────────────────────────────────────────

function dedupeLines(text) {
  const lines = text.split("\n");
  const out = [];
  let lastKey = ""; // last non-blank line; identical-line dedup survives blank lines
  let lastWasApply = false; // fuzzy apply dedup only: adjacent non-blank lines

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push("");
      lastWasApply = false; // a blank line separates the instructions
      continue;
    }
    const key = line.toLowerCase();
    const isApply = isApplyLine(line);

    // Consecutive identical line (page-break / extraction artifact)
    if (key === lastKey) continue;
    // Two back-to-back application instructions — keep the first
    if (isApply && lastWasApply && line.length < 200) continue;

    out.push(line);
    lastKey = key;
    lastWasApply = isApply;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ── Main entry point ────────────────────────────────────────────────────────

function passOnce(text) {
  // 1. Normalise line endings, nbsp, zero-width chars
  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "");

  // 2. Hyphen compounds with stray spacing: "Full - time" -> "Full-time"
  for (const [a, b] of HYPHEN_COMPOUNDS) {
    const re = new RegExp(`\\b(${a})[ \\t]*-[ \\t]*(${b})\\b`, "gi");
    text = text.replace(re, (_m, p1, p2) => `${p1}-${p2}`);
  }

  // 3. Collapse runs of 2+ spaces to a single space (tabs/newlines kept;
  //    leading/trailing runs are trimmed per line later). A global
  //    (\S)+(\S)-style replace is NOT safe here: overlapping matches
  //    ("h e  t" -> "h e" swallows the "e") leave double spaces behind.
  text = text.replace(/ {2,}/g, " ");

  // 4. Broken words (line-scoped, dictionary-guarded)
  text = text
    .split("\n")
    .map(mergeBrokenWords)
    .join("\n");

  // 5. Space before punctuation: "journeys ," -> "journeys,"
  text = text.replace(/([^\s])[ \t]{1,3}([,.!?;:])/g, "$1$2");

  // 6. Per-line trim + bullet normalisation
  text = text
    .split("\n")
    .map(normaliseLine)
    .join("\n");

  // 7. Rejoin visual PDF/Word wraps that split a sentence across lines.
  text = reflowSoftWrappedLines(text);

  // 8. Collapse runs of 3+ newlines to a single blank line
  text = text.replace(/\n{3,}/g, "\n\n");

  // 9. Drop consecutive duplicate lines + duplicate apply lines
  text = dedupeLines(text);

  // 10. Legacy application address -> standard one
  text = text.replace(/applications@talenttree\.co\.za/gi, "CV@talenttree.co.za");

  return text;
}

export function reviewText(input) {
  if (typeof input !== "string" || !input) return "";

  // Run the pass to a fixed point (max 3 iterations). Some fixes reveal new
  // instances in the output of earlier fixes (e.g. "a . ." -> "a. ." ->
  // "a.."), and the reviewer is applied twice in the pipeline (parse.js and
  // sanitize.js), so idempotency must hold by construction.
  let text = String(input);
  let prev;
  for (let i = 0; i < 3; i++) {
    prev = text;
    text = passOnce(text);
    if (text === prev) break;
  }
  return text.trim();
}

export default reviewText;
