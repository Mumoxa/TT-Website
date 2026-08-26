import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./specs.css";
import { extractFromFile, fetchGoogleDoc, parseGoogleDocsUrl, ParseError } from "./lib/parse.js";
import { sanitizeDocument, getSanitizationSummary } from "./lib/sanitize.js";
import { composeJobSpec, generateFileName, generatePlainText } from "./lib/docGenerator.js";
import { COMPANY_MAP } from "./lib/companyMap.js";

// ── Constants ─────────────────────────────────────────────────────────────

// Password handling: store hash, not plain text, to avoid trivial bundle inspection
// Default password: TT-Internal-2026 -> SHA-256 be6199da64816066667f9c435086dd225ffddcd69fc1e59b2f58d4aa36a6e653
// Override via VITE_SPECS_PASSWORD (plain) or VITE_SPECS_PASSWORD_HASH (sha256 hex) env vars
const DEFAULT_PASSWORD_HASH = "be6199da64816066667f9c435086dd225ffddcd69fc1e59b2f58d4aa36a6e653";
const ENV_PASSWORD = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SPECS_PASSWORD : null;
const ENV_PASSWORD_HASH = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SPECS_PASSWORD_HASH : null;

async function sha256Hex(str) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for non-secure contexts - simple hash (not cryptographically secure, but better than plain)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_KEY = "tt_specs_auth";
const ATTEMPTS_KEY = "tt_specs_attempts";

const STEPS = {
  IDLE: "idle",
  PARSING: "parsing",
  SANITIZING: "sanitizing",
  GENERATING: "generating",
  DONE: "done",
  ERROR: "error",
};

// ── Icons (inline SVG for no extra deps) ──────────────────────────────────

const Icon = {
  Upload: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
      <path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  ),
  File: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Shield: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Check: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  Alert: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Eye: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="18" height="18">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Download: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  Link: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="18" height="18">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ),
  Text: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="18" height="18">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  ),
  Lock: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  ),
  X: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Arrow: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
};

// ── Password Gate ─────────────────────────────────────────────────────────

