/**
 * TalentTree Specs Generator - Sanitization Engine
 * Product-critical: confidence in data removal is essential for internal adoption
 * Audit-hardened: addresses bare domains, unknown companies, intl phones, hiring manager names, etc.
 */

import { COMPANY_MAP, SORTED_COMPANIES, COMPANY_SUFFIXES, inferIndustryFromContext, DEFAULT_DESCRIPTOR } from "./companyMap.js";
import { reviewText } from "./textReviewer.js";

// ── Regex patterns ──────────────────────────────────────────────────────────

const PATTERNS = {
  // Email - comprehensive
  email: /[a-zA-Z0-9._%+\-']+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,

  // Phone - SA + international
  // SA: 0xx xxx xxxx, +27, (0xx)
  // Intl: +1, +44, etc. with spaces/dashes/parentheses
  phoneSA: /(?:\+27[\s\-]?\(?0?\)?[\s\-]?|0)(?:\d{2,3}[\s\-]?){2,}\d{3,4}\b|\(\d{2,4}\)[\s\-]?\d{3,4}[\s\-]?\d{3,4}/g,
  phoneIntl: /\+(?:1|44|61|33|49|31|34|39|81|82|86|91|971|966|27)[\s\-]?\(?\d{1,4}\)?[\s\-]?(?:\d[\s\-]?){6,}\d/g,

  // URLs - https, www, and bare domains (co.za, com, etc.)
  url: /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+|(?:[a-z0-9\-]+\.)+(?:co\.za|com|io|net|org|tech|app|careers|jobs|ai|co\.uk|de|fr|au)(?:\/[^\s<>"']*)?/gi,

  // Bare company domains like shoprite.co.za without www/https - must be caught
  bareDomain: /\b([a-z0-9\-]+\.)+(co\.za|com|io|net|org|co\.uk)\b/gi,

  // Apply-related links - requires URL or path after keyword
  applyLink: /(?:apply|careers?|jobs?|vacanc(?:y|ies)|recruit|application|join\s*us|work\s*with\s*us)\s*(?:here|now|today)?\s*[:\-]?\s*(?:https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9\-]+\.(?:co\.za|com|io)[^\s]*)/gi,

  // Apply phrases without URL - e.g., "Apply here", "Click here to apply", "Submit your application"
  applyPhrase: /(?:^|\n)\s*(?:Apply\s+(?:here|now|today)|Click\s+here\s+to\s+apply|Submit\s+your\s+application|Apply\s+via\s+our\s+portal|Apply\s+online)[^\n]*$/gim,

  // Internal references - require separator : - # to avoid matching normal words
  internalRef: /\b(?:Ref(?:erence)?|Job\s*Code|Requisition(?:\s*ID)?|Vacancy\s*(?:No|Number)|Internal\s*Ref|Position\s*(?:Code|Ref)|Req(?:uisition)?\s*(?:No|ID)?)\s*[:\-#]\s*[A-Z0-9\-_/]{3,}\b/gi,

  // Confidential notes sections
  confidentialSection: /(?:^|\n)\s*(?:Internal\s*(?:Notes?|Comments?|Use\s*Only|Information)?|Confidential\s*(?:Notes?|Information|Internal)?|Do\s*Not\s*Share|Not\s*for\s*(?:Distribution|Candidates?)|Hiring\s*Manager\s*(?:Notes?|Comments?)|Recruiter\s*Notes?|Notes?\s*to\s*Recruiter|Private\s*Notes?|Internal\s*Comments?)\s*[:\-]?\s*\n[\s\S]{10,500}?(?=\n\s*\n|\n\s*(?:About|Role|Responsibilities|Requirements|Qualifications|Benefits|What\s*We|Location|Salary|Employment|Experience|Skills|Education|Company|Overview|Description|Position|Job\s*Title)\b)/gim,

  // Physical addresses
  address: /\b\d+\s+[A-Za-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Close|Crescent|Way|Boulevard|Blvd|Park|Place)[^\n]{0,80},?[^\n]{0,40}\d{4}\b/gi,

  // Sensitive numbers - VAT, Reg, CK, plus 4-digit/6-digit/2-digit registration
  sensitiveNumbers: /\b(?:VAT|Reg|Registration|Company\s*Reg|CK)\s*(?:No|Number|#)?\s*[:\-]?\s*[0-9/\-]{6,}\b|\b\d{4}\/\d{6,}\/\d{2,}\b/g,

  // SA ID number - 13 digits
  idNumber: /\b(?:ID\s*(?:No|Number)?\s*[:\-]?\s*)?(\d{13})\b/g,

  // Hiring manager / contact person names - e.g., "Contact John Smith, Hiring Manager" or "Hiring Manager: John Smith"
  hiringManager: /(?:Contact|Hiring\s*Manager|Recruiter|Talent\s*Acquisition|HR\s*Contact)\s*[:\-]?\s*([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s*,|\s*\n|\s+is|\s+at|\s*$)/gi,

  // Client employee names in signature-like context
  contactPerson: /\b(?:Contact\s*Person|Contact\s*Name|Hiring\s*Manager\s*Name)\s*[:\-]\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
};

const GENERIC_CONTACT_REPLACEMENT = "CV@talenttree.co.za";
const GENERIC_APPLY_REPLACEMENT = "CV@talenttree.co.za";

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***";
  return `${local.slice(0, 2)}***@***`;
}

function maskPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
}

// ── Company detection ─────────────────────────────────────────────────────

function findCompanyMentions(text) {
  const mentions = [];

  // 1. Known companies from map (longest first) with optional suffixes
  for (const [company, descriptor] of SORTED_COMPANIES) {
    // Build pattern that matches company + optional suffix like " Holdings Ltd"
    const suffixPattern = COMPANY_SUFFIXES.map(s => escapeRegex(s)).join("|");
    const patternStr = `\\b${escapeRegex(company)}(?:${suffixPattern})?\\b`;
    const pattern = new RegExp(patternStr, "gi");
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const overlaps = mentions.some(m => 
        match.index >= m.index && match.index < m.index + m.text.length
      );
      if (!overlaps) {
        mentions.push({
          text: match[0],
          index: match.index,
          length: match[0].length,
          replacement: descriptor,
          source: "known_map",
          original: company,
          fullMatch: match[0],
        });
      }
    }
  }

  // 2. Explicit client declarations like "Client: XYZ Corp" - FIXED to not include newline in capture
  const clientPatterns = [
    // Client: <Name> on same line only (no newline in capture)
    /(?:Client(?:\s*Name)?|Company(?:\s*Name)?|Organisation|Organization|Employer)\s*[:\-]\s*([A-Z][A-Za-z0-9\s&.,\-()']{2,60}?)(?:\n|$)/g,
    // "for/at/with <Name> (Pty) Ltd is seeking"
    /(?:for|at|with)\s+([A-Z][A-Za-z0-9\s&\-']{2,40}?(?:\s*(?:\(Pty\)|Ltd|Limited|Group|Holdings|Corp|Inc|Pty)))\s+(?:is\s+seeking|requires?|looking|has\s+an\s+opening)/gi,
    /Confidential\s*[-–]\s*Client\s*[:\-]?\s*([A-Z][A-Za-z0-9\s&.,\-()']{2,50}?)(?:\n|$)/gi,
  ];

  for (const pattern of clientPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const companyName = (match[1] || "").trim().replace(/\s+$/, "");
      if (companyName.length < 3 || companyName.length > 80) continue;
      if (/leading|national|major|global/i.test(companyName)) continue;
      if (/(manager|developer|engineer|analyst|specialist|officer|consultant|data|years|experience)/i.test(companyName)) continue;
      if (companyName.split(/\s+/).length > 6) continue; // too long, likely sentence
      
      const alreadyFound = mentions.some(m => 
        Math.abs(m.index - match.index) < 5 || 
        m.text.toLowerCase() === companyName.toLowerCase()
      );
      if (alreadyFound) continue;

      const descriptor = inferIndustryFromContext(text, companyName);
      mentions.push({
        text: companyName,
        index: match.index + match[0].indexOf(companyName),
        length: companyName.length,
        replacement: descriptor,
        source: "detected_client_field",
        original: companyName,
        fullMatch: companyName,
      });
    }
  }

  // 3. Unknown company detection: "Join XYZ Corp as..." or "XYZ (Pty) Ltd is hiring"
  // Catches companies not in map but with corporate suffixes
  const unknownPatterns = [
    /\bJoin\s+([A-Z][A-Za-z0-9\s&\-']{2,40}?(?:\s*(?:\(Pty\)\s+Ltd|\(Pty\)|Ltd|Limited|Group|Holdings|Corp|Corporation|Inc|LLC|Pty Ltd)))\s+(?:as|for|is)/gi,
    /\b([A-Z][A-Za-z0-9\s&\-']{2,40}?\s+(?:\(Pty\)\s+Ltd|Ltd|Limited|Group|Holdings|Corp|Corporation|Inc|LLC|Pty Ltd))\s+(?:is\s+hiring|requires|seeks|has\s+an\s+opening)/gi,
  ];

  for (const pattern of unknownPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const companyName = (match[1] || "").trim();
      if (companyName.length < 3 || companyName.length > 60) continue;
      if (/leading|national|major|global|talenttree/i.test(companyName)) continue;
      if (/(manager|developer|engineer|analyst|specialist|officer|requirements|responsibilities)/i.test(companyName)) continue;

      const alreadyFound = mentions.some(m => 
        m.text.toLowerCase() === companyName.toLowerCase() ||
        companyName.toLowerCase().includes(m.text.toLowerCase()) ||
        m.text.toLowerCase().includes(companyName.toLowerCase())
      );
      if (alreadyFound) continue;

      const descriptor = inferIndustryFromContext(text, companyName);
      mentions.push({
        text: companyName,
        index: match.index + match[0].indexOf(companyName),
        length: companyName.length,
        replacement: descriptor,
        source: "unknown_corporate",
        original: companyName,
        fullMatch: companyName,
      });
    }
  }

  return mentions.sort((a, b) => b.length - a.length);
}

// ── Sanitization pipeline ─────────────────────────────────────────────────

export function sanitizeDocument(rawText, options = {}) {
  const logs = [];
  let text = rawText;
  const stats = {
    companyNames: 0,
    emails: 0,
    phones: 0,
    links: 0,
    internalRefs: 0,
    confidentialSections: 0,
    addresses: 0,
    sensitiveNumbers: 0,
  };

  // 1. Confidential sections
  const confidentialMatches = [...text.matchAll(PATTERNS.confidentialSection)];
  if (confidentialMatches.length > 0) {
    for (const match of confidentialMatches) {
      const sectionText = match[0];
      if (sectionText.trim().length > 10 && sectionText.trim().length < 800) {
        logs.push({
          type: "confidential_section",
          original: sectionText.slice(0, 80) + (sectionText.length > 80 ? "..." : ""),
          originalMasked: "[Confidential section]",
          replacement: "[Internal section removed]",
          confidence: "high",
          category: "Confidential Notes",
        });
        stats.confidentialSections++;
      }
    }
    text = text.replace(PATTERNS.confidentialSection, "\n");
  }

  // 2. Emails FIRST
  const emailMatches = [...text.matchAll(PATTERNS.email)];
  const uniqueEmails = [...new Set(emailMatches.map(m => m[0].toLowerCase()))].filter(
    e => !e.includes("talenttree.co.za") && !e.includes("example.com")
  );
  for (const email of uniqueEmails) {
    const count = (text.match(new RegExp(escapeRegex(email), "gi")) || []).length;
    logs.push({
      type: "email",
      original: maskEmail(email),
      originalMasked: maskEmail(email),
      replacement: GENERIC_CONTACT_REPLACEMENT,
      count,
      confidence: "high",
      category: "Contact Information",
      _originalRaw: email, // for internal use but not displayed
    });
    stats.emails += count;
  }
  text = text.replace(PATTERNS.email, (match) => {
    if (match.toLowerCase().includes("talenttree.co.za") || match.toLowerCase().includes("example.com")) {
      return match;
    }
    return GENERIC_CONTACT_REPLACEMENT;
  });

  // 3. Application links with URLs (before company names)
  const applyMatches = [...text.matchAll(PATTERNS.applyLink)];
  if (applyMatches.length > 0) {
    for (const match of applyMatches) {
      logs.push({
        type: "apply_link",
        original: match[0].slice(0, 60) + (match[0].length > 60 ? "..." : ""),
        originalMasked: "Application link",
        replacement: `Apply via ${GENERIC_APPLY_REPLACEMENT}`,
        confidence: "high",
        category: "Application Links",
      });
      stats.links++;
    }
    text = text.replace(PATTERNS.applyLink, `Apply via ${GENERIC_APPLY_REPLACEMENT}`);
  }

  // 3b. Apply phrases without URL (e.g., "Apply here" alone)
  const applyPhraseMatches = [...text.matchAll(PATTERNS.applyPhrase)];
  if (applyPhraseMatches.length > 0) {
    for (const match of applyPhraseMatches) {
      // Only replace if not already containing our generic email
      if (!match[0].toLowerCase().includes("talenttree")) {
        logs.push({
          type: "apply_phrase",
          original: match[0].trim().slice(0, 50),
          originalMasked: "Apply phrase",
          replacement: `Apply via ${GENERIC_APPLY_REPLACEMENT}`,
          confidence: "medium",
          category: "Application Links",
        });
        stats.links++;
      }
    }
    text = text.replace(PATTERNS.applyPhrase, (match) => {
      if (match.toLowerCase().includes("talenttree")) return match;
      return `Apply via ${GENERIC_APPLY_REPLACEMENT}`;
    });
  }

  // 3c. URLs (including bare domains)
  text = text.replace(PATTERNS.url, (match) => {
    const lower = match.toLowerCase();
    if (lower.includes("talenttree.co.za")) return match;
    // If it's an apply/career/job URL, replace with generic email
    if (/(apply|career|job|vacancy|recruit|joinus|workwithus)/i.test(lower) || lower.includes("linkedin.com/jobs")) {
      const alreadyLogged = logs.some(l => l._originalRaw && l._originalRaw.toLowerCase() === lower);
      if (!alreadyLogged) {
        logs.push({
          type: "url",
          original: lower.slice(0, 50),
          originalMasked: "Application URL",
          replacement: GENERIC_APPLY_REPLACEMENT,
          confidence: "medium",
          category: "Application Links",
        });
        stats.links++;
      }
      return GENERIC_APPLY_REPLACEMENT;
    }
    // For any external URL, check if it contains a known company domain
    const domainMatch = lower.match(/([a-z0-9\-]+)\.(co\.za|com|io)/);
    if (domainMatch) {
      const domainRoot = domainMatch[1];
      const isKnownCompany = [...COMPANY_MAP.keys()].some(k => k.toLowerCase().includes(domainRoot) || domainRoot.includes(k.toLowerCase().split(" ")[0]));
      if (isKnownCompany || lower.includes("shoprite") || lower.includes("vodacom") || lower.includes("mtn") || lower.includes("fnb")) {
        logs.push({
          type: "url",
          original: lower.slice(0, 50),
          originalMasked: "Company domain",
          replacement: "[Link removed]",
          confidence: "medium",
          category: "External Links",
        });
        stats.links++;
        return "[Link removed]";
      }
    }
    if (/https?:\/\//i.test(match) || /www\./i.test(match) || /\.(co\.za|com|io|net|org)\b/i.test(match)) {
      // Only remove if not already sanitized and looks like company site
      if (match.length > 8 && !/talenttree/i.test(match)) {
        logs.push({
          type: "url",
          original: lower.slice(0, 50),
          originalMasked: "External link",
          replacement: "[Link removed]",
          confidence: "medium",
          category: "External Links",
        });
        stats.links++;
        return "[Link removed]";
      }
    }
    return match;
  });

  // 4. Company names (after emails and links) - use fullMatch to include suffixes
  const companyMentions = findCompanyMentions(text);
  // Group by replacement, but keep fullMatch texts for replacement
  const replacementGroups = new Map(); // descriptor -> Set of fullMatch strings
  for (const mention of companyMentions) {
    const key = mention.replacement;
    if (!replacementGroups.has(key)) replacementGroups.set(key, new Set());
    // Use fullMatch if available (includes suffixes), else original
    const textToReplace = mention.fullMatch || mention.original;
    replacementGroups.get(key).add(textToReplace);
  }

  // For each descriptor, replace all its associated company strings (longest first)
  for (const [descriptor, texts] of replacementGroups) {
    const sortedTexts = [...texts].sort((a, b) => b.length - a.length);
    for (const companyText of sortedTexts) {
      const pattern = new RegExp(`\\b${escapeRegex(companyText)}\\b`, "gi");
      const matches = [...text.matchAll(pattern)];
      if (matches.length > 0) {
        const isKnown = SORTED_COMPANIES.some(([name]) => name.toLowerCase() === companyText.toLowerCase() || companyText.toLowerCase().includes(name.toLowerCase()));
        logs.push({
          type: "company_name",
          original: companyText,
          originalMasked: isKnown ? companyText : "[Company name]",
          replacement: descriptor,
          count: matches.length,
          confidence: isKnown ? "high" : "medium",
          category: "Client Identity",
        });
        stats.companyNames += matches.length;
        text = text.replace(pattern, descriptor);
      }
    }
  }

  // 4b. Bare domains that are company domains (e.g., shoprite.co.za without www)
  // After company replacement, any remaining bare domains that look like company sites should be removed
  text = text.replace(PATTERNS.bareDomain, (match) => {
    const lower = match.toLowerCase();
    if (lower.includes("talenttree.co.za")) return match;
    // Check if domain root is a known company or looks like company domain
    const root = lower.split(".")[0];
    const isKnown = [...COMPANY_MAP.keys()].some(k => {
      const kRoot = k.toLowerCase().split(" ")[0];
      return kRoot.length > 3 && (root.includes(kRoot) || kRoot.includes(root));
    });
    // Also check if it's in a context that looks like company reference
    if (isKnown || /^[a-z]{4,}\.(co\.za|com)$/i.test(match)) {
      // Only replace if not already generic and not common word
      const commonWords = ["gmail", "yahoo", "outlook", "hotmail", "example", "test", "company", "client", "talenttree"];
      if (!commonWords.some(w => lower.includes(w))) {
        // Check surrounding context - if near company descriptors, likely company domain
        const isNearCompanyContext = /(?:visit|website|careers|jobs|apply|client|company)/i.test(text.slice(Math.max(0, text.indexOf(match) - 30), text.indexOf(match) + 50));
        if (isNearCompanyContext || isKnown) {
          logs.push({
            type: "bare_domain",
            original: lower,
            originalMasked: "Company domain",
            replacement: "[Link removed]",
            confidence: "medium",
            category: "External Links",
          });
          stats.links++;
          return "[Link removed]";
        }
      }
    }
    return match;
  });

  // 5. Phone numbers - SA and International
  const phonePatterns = [PATTERNS.phoneSA, PATTERNS.phoneIntl];
  for (const phonePattern of phonePatterns) {
    const phoneMatches = [...text.matchAll(phonePattern)];
    if (phoneMatches.length > 0) {
      const uniquePhones = [...new Set(phoneMatches.map(m => m[0].trim()))].filter(p => {
        const digits = p.replace(/\D/g, "");
        return digits.length >= 9 && digits.length <= 15;
      });
      for (const phone of uniquePhones) {
        logs.push({
          type: "phone",
          original: maskPhone(phone),
          originalMasked: maskPhone(phone),
          replacement: "[Contact details removed]",
          confidence: "high",
          category: "Contact Information",
          _originalRaw: phone,
        });
      }
      stats.phones += uniquePhones.length;
    }
  }
  // Apply replacements
  text = text.replace(PATTERNS.phoneSA, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 12) return match;
    return "[Contact details removed]";
  });
  text = text.replace(PATTERNS.phoneIntl, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) return match;
    return "[Contact details removed]";
  });

  // 6. Hiring manager / contact person names
  const hiringMatches = [...text.matchAll(PATTERNS.hiringManager)];
  if (hiringMatches.length > 0) {
    for (const match of hiringMatches) {
      const name = match[1];
      if (name && name.split(/\s+/).length >= 2 && name.split(/\s+/).length <= 4) {
        logs.push({
          type: "hiring_manager",
          original: "[Person name]",
          originalMasked: "[Person name]",
          replacement: "[Name removed]",
          confidence: "medium",
          category: "Contact Information",
        });
        stats.phones++; // count as contact info
      }
    }
    text = text.replace(PATTERNS.hiringManager, (match, name) => {
      if (name && name.split(/\s+/).length >= 2) {
        return match.replace(name, "[Name removed]");
      }
      return match;
    });
  }

  const contactPersonMatches = [...text.matchAll(PATTERNS.contactPerson)];
  if (contactPersonMatches.length > 0) {
    for (const match of contactPersonMatches) {
      logs.push({
        type: "contact_person",
        original: "[Person name]",
        originalMasked: "[Person name]",
        replacement: "[Name removed]",
        confidence: "high",
        category: "Contact Information",
      });
      stats.phones++;
    }
    text = text.replace(PATTERNS.contactPerson, (match, name) => match.replace(name, "[Name removed]"));
  }

  // 7. Internal references
  const refMatches = [...text.matchAll(PATTERNS.internalRef)];
  if (refMatches.length > 0) {
    for (const match of refMatches) {
      logs.push({
        type: "internal_ref",
        original: match[0].slice(0, 40),
        originalMasked: "Internal reference",
        replacement: "[Reference removed]",
        confidence: "high",
        category: "Internal References",
      });
      stats.internalRefs++;
    }
    text = text.replace(PATTERNS.internalRef, "[Reference removed]");
  }

  // 8. Addresses
  const addressMatches = [...text.matchAll(PATTERNS.address)];
  if (addressMatches.length > 0) {
    for (const match of addressMatches) {
      logs.push({
        type: "address",
        original: "[Address]",
        originalMasked: "[Address]",
        replacement: "[Location details removed]",
        confidence: "medium",
        category: "Location Data",
      });
      stats.addresses++;
    }
    text = text.replace(PATTERNS.address, "[Location details removed]");
  }

  // 9. Sensitive numbers (VAT, Reg, CK)
  const sensitiveMatches = [...text.matchAll(PATTERNS.sensitiveNumbers)];
  if (sensitiveMatches.length > 0) {
    for (const match of sensitiveMatches) {
      logs.push({
        type: "sensitive_number",
        original: "[Registration number]",
        originalMasked: "[Registration number]",
        replacement: "[Registration details removed]",
        confidence: "high",
        category: "Sensitive Identifiers",
      });
      stats.sensitiveNumbers++;
    }
    text = text.replace(PATTERNS.sensitiveNumbers, "[Registration details removed]");
  }

  // 9b. ID numbers
  const idMatches = [...text.matchAll(PATTERNS.idNumber)];
  if (idMatches.length > 0) {
    for (const match of idMatches) {
      const full = match[0];
      const context = text.slice(Math.max(0, match.index - 30), match.index + 40);
      if (/ID|identity|passport/i.test(context) || /^\d{13}$/.test(full.trim()) || full.toLowerCase().includes("id")) {
        logs.push({
          type: "id_number",
          original: "[ID number]",
          originalMasked: "[ID number]",
          replacement: "[ID Removed]",
          confidence: "high",
          category: "Sensitive Identifiers",
        });
        stats.sensitiveNumbers++;
      }
    }
    text = text.replace(PATTERNS.idNumber, (match, id, offset) => {
      const context = text.slice(Math.max(0, offset - 30), offset + 40);
      if (/ID|identity|passport/i.test(context) || /^\d{13}$/.test(match.trim()) || match.toLowerCase().includes("id")) {
        return "[ID Removed]";
      }
      return match;
    });
  }

  // 10. Clean up artifacts
  text = text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\[Contact details removed\]\s*\[Contact details removed\]/g, "[Contact details removed]")
    .replace(/\[Reference removed\]\s*\[Reference removed\]/g, "[Reference removed]")
    .replace(/\[Link removed\]\s*\[Link removed\]/g, "[Link removed]")
    .trim();

  // 10a. Existing branding removal: canonicalise our own agency name.
  // Source briefs sometimes say "Talent Tree" (with a space); the generated
  // spec is branded "TalentTree" so the body should match.
  const brandMatches = [...text.matchAll(/\bTalent\s+Tree\b/gi)];
  if (brandMatches.length > 0) {
    logs.push({
      type: "branding",
      original: "Talent Tree",
      originalMasked: "Talent Tree",
      replacement: "TalentTree",
      count: brandMatches.length,
      confidence: "high",
      category: "Branding",
    });
    text = text.replace(/\bTalent\s+Tree\b/gi, "TalentTree");
  }

  // 10b. Text review: professional spacing + extraction artifacts
  // (broken words like "term s", "Full - time", spaces before punctuation,
  //  bullet spacing, blank lines, duplicate apply lines, legacy
  //  applications@ address). Idempotent - safe to run after parse.js already
  //  ran it on file uploads.
  text = reviewText(text);

  // 11. Ensure application instruction exists
  if (!text.toLowerCase().includes("cv@talenttree.co.za")) {
    text += `\n\nTo apply, please send your CV to ${GENERIC_APPLY_REPLACEMENT}`;
    logs.push({
      type: "added_instruction",
      original: "No application method found",
      originalMasked: "No application method",
      replacement: `Added: Apply via ${GENERIC_APPLY_REPLACEMENT}`,
      confidence: "high",
      category: "Application Method",
    });
  }

  // 12. Detect unrecognized potential company names that remain
  const remainingPotentialCompanies = [];
  const potentialCompanyPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:\(Pty\)\s+Ltd|Ltd|Limited|Group|Holdings|Inc|Corporation|Pty Ltd)\b/g;
  let potMatch;
  while ((potMatch = potentialCompanyPattern.exec(text)) !== null) {
    const name = potMatch[0];
    if (!COMPANY_MAP.has(name) && !/Leading|National|Major|Global|TalentTree/i.test(name)) {
      remainingPotentialCompanies.push(name);
    }
  }

  // Also detect bare Acme Corp style without Ltd but with Corp suffix that wasn't caught
  const corpPattern = /\b([A-Z][a-z]+\s+(?:Corp|Corporation|Incorporated))\b/g;
  while ((potMatch = corpPattern.exec(text)) !== null) {
    const name = potMatch[0];
    if (!COMPANY_MAP.has(name) && !/Leading|National|Major|Global/i.test(name)) {
      remainingPotentialCompanies.push(name);
    }
  }

  return {
    sanitizedText: text,
    logs,
    stats,
    remainingPotentialCompanies: [...new Set(remainingPotentialCompanies)],
    hasUnrecognizedCompanies: remainingPotentialCompanies.length > 0,
  };
}

// ── Helpers for UI ─────────────────────────────────────────────────────────

export function getSanitizationSummary(result) {
  const { stats, logs } = result;
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  return {
    totalItemsRemoved: total,
    breakdown: stats,
    categories: [...new Set(logs.map(l => l.category))],
    highConfidence: logs.filter(l => l.confidence === "high").length,
    mediumConfidence: logs.filter(l => l.confidence === "medium").length,
  };
}