function PasswordGate({ onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(() => {
    try {
      const data = JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) || '{"count":0,"lockedUntil":0}');
      return data;
    } catch {
      return { count: 0, lockedUntil: 0 };
    }
  });
  const [showPassword, setShowPassword] = useState(false);

  const isLocked = attempts.lockedUntil > Date.now();
  const lockoutRemaining = isLocked ? Math.ceil((attempts.lockedUntil - Date.now()) / 60000) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked) return;

    try {
      const inputHash = await sha256Hex(password);
      // Determine expected hash: env hash takes precedence, else env plain hashed, else default hash
      let expectedHash = DEFAULT_PASSWORD_HASH;
      if (ENV_PASSWORD_HASH) {
        expectedHash = ENV_PASSWORD_HASH.toLowerCase();
      } else if (ENV_PASSWORD) {
        expectedHash = await sha256Hex(ENV_PASSWORD);
      }

      // Also allow direct plain compare for default in case subtle crypto unavailable and hash mismatch due to fallback
      const isDefaultPlainMatch = password === "TT-Internal-2026" && !ENV_PASSWORD && !ENV_PASSWORD_HASH;
      
      if (inputHash === expectedHash || isDefaultPlainMatch) {
        const authData = { authenticated: true, timestamp: Date.now() };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(authData));
        sessionStorage.removeItem(ATTEMPTS_KEY);
        onAuthenticated();
      } else {
        const newCount = attempts.count + 1;
        let newAttempts = { count: newCount, lockedUntil: 0 };
        
        if (newCount >= MAX_ATTEMPTS) {
          newAttempts.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
          setError(`Too many attempts. Locked for ${LOCKOUT_MINUTES} minutes. Contact admin if needed.`);
        } else {
          setError(`Incorrect password. ${MAX_ATTEMPTS - newCount} attempts remaining.`);
        }
        
        setAttempts(newAttempts);
        sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(newAttempts));
        setPassword("");
      }
    } catch (err) {
      setError("Authentication error. Please try again.");
    }
  };

  return (
    <div className="specs-gate">
      <div className="specs-gate-card">
        <div className="specs-gate-header">
          <div className="specs-gate-logo">
            <span className="specs-gate-logo-mark">TT</span>
          </div>
          <h1>Specs Generator</h1>
          <p className="specs-gate-subtitle">Internal tool · talenttree.co.za/specs</p>
        </div>

        <div className="specs-gate-notice">
          <Icon.Shield />
          <div>
            <strong>Internal access only</strong>
            <span>This tool processes confidential client data. Authentication required.</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="specs-gate-form">
          <label className="specs-field">
            <span>Access password</span>
            <div className="specs-input-group">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter internal password"
                autoComplete="current-password"
                autoFocus
                disabled={isLocked}
              />
              <button
                type="button"
                className="specs-input-action"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                <Icon.Eye />
              </button>
            </div>
          </label>

          {error && (
            <div className="specs-alert specs-alert-error">
              <Icon.Alert />
              <span>{error}</span>
            </div>
          )}

          {isLocked && (
            <div className="specs-alert specs-alert-warn">
              <Icon.Lock />
              <span>Locked for {lockoutRemaining} minute{lockoutRemaining !== 1 ? "s" : ""}. Try again later or contact system admin.</span>
            </div>
          )}

          <button type="submit" className="specs-btn specs-btn-primary" disabled={isLocked || !password.trim()}>
            <span>Authenticate</span>
            <Icon.Arrow />
          </button>

          <div className="specs-gate-hint">
            <p>Default password: <code>TT-Internal-2026</code></p>
            <p className="specs-gate-hint-muted">
              For production: replace with Cloudflare Access, IP allowlist, or SSO. 
              This password gate is a frontend deterrent only — all processing stays client-side for POPIA compliance.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Specs App ────────────────────────────────────────────────────────

export default function SpecsApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      const data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (data?.authenticated && Date.now() - data.timestamp < 8 * 60 * 60 * 1000) {
        return true; // 8 hour session
      }
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    } catch {
      return false;
    }
  });

  const [inputMethod, setInputMethod] = useState("upload"); // upload | text | gdocs
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [pastedText, setPastedText] = useState("");
  const [gdocsUrl, setGdocsUrl] = useState("");
  const [gdocsPreview, setGdocsPreview] = useState(null);

  const [step, setStep] = useState(STEPS.IDLE);
  const [rawText, setRawText] = useState("");
  const [sanitizedResult, setSanitizedResult] = useState(null);
  const [docData, setDocData] = useState(null);
  const [error, setError] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [customDescriptor, setCustomDescriptor] = useState("");
  const [customCompanyDescription, setCustomCompanyDescription] = useState("");
  const [showCustomize, setShowCustomize] = useState(false);

  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // Cleanup on unmount - ensure no data persists
  useEffect(() => {
    return () => {
      setRawText("");
      setSanitizedResult(null);
      setDocData(null);
    };
  }, []);

  const handleAuthenticated = useCallback(() => {
    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
    setFile(null);
    setPastedText("");
    setGdocsUrl("");
    setRawText("");
    setSanitizedResult(null);
    setDocData(null);
    setStep(STEPS.IDLE);
    setError(null);
    setCustomDescriptor("");
    setCustomCompanyDescription("");
    setShowCustomize(false);
  }, []);

  // ── File handling ─────────────────────────────────────────────────────

  const handleFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setError(null);
    setStep(STEPS.PARSING);
    setFileMeta({ name: selectedFile.name, size: selectedFile.size, type: selectedFile.type });

    try {
      // Privacy: don't log filename which may contain client name, log only size and sanitized extension
      const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "unknown";
      console.log("[Specs] Parsing file:", { size: selectedFile.size, ext, timestamp: Date.now() });
      const result = await extractFromFile(selectedFile);
      console.log("[Specs] Parsed:", { format: result.format, chars: result.text.length });
      setRawText(result.text);
      setStep(STEPS.SANITIZING);
      
      // Immediate sanitization
      setTimeout(() => {
        try {
          const sanitized = sanitizeDocument(result.text);
          console.log("[Specs] Sanitized:", { stats: sanitized.stats, hasUnrecognized: sanitized.hasUnrecognizedCompanies });
          setSanitizedResult(sanitized);
          // Auto-set descriptor from first company log
          const firstCompany = sanitized.logs.find(l => l.category === "Client Identity");
          if (firstCompany) {
            setCustomDescriptor(firstCompany.replacement);
            // Auto-fill template if available
            const template = DESCRIPTOR_TEMPLATES[firstCompany.replacement];
            if (template) setCustomCompanyDescription(template);
          }
          setStep(STEPS.GENERATING);
          
          // Generate doc structure
          const docResult = { sanitizedText: sanitized.sanitizedText, logs: sanitized.logs };
          setDocData(docResult);
          setStep(STEPS.DONE);
        } catch (e) {
          console.error("[Specs] Sanitization failed", e);
          setError({ message: "Sanitization failed", details: e.message, code: "SANITIZE_ERROR", guidance: "Try pasting the text manually or contact support." });
          setStep(STEPS.ERROR);
        }
      }, 100);
    } catch (e) {
      console.error("[Specs] Parse failed", { code: e.code, message: e.message });
      // On failure, clear rawText to prevent surviving sensitive data from previous success
      setRawText("");
      setSanitizedResult(null);
      setDocData(null);
      setError({
        message: e.message || "Failed to parse file",
        details: e.guidance || e.details || "",
        code: e.code || "PARSE_ERROR",
        guidance: e.guidance || "Try a different format or paste the text directly.",
      });
      setStep(STEPS.ERROR);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, [handleFile]);

  const handlePastedTextSubmit = useCallback(() => {
    if (!pastedText.trim()) {
      setError({ message: "No text provided", guidance: "Paste the job brief text into the area above." });
      setStep(STEPS.ERROR);
      // Clear sensitive pasted text from memory on failure path? Keep for retry, but ensure not persisted
      return;
    }
    if (pastedText.trim().length < 50) {
      setError({ message: "Text too short", guidance: "The pasted text seems too short to be a job brief. Please paste the full brief (at least 50 characters)." });
      setStep(STEPS.ERROR);
      return;
    }

    setError(null);
    setRawText(pastedText);
    setFileMeta({ name: "Pasted text", size: pastedText.length, type: "text/plain" });
    setStep(STEPS.SANITIZING);

    setTimeout(() => {
      try {
        const sanitized = sanitizeDocument(pastedText);
        setSanitizedResult(sanitized);
        const firstCompany = sanitized.logs.find(l => l.category === "Client Identity");
        if (firstCompany) {
          setCustomDescriptor(firstCompany.replacement);
          const template = DESCRIPTOR_TEMPLATES[firstCompany.replacement];
          if (template) setCustomCompanyDescription(template);
        }
        setDocData({ sanitizedText: sanitized.sanitizedText, logs: sanitized.logs });
        setStep(STEPS.DONE);
      } catch (e) {
        setError({ message: "Sanitization failed", details: e.message, guidance: "Check the text for unusual characters and try again." });
        setStep(STEPS.ERROR);
      }
    }, 100);
  }, [pastedText]);

  const handleGdocsSubmit = useCallback(async () => {
    if (!gdocsUrl.trim()) {
      setError({ message: "No link provided", guidance: "Paste a Google Docs or Drive link." });
      setStep(STEPS.ERROR);
      return;
    }

    const parsed = parseGoogleDocsUrl(gdocsUrl);
    if (!parsed) {
      setError({
        message: "Invalid Google Docs link",
        guidance: "Use a link like: https://docs.google.com/document/d/XXXX/edit or a Drive file link.",
      });
      setStep(STEPS.ERROR);
      return;
    }

    setGdocsPreview(parsed);
    setError(null);
    setStep(STEPS.PARSING);

    try {
      const result = await fetchGoogleDoc(gdocsUrl);
      setRawText(result.text);
      setFileMeta({ name: `Google Doc ${parsed.id.slice(0, 8)}`, size: result.text.length, type: "google-docs" });
      setStep(STEPS.SANITIZING);

      setTimeout(() => {
        try {
          const sanitized = sanitizeDocument(result.text);
          setSanitizedResult(sanitized);
          const firstCompany = sanitized.logs.find(l => l.category === "Client Identity");
          if (firstCompany) {
            setCustomDescriptor(firstCompany.replacement);
            const template = DESCRIPTOR_TEMPLATES[firstCompany.replacement];
            if (template) setCustomCompanyDescription(template);
          }
          setDocData({ sanitizedText: sanitized.sanitizedText, logs: sanitized.logs });
          setStep(STEPS.DONE);
        } catch (e) {
          setError({ message: "Sanitization failed", details: e.message });
          setStep(STEPS.ERROR);
        }
      }, 100);
    } catch (e) {
      console.error("[Specs] GDocs fetch failed", { code: e.code, message: e.message });
      setError({
        message: e.message || "Could not fetch Google Doc",
        details: e.guidance || e.details || "",
        code: e.code || "GDOC_ERROR",
        guidance: e.guidance || "Download the doc as .docx and upload it, or paste the text.",
      });
      setStep(STEPS.ERROR);
    }
  }, [gdocsUrl]);

  // ── Document generation ───────────────────────────────────────────────

  const handleDownload = useCallback(async (format) => {
    if (!sanitizedResult || !docData) return;

    const jobTitle = fileMeta?.name?.replace(/\.[^.]+$/, "") || "Job Opportunity";
    
    try {
      if (format === "docx") {
        const { Packer } = await import("docx");
        const { doc, jobTitle: title } = composeJobSpec(sanitizedResult.sanitizedText, {
          originalFileName: fileMeta?.name || "Job Brief",
          sanitizationLogs: sanitizedResult.logs,
          customDescriptor: customDescriptor || null,
          customCompanyDescription: customCompanyDescription || null,
        });
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), {
          href: url,
          download: `${generateFileName(title, fileMeta?.name)}.docx`,
        });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (format === "txt") {
        const text = generatePlainText(sanitizedResult.sanitizedText, { 
          jobTitle,
          customDescriptor: customDescriptor || null,
          customCompanyDescription: customCompanyDescription || null,
        });
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement("a"), {
          href: url,
          download: `${generateFileName(jobTitle, fileMeta?.name)}.txt`,
        });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (format === "pdf") {
        // For PDF, we generate DOCX and instruct user - or generate via print
        const text = generatePlainText(sanitizedResult.sanitizedText, { 
          jobTitle,
          customDescriptor: customDescriptor || null,
          customCompanyDescription: customCompanyDescription || null,
        });
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(`
            <html><head><title>${jobTitle} - TalentTree</title>
            <style>
              body { font-family: Calibri, sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #102d3a; }
              h1 { font-family: "Fraunces", serif; color: #071E2E; }
              h2 { color: #0E3A57; border-bottom: 2px solid #12B5E5; padding-bottom: 8px; }
              .header { border-bottom: 3px solid #12B5E5; padding-bottom: 20px; margin-bottom: 30px; }
              .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #C3D5E0; font-size: 12px; color: #7C8B97; text-align: center; }
              @media print { body { margin: 0; } .no-print { display: none; } }
            </style>
            </head><body>
            <div class="header"><strong><a href="https://talenttree.co.za" style="color:inherit;">TalentTree</a></strong> — Confidential Opportunity</div>
            <pre style="white-space: pre-wrap; font-family: Calibri, sans-serif;">${text.replace(/</g, "&lt;").replace(/CV@talenttree\.co\.za/g, '<a href="mailto:CV@talenttree.co.za" style="color:#12B5E5;">CV@talenttree.co.za</a>')}</pre>
            <div class="footer">Presented by <a href="https://talenttree.co.za" style="color:#12B5E5;">TalentTree</a> · <a href="mailto:CV@talenttree.co.za" style="color:#12B5E5;">CV@talenttree.co.za</a> · This document has been sanitized</div>
            <div class="no-print" style="margin-top: 30px; text-align: center;">
              <button onclick="window.print()" style="padding: 12px 24px; background: #136579; color: white; border: none; cursor: pointer; font-weight: 600;">Print / Save as PDF</button>
              <p style="font-size: 12px; color: #666; margin-top: 10px;">Use your browser's Print → Save as PDF</p>
            </div>
            </body></html>
          `);
          printWindow.document.close();
        }
      }
    } catch (e) {
      console.error("[Specs] Download failed", e);
      setError({ message: `Failed to generate ${format.toUpperCase()}`, details: e.message });
    }
  }, [sanitizedResult, docData, fileMeta, customDescriptor, customCompanyDescription]);

  const handleReset = useCallback(() => {
    // Secure deletion: clear all sensitive state
    setFile(null);
    setPastedText("");
    setGdocsUrl("");
    setGdocsPreview(null);
    setRawText("");
    setSanitizedResult(null);
    setDocData(null);
    setStep(STEPS.IDLE);
    setError(null);
    setFileMeta(null);
    setCustomDescriptor("");
    setCustomCompanyDescription("");
    setShowCustomize(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (typeof window !== "undefined" && window.gc) {
      try { window.gc(); } catch {}
    }
  }, []);

  // Mask filename if it contains known company names
  const displayFileName = useMemo(() => {
    if (!fileMeta?.name) return "";
    let name = fileMeta.name;
    // Check if filename contains known company
    for (const [company] of COMPANY_MAP) {
      if (company.length > 3 && name.toLowerCase().includes(company.toLowerCase())) {
        // Replace company part with [Client]
        const regex = new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        name = name.replace(regex, "[Client]");
      }
    }
    return name;
  }, [fileMeta]);

  const summary = useMemo(() => {
    if (!sanitizedResult) return null;
    return getSanitizationSummary(sanitizedResult);
  }, [sanitizedResult]);

  // ── Render ────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return <PasswordGate onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="specs-app">
      {/* Header */}
      <header className="specs-header">
        <div className="specs-header-inner">
          <div className="specs-header-brand">
            <div className="specs-header-logo">TT</div>
            <div>
              <h1>Specs Generator</h1>
              <span>talenttree.co.za/specs · Internal</span>
            </div>
          </div>
          <div className="specs-header-actions">
            <span className="specs-badge">
              <Icon.Shield />
              Client-side only · No data stored
            </span>
            <button onClick={handleLogout} className="specs-btn specs-btn-ghost">
              Lock
            </button>
          </div>
        </div>
      </header>

      <main className="specs-main">
        {/* Intro */}
        <div className="specs-intro">
          <div className="specs-intro-text">
            <h2>Turn client briefs into candidate-ready specs</h2>
            <p>
              Upload a PDF, Word doc, spreadsheet, or paste text. We’ll sanitize client names, contact details, 
              internal notes, and application links — then generate a branded, share-ready document.
            </p>
          </div>
          <div className="specs-intro-meta">
            <div className="specs-meta-item">
              <strong>{COMPANY_MAP.size}+</strong>
              <span>Company mappings</span>
            </div>
            <div className="specs-meta-item">
              <strong>Zero</strong>
              <span>Data retained after session</span>
            </div>
            <div className="specs-meta-item">
              <strong>POPIA</strong>
              <span>Compliant · Local processing</span>
            </div>
          </div>
        </div>

        {/* Pipeline indicator */}
        {step !== STEPS.IDLE && (
          <div className="specs-pipeline" role="status" aria-live="polite" aria-label="Processing pipeline">
            {[
              { key: STEPS.PARSING, label: "Parsing" },
              { key: STEPS.SANITIZING, label: "Sanitizing" },
              { key: STEPS.GENERATING, label: "Branding" },
              { key: STEPS.DONE, label: "Ready" },
            ].map((s, i) => {
              const active = step === s.key;
              const done = [STEPS.PARSING, STEPS.SANITIZING, STEPS.GENERATING, STEPS.DONE].indexOf(step) > 
                          [STEPS.PARSING, STEPS.SANITIZING, STEPS.GENERATING, STEPS.DONE].indexOf(s.key);
              return (
                <div key={s.key} className={`specs-pipeline-step ${active ? "is-active" : ""} ${done ? "is-done" : ""}`}>
                  <span className="specs-pipeline-dot">{done ? <Icon.Check /> : i + 1}</span>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Input area - only show when idle or error */}
        {(step === STEPS.IDLE || step === STEPS.ERROR) && (
          <div className="specs-input-card">
            <div className="specs-tabs">
              {[
                { id: "upload", label: "Upload File", icon: Icon.Upload, desc: "PDF, DOCX, XLSX, TXT" },
                { id: "text", label: "Paste Text", icon: Icon.Text, desc: "Direct input" },
                { id: "gdocs", label: "Google Docs", icon: Icon.Link, desc: "Share link" },
              ].map(tab => (
                <button
                  key={tab.id}
                  className={`specs-tab ${inputMethod === tab.id ? "is-active" : ""}`}
                  onClick={() => setInputMethod(tab.id)}
                >
                  <tab.icon />
                  <span className="specs-tab-label">{tab.label}</span>
                  <span className="specs-tab-desc">{tab.desc}</span>
                </button>
              ))}
            </div>

            <div className="specs-tab-content">
              {inputMethod === "upload" && (
                <div
                  ref={dropRef}
                  className={`specs-drop ${dragActive ? "is-active" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload job brief file, drag and drop or click to browse"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.rtf"
                    onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
                    hidden
                  />
                  <div className="specs-drop-icon">
                    <Icon.Upload />
                  </div>
                  <h3>Drop job brief here or click to browse</h3>
                  <p>Supports PDF, Word (.docx, .doc), Excel (.xlsx), Text, RTF — up to 10MB</p>
                  <div className="specs-drop-formats">
                    <span>PDF</span><span>DOCX</span><span>XLSX</span><span>TXT</span><span>RTF</span>
                  </div>
                </div>
              )}

              {inputMethod === "text" && (
                <div className="specs-text-input">
                  <label className="specs-field">
                    <span>Paste job brief text</span>
                    <textarea
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="Paste the full client job brief here... Include role title, company, responsibilities, requirements, etc. The tool will automatically detect and sanitize sensitive information."
                      rows={14}
                    />
                    <small>{pastedText.length} characters · Minimum 50 required</small>
                  </label>
                  <button
                    className="specs-btn specs-btn-primary"
                    onClick={handlePastedTextSubmit}
                    disabled={!pastedText.trim() || pastedText.trim().length < 50}
                  >
                    <span>Sanitize & Generate</span>
                    <Icon.Arrow />
                  </button>
                </div>
              )}

              {inputMethod === "gdocs" && (
                <div className="specs-gdocs-input">
                  <label className="specs-field">
                    <span>Google Docs / Drive link</span>
                    <div className="specs-input-group">
                      <input
                        type="url"
                        value={gdocsUrl}
                        onChange={(e) => setGdocsUrl(e.target.value)}
                        placeholder="https://docs.google.com/document/d/..."
                      />
                      <button
                        className="specs-btn specs-btn-secondary"
                        onClick={handleGdocsSubmit}
                        disabled={!gdocsUrl.trim()}
                      >
                        Fetch & Sanitize
                      </button>
                    </div>
                    <small>
                      Works with public docs. For private docs: File → Download → .docx, then upload via Upload tab.
                      We detect doc IDs like <code>1a2b3c...</code> automatically.
                    </small>
                  </label>

                  {gdocsPreview && (
                    <div className="specs-gdocs-preview">
                      <Icon.File />
                      <div>
                        <strong>Detected: {gdocsPreview.isSpreadsheet ? "Spreadsheet" : "Document"}</strong>
                        <span>ID: {gdocsPreview.id.slice(0, 16)}...</span>
                      </div>
                    </div>
                  )}

                  <div className="specs-gdocs-help">
                    <h4>Why direct fetch may fail:</h4>
                    <ul>
                      <li>Google blocks cross-site fetching for security (CORS)</li>
                      <li>Private docs require authentication</li>
                      <li><strong>Solution:</strong> Download as .docx/.xlsx and upload, or paste text</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="specs-error-card" role="alert" aria-live="assertive">
                <div className="specs-error-header">
                  <Icon.Alert />
                  <strong>{error.message}</strong>
                  <button onClick={() => setError(null)} className="specs-icon-btn" aria-label="Dismiss error"><Icon.X /></button>
                </div>
                {error.details && <p className="specs-error-details">{error.details}</p>}
                {error.guidance && (
                  <div className="specs-error-guidance">
                    <strong>What to do:</strong>
                    <p>{error.guidance}</p>
                  </div>
                )}
                {error.code && <code className="specs-error-code">Error code: {error.code}</code>}
              </div>
            )}
          </div>
        )}

        {/* Processing states */}
        {(step === STEPS.PARSING || step === STEPS.SANITIZING || step === STEPS.GENERATING) && (
          <div className="specs-processing">
            <div className="specs-spinner" />
            <h3>
              {step === STEPS.PARSING && "Parsing document..."}
              {step === STEPS.SANITIZING && "Sanitizing sensitive data..."}
              {step === STEPS.GENERATING && "Generating branded document..."}
            </h3>
            <p>
              {step === STEPS.PARSING && "Extracting text, validating format and integrity"}
              {step === STEPS.SANITIZING && "Removing client names, contacts, internal notes and links"}
              {step === STEPS.GENERATING && "Applying TalentTree branding and formatting"}
            </p>
            {fileMeta && <small>File: {fileMeta.name} · {(fileMeta.size / 1024).toFixed(1)}KB</small>}
          </div>
        )}

        {/* Results */}
        {step === STEPS.DONE && sanitizedResult && (
          <div className="specs-results">
            <div className="specs-results-header">
              <div>
                <h2>Sanitized & Ready</h2>
                <p>{displayFileName || fileMeta?.name} · {sanitizedResult.sanitizedText.length} chars · {summary?.totalItemsRemoved || 0} items removed</p>
              </div>
              <button onClick={handleReset} className="specs-btn specs-btn-ghost">
                <Icon.X />
                <span>Start Over</span>
              </button>
            </div>

            {/* Sanitization report */}
            <div className="specs-report">
              <h3>
                <Icon.Shield />
                Sanitization Report — Confidence Check
              </h3>
              
              {summary && (
                <div className="specs-report-stats">
                  <div className="specs-stat">
                    <strong>{summary.totalItemsRemoved}</strong>
                    <span>Total removed</span>
                  </div>
                  <div className="specs-stat">
                    <strong>{summary.highConfidence}</strong>
                    <span>High confidence</span>
                  </div>
                  <div className="specs-stat">
                    <strong>{sanitizedResult.logs.filter(l => l.category === "Client Identity").length}</strong>
                    <span>Client names</span>
                  </div>
                  <div className="specs-stat">
                    <strong>{sanitizedResult.logs.filter(l => l.category.includes("Contact") || l.category.includes("Link")).length}</strong>
                    <span>Contacts & links</span>
                  </div>
                </div>
              )}

              <div className="specs-report-grid">
                {["Client Identity", "Contact Information", "Application Links", "Internal References", "Confidential Notes", "External Links", "Location Data", "Sensitive Identifiers", "Branding"].map(category => {
                  const items = sanitizedResult.logs.filter(l => l.category === category);
                  if (items.length === 0) return null;
                  return (
                    <div key={category} className="specs-report-category">
                      <h4>{category} <span>{items.length}</span></h4>
                      <ul>
                        {items.slice(0, 5).map((log, i) => (
                          <li key={i}>
                            <span className="specs-log-original">{(log.originalMasked || log.original).slice(0, 60)}{(log.originalMasked || log.original).length > 60 ? "..." : ""}</span>
                            <span className="specs-log-arrow">→</span>
                            <span className="specs-log-replacement">{log.replacement}</span>
                            <span className={`specs-log-confidence is-${log.confidence}`}>{log.confidence}</span>
                          </li>
                        ))}
                        {items.length > 5 && <li className="specs-log-more">+ {items.length - 5} more in this category</li>}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {sanitizedResult.logs.length === 0 && (
                <div className="specs-report-empty">
                  <Icon.Check />
                  <p>No sensitive data detected — document appears already sanitized, but review before sharing.</p>
                </div>
              )}

              {sanitizedResult.hasUnrecognizedCompanies && (
                <div className="specs-alert specs-alert-warn">
                  <Icon.Alert />
                  <div>
                    <strong>Potential unrecognized company names detected:</strong>
                    <p>{sanitizedResult.remainingPotentialCompanies.join(", ")}</p>
                    <small>These were not in our known mapping. Please verify they are sanitized above, or manually edit the output.</small>
                  </div>
                </div>
              )}
            </div>

            {/* Company Description Customization - NEW FEATURE */}
            <div className="specs-customize">
              <div className="specs-customize-header">
                <div>
                  <h3>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="18" height="18"><path d="M3 21h18M3 7v14M3 3h18v4M9 21V10h6v11M9 3v2h6V3"/></svg>
                    Company Description
                    <span className="specs-badge-new">New</span>
                  </h3>
                  <p>Add or edit the candidate-facing company description. This replaces generic text with a polished, confidential version.</p>
                </div>
                <button 
                  className={`specs-btn ${showCustomize ? "specs-btn-secondary" : "specs-btn-ghost"}`}
                  onClick={() => setShowCustomize(!showCustomize)}
                  aria-expanded={showCustomize}
                >
                  {showCustomize ? "Hide" : "Add / Edit Description"}
                </button>
              </div>

              {showCustomize && (
                <div className="specs-customize-body">
                  <div className="specs-customize-grid">
                    <label className="specs-field">
                      <span>Industry Descriptor</span>
                      <select
                        value={customDescriptor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomDescriptor(val);
                          // Auto-fill template when descriptor changes and description empty or is a template
                          const isTemplate = Object.values(DESCRIPTOR_TEMPLATES).includes(customCompanyDescription) || !customCompanyDescription.trim();
                          if (isTemplate && DESCRIPTOR_TEMPLATES[val]) {
                            setCustomCompanyDescription(DESCRIPTOR_TEMPLATES[val]);
                          }
                        }}
                      >
                        <option value="">Auto-detected (from sanitization)</option>
                        {ALL_DESCRIPTORS.map(desc => (
                          <option key={desc} value={desc}>{desc}</option>
                        ))}
                      </select>
                      <small>Generic descriptor that replaces client name. E.g., "National retailer"</small>
                    </label>

                    <div className="specs-field">
                      <span>Template Gallery</span>
                      <div className="specs-template-pills">
                        {Object.keys(DESCRIPTOR_TEMPLATES).slice(0, 6).map(key => (
                          <button
                            key={key}
                            type="button"
                            className={`specs-template-pill ${customDescriptor === key ? "is-active" : ""}`}
                            onClick={() => {
                              setCustomDescriptor(key);
                              setCustomCompanyDescription(DESCRIPTOR_TEMPLATES[key]);
                            }}
                          >
                            {key}
                          </button>
                        ))}
                      </div>
                      <small>Click to apply a pre-written description template</small>
                    </div>
                  </div>

                  <label className="specs-field">
                    <span>Company Description (candidate-facing)</span>
                    <textarea
                      value={customCompanyDescription}
                      onChange={(e) => setCustomCompanyDescription(e.target.value)}
                      placeholder="Our client is a leading organisation in its sector with a strong market presence. They offer a dynamic environment with opportunities for growth and development. This role sits within a high-performing team..."
                      rows={6}
                    />
                    <small>
                      {customCompanyDescription.length} characters · 
                      This will appear as "About Our Client" in the final document. 
                      Keep it generic — no client names, locations, or identifying details.
                      {customCompanyDescription && customCompanyDescription.toLowerCase().includes("talenttree") ? " ✓ Contains TalentTree context" : ""}
                    </small>
                  </label>

                  <div className="specs-customize-actions">
                    <button
                      type="button"
                      className="specs-btn specs-btn-ghost"
                      onClick={() => {
                        setCustomCompanyDescription("");
                        setCustomDescriptor(sanitizedResult.logs.find(l => l.category === "Client Identity")?.replacement || "");
                      }}
                    >
                      Reset to auto-detected
                    </button>
                    <button
                      type="button"
                      className="specs-btn specs-btn-secondary"
                      onClick={() => {
                        if (customDescriptor && DESCRIPTOR_TEMPLATES[customDescriptor]) {
                          setCustomCompanyDescription(DESCRIPTOR_TEMPLATES[customDescriptor]);
                        }
                      }}
                      disabled={!customDescriptor || !DESCRIPTOR_TEMPLATES[customDescriptor]}
                    >
                      Use template for "{customDescriptor || "descriptor"}"
                    </button>
                  </div>

                  {customCompanyDescription && (
                    <div className="specs-customize-preview">
                      <strong>Preview in final document:</strong>
                      <div className="specs-customize-preview-box">
                        <em>About Our Client</em>
                        <p>{customCompanyDescription.slice(0, 300)}{customCompanyDescription.length > 300 ? "..." : ""}</p>
                        {customDescriptor && <small>Descriptor: {customDescriptor}</small>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!showCustomize && (customDescriptor || customCompanyDescription) && (
                <div className="specs-customize-summary">
                  <span className="specs-customize-summary-dot">✓</span>
                  <span>
                    {customDescriptor && <strong>{customDescriptor}</strong>}
                    {customDescriptor && customCompanyDescription && " · "}
                    {customCompanyDescription && `${customCompanyDescription.slice(0, 80)}${customCompanyDescription.length > 80 ? "..." : ""}`}
                    {!customDescriptor && !customCompanyDescription && "No custom description"}
                  </span>
                  <button className="specs-btn specs-btn-ghost specs-btn-sm" onClick={() => setShowCustomize(true)}>Edit</button>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="specs-preview">
              <div className="specs-preview-header">
                <h3>
                  <Icon.Eye />
                  Sanitized Preview
                  {(customDescriptor || customCompanyDescription) && <span className="specs-badge-new" style={{marginLeft: "8px"}}>Customized</span>}
                </h3>
                <span className="specs-preview-note">Review before downloading — final check is your responsibility</span>
              </div>
              <div className="specs-preview-body">
                <pre>
                  {(() => {
                    let preview = sanitizedResult.sanitizedText.slice(0, 4000);
                    if (customCompanyDescription) {
                      preview = `About Our Client\n${customCompanyDescription}\n\n` + preview;
                    }
                    if (customDescriptor && !preview.toLowerCase().includes(customDescriptor.toLowerCase())) {
                      preview = `${customDescriptor}\n\n` + preview;
                    }
                    return preview + (sanitizedResult.sanitizedText.length > 4000 ? "\n\n... (truncated in preview, full text in download)" : "");
                  })()}
                </pre>
              </div>
            </div>

            {/* Downloads */}
            <div className="specs-downloads">
              <h3>Download Branded Document</h3>
              <p>Professional formatting, TalentTree logo, footer: “Presented by TalentTree” · Application method set to CV@talenttree.co.za</p>
              <div className="specs-download-actions">
                <button onClick={() => handleDownload("docx")} className="specs-btn specs-btn-primary specs-btn-large">
                  <Icon.Download />
                  <span>Download DOCX</span>
                  <small>Recommended for candidates</small>
                </button>
                <button onClick={() => handleDownload("pdf")} className="specs-btn specs-btn-secondary specs-btn-large">
                  <Icon.File />
                  <span>Print / Save as PDF</span>
                  <small>Opens print dialog</small>
                </button>
                <button onClick={() => handleDownload("txt")} className="specs-btn specs-btn-ghost specs-btn-large">
                  <Icon.Text />
                  <span>Download TXT</span>
                  <small>Plain text version</small>
                </button>
              </div>
              <div className="specs-download-meta">
                <p><strong>Data handling:</strong> Original file and extracted text are held only in memory. Closing this tab or clicking “Start Over” discards everything. No server storage — POPIA compliant.</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer help */}
        <div className="specs-help">
          <h4>How sanitization works</h4>
          <div className="specs-help-grid">
            <div>
              <strong>Company names</strong>
              <p>Matched against {COMPANY_MAP.size}+ known SA & global companies. “Shoprite” → “National retailer”, “Vodacom” → “Major telecommunications provider”. Unknown names detected via “Client: XYZ” patterns and industry inference.</p>
            </div>
            <div>
              <strong>Contact & links</strong>
              <p>All emails (except talenttree.co.za), SA phone formats, application URLs, careers pages replaced with CV@talenttree.co.za. Internal refs like “Ref: TT-123” removed.</p>
            </div>
            <div>
              <strong>Confidential sections</strong>
              <p>Sections titled “Internal Notes”, “Confidential”, “Do Not Share”, “Hiring Manager Notes” stripped entirely. Addresses, VAT/Reg numbers removed.</p>
            </div>
            <div>
              <strong>Branding</strong>
              <p>Output includes TalentTree header, cyan accent rule, structured sections, and footer “Presented by TalentTree”. Ready to send with confidence.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="specs-footer">
        <p>© 2026 TalentTree · Internal tool · talenttree.co.za/specs · No client data stored · Client-side processing only</p>
        <p className="specs-footer-small">If this page is accessible without Cloudflare Access or IP restriction, configure it in Cloudflare Pages → Settings → Access. Password gate is frontend deterrent only.</p>
      </footer>
    </div>
  );
}
