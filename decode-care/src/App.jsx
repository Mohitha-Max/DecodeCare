import Tesseract from "tesseract.js";
import { useState, useEffect } from "react";

// ── Password hashing ──────────────────────────────────────────────────────────
const hashPassword = async (pw) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
};

const generateId = () => Math.random().toString(36).slice(2, 10);

// ── Reference ranges ──────────────────────────────────────────────────────────
const RISK_RANGES = {
  hemoglobin:  { lowBelow: 13,   highAbove: 17,   unit: "g/dL",  label: "Hemoglobin",         rangeText: "13–17 g/dL" },
  fbs:         { lowBelow: 70,   highAbove: 99,   unit: "mg/dL", label: "Fasting Blood Sugar", rangeText: "70–99 mg/dL" },
  hba1c:       { lowBelow: 4.0,  highAbove: 5.6,  unit: "%",     label: "HbA1c",              rangeText: "4.0–5.6%" },
  cholesterol: { lowBelow: null, highAbove: 200,  unit: "mg/dL", label: "Total Cholesterol",  rangeText: "<200 mg/dL" },
  creatinine:  { lowBelow: 0.6,  highAbove: 1.2,  unit: "mg/dL", label: "Serum Creatinine",   rangeText: "0.6–1.2 mg/dL" },
  systolic:    { lowBelow: null, highAbove: 120,  unit: "mmHg",  label: "Systolic BP",         rangeText: "<120 mmHg" },
  diastolic:   { lowBelow: null, highAbove: 80,   unit: "mmHg",  label: "Diastolic BP",        rangeText: "<80 mmHg" },
};

// ── FIXED classification: null-safe lowBelow check ────────────────────────────
const classifyValue = (key, val) => {
  const r = RISK_RANGES[key];
  if (!r) return "normal";
  const v = parseFloat(val);
  if (isNaN(v)) return "unknown";
  if (r.lowBelow !== null && r.lowBelow !== undefined && v < r.lowBelow) return "low";
  if (v > r.highAbove) return "high";
  return "normal";
};

// ── Risk computation ──────────────────────────────────────────────────────────
const WEIGHTS = { hemoglobin: 15, fbs: 20, hba1c: 20, cholesterol: 15, creatinine: 15, systolic: 10, diastolic: 5 };

const computeRisk = (values) => {
  let score = 0, total = 0;
  Object.entries(values).forEach(([k, v]) => {
    if (!v || !WEIGHTS[k]) return;
    total += WEIGHTS[k];
    if (classifyValue(k, v) !== "normal") score += WEIGHTS[k];
  });
  return total === 0 ? 0 : Math.round((score / total) * 100);
};

const riskLevel = (pct) => pct <= 30 ? "Low" : pct <= 60 ? "Medium" : "High";
const riskColor = (lvl) => lvl === "Low" ? "#10b981" : lvl === "Medium" ? "#f59e0b" : "#ef4444";

// ── Storage ───────────────────────────────────────────────────────────────────
const USERS_KEY   = "dc_users";
const REPORTS_KEY = "dc_reports";
const SESSION_KEY = "dc_session";

const loadJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const saveJSON  = (k, v)  => localStorage.setItem(k, JSON.stringify(v));

const speakText = (text) => {
  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  const voices = window.speechSynthesis.getVoices();

  speech.voice = voices.find(v =>
    v.name.includes("Google") || v.name.includes("Female")
  ) || voices[0]; // fallback

  speech.rate = 0.95;
  speech.pitch = 1;

  //speech.onend = () => setSpeaking(false);

  window.speechSynthesis.speak(speech);
};
const generateSpeech = (aiData) => {
  if (!aiData) return "No data available.";

  let text = "Here is your health report summary. ";

  if (aiData.summary) {
    text += aiData.summary + ". ";
  }

  if (aiData.conditions?.length) {
    text += "Possible conditions include: ";
    text += aiData.conditions.join(", ") + ". ";
  }

  if (aiData.specialists?.length) {
    text += "You should consult: ";
    text += aiData.specialists.join(", ") + ". ";
  }

  if (aiData.tips?.length) {
    text += "Preventive tips: ";
    text += aiData.tips.join(". ") + ". ";
  }

  return text;
};

// Use local fallback responses until the chatbot has a secure server-side API.
const askGemini = async (message, context = "") => {
  return generateFallbackChatResponse(message, context);
};
 
// Fallback chatbot responses when API is unavailable
const generateFallbackChatResponse = (message, context) => {
  const q = message.toLowerCase();
  
  // More comprehensive health-related questions
  if (q.includes("cholesterol")) {
    return "Cholesterol is a waxy substance in your blood necessary for hormone and vitamin D production. Total cholesterol should be under 200 mg/dL. LDL ('bad' cholesterol) promotes plaque buildup, while HDL ('good' cholesterol) helps remove it. Keep saturated fats low, exercise 150 minutes weekly, eat fiber-rich foods, and maintain healthy weight. Always consult your doctor for personalized cholesterol management.";
  }
  if (q.includes("blood sugar") || q.includes("glucose") || q.includes("diabetes")) {
    return "Blood sugar (glucose) is energy for your cells. Fasting levels should be 70-99 mg/dL. HbA1c (average over 3 months) should be under 5.6% for non-diabetics. High levels increase risk of diabetes, heart disease, and kidney problems. Keys to management: eat balanced meals, regular exercise, maintain healthy weight, reduce refined sugars, and manage stress. Consult your doctor if levels are elevated.";
  }
  if (q.includes("blood pressure") || q.includes("bp") || q.includes("hypertension")) {
    return "Blood pressure (systolic/diastolic) measures force of blood on artery walls. Normal is under 120/80 mmHg. High BP (hypertension) increases heart disease and stroke risk. Management: reduce salt intake, lose excess weight, exercise 30 mins daily, limit alcohol, manage stress, eat DASH diet (rich in fruits, vegetables, whole grains), and monitor regularly. Some medications may be needed—consult your doctor.";
  }
  if (q.includes("hemoglobin") || q.includes("anemia")) {
    return "Hemoglobin in red blood cells carries oxygen throughout your body. Normal is 13-17 g/dL. Low hemoglobin (anemia) causes fatigue, weakness, and shortness of breath. High hemoglobin may indicate dehydration. Causes include iron deficiency, vitamin B12 deficiency, or chronic disease. Iron-rich foods: lean meats, beans, spinach. B12 sources: dairy, eggs, fish. Get adequate sleep and stay hydrated. See your doctor if abnormal.";
  }
  if (q.includes("creatinine") || q.includes("kidney")) {
    return "Creatinine is a waste product from muscle metabolism, filtered by kidneys. Normal is 0.6-1.2 mg/dL. High levels suggest reduced kidney function. Protect kidney health: maintain healthy blood pressure and blood sugar, stay hydrated (drink 8+ glasses water daily), limit sodium, avoid excessive protein, don't overuse NSAIDs, exercise regularly, and maintain healthy weight. Regular checkups are essential—consult your doctor.";
  }
  if (q.includes("hba1c")) {
    return "HbA1c shows your average blood sugar over 2-3 months (reflects long-term glucose control). Normal is 4-5.6%. It's crucial for diabetes screening and management. Regular monitoring helps catch problems early. To lower HbA1c: control carbohydrate intake, exercise 30 mins most days, maintain healthy weight, reduce stress, get adequate sleep, and take medications as prescribed. Consult your doctor for personalized targets.";
  }
  if (q.includes("risk") || q.includes("score")) {
    return `Your health risk score (0-100%) is based on how your lab values compare to normal ranges. Low Risk (0-30%): maintain current habits. Medium Risk (30-60%): make lifestyle changes and monitor closely. High Risk (60-100%): consult specialists urgently. ${context ? "Your current risk is reflected in your values. Focus on areas marked as high or low." : "Upload a report to get a detailed risk assessment."} Remember: this is educational only, not a diagnosis.`;
  }
  
  // General response for any question
  return "I'm Decode Care's health assistant! I can explain lab tests (cholesterol, blood sugar, hemoglobin, creatinine, HbA1c, blood pressure), health conditions, medications, wellness tips, and more. Ask me anything health-related, and I'll explain clearly. For diagnosis or medical decisions, consult your doctor. What would you like to know?";
};

// ── AI analysis ───────────────────────────────────────────────────────────────
const analyzeWithAI = async (values, patientName) => {
  const entries = Object.entries(values).filter(([, v]) => v);
  const prompt = `You are a medical AI assistant. A patient named ${patientName} has these lab values:\n${
    entries.map(([k, v]) => `${RISK_RANGES[k]?.label || k}: ${v} ${RISK_RANGES[k]?.unit || ""}`).join("\n")
  }\n\nRespond ONLY with valid JSON (no markdown fences) with exactly these keys:\n{"explanations":{"hemoglobin":"...","fbs":"...","hba1c":"...","cholesterol":"...","creatinine":"...","systolic":"...","diastolic":"..."},"conditions":["..."],"specialists":["..."],"tips":["..."],"summary":"One sentence."}\nOnly include relevant conditions/specialists/tips.`;
  try {
    // Note: Replace with your actual Anthropic API key
    const ANTHROPIC_API_KEY = process.env.REACT_APP_ANTHROPIC_KEY || "";
    if (!ANTHROPIC_API_KEY) {
      console.warn("Anthropic API key not configured");
      return generateFallbackAnalysis(entries, computeRisk(values));
    }
    
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: "claude-3-5-sonnet-20241022", max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
    });
    
    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic Error:", res.status, errText);
      return generateFallbackAnalysis(entries, computeRisk(values)); 
    }
    
    const data = await res.json();
    const text = (data.content || []).map(c => c.text || "").join("");
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (err) {
    console.error("AI Analysis Error:", err);
    return generateFallbackAnalysis(entries, computeRisk(values));
  }
};

// ── REPLACE these two functions in your App.jsx ──────────────────────────────

// Generate dynamic preventive tips based ONLY on abnormal lab values
const generateDynamicTips = (entries, riskPercent) => {
 
  const has = (key, status) =>
    entries.some(([k, v]) => k === key && classifyValue(k, v) === status);
 
  // Determine which parameters are abnormal
  const highCholesterol = has("cholesterol", "high");
  const highSystolic    = has("systolic",    "high");
  const highDiastolic   = has("diastolic",   "high");
  const highFbs         = has("fbs",         "high");
  const highHba1c       = has("hba1c",       "high");
  const lowHgb          = has("hemoglobin",  "low");
  const highHgb         = has("hemoglobin",  "high");
  const highCreatinine  = has("creatinine",  "high");
  const lowCreatinine   = has("creatinine",  "low");
  const lowFbs          = has("fbs",         "low");
 
  const level = riskPercent <= 30 ? "low" : riskPercent <= 60 ? "medium" : "high";
 
  // ── Tips per parameter (1–2 per abnormal marker) ─────────────────────────
  const paramTips = [];
 
  if (highCholesterol) {
    paramTips.push("Avoid saturated fats (butter, red meat, fried foods) and eliminate trans fats entirely from your diet.");
    paramTips.push("Add soluble fiber (oats, flaxseed, beans) and omega-3 rich foods (salmon, walnuts) to actively lower LDL.");
  }
  if (highSystolic || highDiastolic) {
    paramTips.push("Cut sodium intake to under 1,500 mg/day — skip processed foods, pickles, and restaurant meals.");
    paramTips.push("Practice daily stress reduction (10 min deep breathing or meditation) — chronic stress directly raises blood pressure.");
  }
  if (highFbs || highHba1c) {
    paramTips.push("Eliminate sugary drinks and refined carbs; replace with low-GI foods like oats, legumes, and vegetables.");
    paramTips.push("Take a 10–15 minute walk after each meal — post-meal movement is one of the most effective ways to reduce blood sugar spikes.");
  }
  if (lowFbs) {
    paramTips.push("Never skip meals — eat small, frequent meals with complex carbs and protein every 3–4 hours to prevent hypoglycemia.");
  }
  if (lowHgb) {
    paramTips.push("Eat iron-rich foods (spinach, lentils, liver, red meat) paired with vitamin C to boost iron absorption significantly.");
    paramTips.push("Avoid tea and coffee around meal times — they block iron absorption. Get B12 and folate levels checked too.");
  }
  if (highHgb) {
    paramTips.push("Drink at least 3 liters of water daily — dehydration is the most common reversible cause of high hemoglobin.");
    paramTips.push("Avoid smoking; it artificially elevates hemoglobin by reducing blood oxygen levels.");
  }
  if (highCreatinine) {
    paramTips.push("Reduce high-protein foods (especially red meat) and avoid NSAIDs — both stress the kidneys further.");
    paramTips.push("Stay well hydrated (2.5–3 liters/day) and tightly control blood pressure and blood sugar to slow kidney decline.");
  }
  if (lowCreatinine) {
    paramTips.push("Increase protein intake through lean sources (eggs, chicken, legumes) and add resistance training to rebuild muscle mass.");
  }
 
  // ── Risk-level tier tips (universal but tailored to severity) ─────────────
  const riskTips = {
    low: [
      "You're in good shape — maintain your healthy habits with annual checkups and routine lab panels to catch any shifts early.",
      "Focus on long-term consistency: 150 minutes of moderate exercise weekly, a balanced whole-food diet, and 7–9 hours of sleep.",
      "Preventive care now is far easier than treatment later — keep stress low and stay hydrated.",
    ],
    medium: [
      "Schedule a follow-up appointment with your doctor within the next 4–6 weeks to review these findings in detail.",
      "Begin tracking your diet and activity using an app — awareness is the first step toward measurable improvement.",
      "Prioritize sleep (7–9 hours) and stress management; both have direct measurable effects on blood pressure, glucose, and cholesterol.",
      "Avoid smoking and limit alcohol to one standard drink per day or less.",
    ],
    high: [
      "Seek medical consultation within the next 1–2 weeks — do not delay, as multiple elevated markers increase compounded cardiovascular and metabolic risk.",
      "Do not make major dietary or medication changes without physician guidance — some interventions can interact with each other.",
      "Request a comprehensive metabolic panel (CMP), lipid profile, and ECG from your doctor to get a full picture.",
      "Adopt immediate lifestyle changes: zero alcohol, zero smoking, low-sodium low-sugar diet, and daily 20-minute walks starting today.",
      "Consider wearing a BP monitor for 7 days to provide your doctor with real-world readings rather than single-point clinic data.",
    ],
  };
 
  // ── Combine: param-specific tips first, then risk-level tips ─────────────
  // All-normal case
  if (paramTips.length === 0) {
    return riskTips.low.slice(0, 3);
  }
 
  // Merge: up to 3 param tips + 2 risk tips (total max 5, no duplicates)
  const combined = [];
  const maxParam = Math.min(paramTips.length, level === "high" ? 3 : level === "medium" ? 3 : 2);
  const maxRisk  = 5 - maxParam;
 
  for (let i = 0; i < maxParam; i++) combined.push(paramTips[i]);
  for (let i = 0; i < Math.min(maxRisk, riskTips[level].length); i++) combined.push(riskTips[level][i]);
 
  return combined;
};
 
 
// ── 4. FIXED generateFallbackAnalysis — passes riskPercent to tips ────────────
const generateFallbackAnalysis = (entries, riskPercent = 0) => {
  const explanations  = {};
  const conditionsSet = new Set();
  const specialistsSet= new Set();
 
  entries.forEach(([k, v]) => {
    const cls = classifyValue(k, v);
    const cfg = RISK_RANGES[k];
    if (!cfg) return;
 
    if (cls === "high") {
      switch (k) {
        case "cholesterol":
          explanations[k] = `Total cholesterol of ${v} mg/dL exceeds the optimal threshold of 200 mg/dL, indicating hypercholesterolemia. Elevated LDL fractions accelerate atherosclerotic plaque formation, increasing cardiovascular risk.`;
          conditionsSet.add("Hypercholesterolemia (Elevated Total Cholesterol / LDL)");
          specialistsSet.add("Cardiologist");
          break;
        case "fbs":
          explanations[k] = `Fasting blood glucose of ${v} mg/dL exceeds the normal upper limit of 99 mg/dL. Values between 100–125 mg/dL indicate pre-diabetes; ≥126 mg/dL on two occasions confirms Type 2 Diabetes Mellitus.`;
          conditionsSet.add("Impaired Fasting Glucose / Pre-diabetes or Type 2 Diabetes Mellitus");
          specialistsSet.add("Endocrinologist / Diabetologist");
          break;
        case "hba1c":
          explanations[k] = `HbA1c of ${v}% reflects above-normal average blood glucose over 3 months (normal: 4.0–5.6%). Values of 5.7–6.4% indicate pre-diabetes; ≥6.5% is diagnostic of diabetes mellitus.`;
          conditionsSet.add("Pre-diabetes or Type 2 Diabetes Mellitus (Elevated HbA1c)");
          specialistsSet.add("Endocrinologist / Diabetologist");
          break;
        case "systolic":
          explanations[k] = `Systolic blood pressure of ${v} mmHg exceeds the optimal ceiling of 120 mmHg. Sustained elevation increases the risk of left ventricular hypertrophy, stroke, and progressive renal injury.`;
          conditionsSet.add("Systolic Hypertension (Stage I or II)");
          specialistsSet.add("Cardiologist / Internal Medicine Physician");
          break;
        case "diastolic":
          explanations[k] = `Diastolic pressure of ${v} mmHg is above the optimal 80 mmHg threshold. Diastolic hypertension contributes to arterial stiffness and end-organ damage over time.`;
          conditionsSet.add("Diastolic Hypertension");
          specialistsSet.add("Cardiologist / Internal Medicine Physician");
          break;
        case "creatinine":
          explanations[k] = `Serum creatinine of ${v} mg/dL exceeds the upper limit of 1.2 mg/dL, suggesting reduced glomerular filtration. This may reflect acute kidney injury, chronic kidney disease, or rhabdomyolysis.`;
          conditionsSet.add("Elevated Serum Creatinine — Possible Renal Insufficiency (Acute or Chronic)");
          specialistsSet.add("Nephrologist");
          break;
        case "hemoglobin":
          explanations[k] = `Hemoglobin of ${v} g/dL is above the upper normal limit of 17 g/dL (polycythemia). This may reflect dehydration, sleep apnea, or rarely a myeloproliferative disorder such as polycythemia vera.`;
          conditionsSet.add("Polycythemia — Elevated Hemoglobin");
          specialistsSet.add("Hematologist");
          break;
        default:
          explanations[k] = `${cfg.label} of ${v} ${cfg.unit} exceeds the normal reference range (${cfg.rangeText}) and warrants clinical correlation.`;
      }
    } else if (cls === "low") {
      switch (k) {
        case "hemoglobin":
          explanations[k] = `Hemoglobin of ${v} g/dL is below the lower normal limit of 13 g/dL, confirming anemia. Common causes include iron deficiency, vitamin B12/folate deficiency, chronic disease, or blood loss.`;
          conditionsSet.add("Anemia — Low Hemoglobin (Iron Deficiency, B12/Folate Deficiency, or Chronic Disease Anemia)");
          specialistsSet.add("Hematologist / General Physician");
          break;
        case "fbs":
          explanations[k] = `Fasting glucose of ${v} mg/dL falls below 70 mg/dL (hypoglycemia). Possible causes include excessive insulin activity, prolonged fasting, or an underlying endocrine disorder.`;
          conditionsSet.add("Hypoglycemia — Low Fasting Blood Glucose");
          specialistsSet.add("Endocrinologist");
          break;
        case "creatinine":
          explanations[k] = `Serum creatinine of ${v} mg/dL is below 0.6 mg/dL, often reflecting reduced muscle mass, malnutrition, or sarcopenia rather than a primary kidney abnormality.`;
          conditionsSet.add("Low Serum Creatinine — Possible Sarcopenia or Malnutrition");
          specialistsSet.add("General Physician / Clinical Nutritionist");
          break;
        default:
          explanations[k] = `${cfg.label} of ${v} ${cfg.unit} is below the normal reference range (${cfg.rangeText}) and should be evaluated in clinical context.`;
      }
    } else {
      const normalMessages = {
        hemoglobin:  `Hemoglobin of ${v} g/dL is within the normal range (${cfg.rangeText}), indicating adequate red blood cell oxygen-carrying capacity.`,
        fbs:         `Fasting blood glucose of ${v} mg/dL is within the optimal range (${cfg.rangeText}), reflecting normal carbohydrate metabolism.`,
        hba1c:       `HbA1c of ${v}% is within the target range (${cfg.rangeText}), confirming well-controlled long-term blood glucose levels.`,
        cholesterol: `Total cholesterol of ${v} mg/dL is within acceptable limits (${cfg.rangeText}), indicating a lower baseline risk for cardiovascular disease.`,
        creatinine:  `Serum creatinine of ${v} mg/dL is within the normal range (${cfg.rangeText}), reflecting adequate kidney filtration function.`,
        systolic:    `Systolic BP of ${v} mmHg is within the optimal range (${cfg.rangeText}), indicating healthy arterial pressure during cardiac contraction.`,
        diastolic:   `Diastolic BP of ${v} mmHg is within the normal range (${cfg.rangeText}), reflecting healthy arterial resistance between heartbeats.`,
      };
      explanations[k] = normalMessages[k] || `${cfg.label} is within the normal reference range (${cfg.rangeText}).`;
    }
  });
 
  const conditions  = [...conditionsSet];
  const specialists = [...specialistsSet];
 
  // Pass riskPercent so tips are tiered correctly
  const tips = generateDynamicTips(entries, riskPercent);
 
  const abnormalCount = entries.filter(([k, v]) => classifyValue(k, v) !== "normal").length;
  const levelLabel    = riskPercent <= 30 ? "Low" : riskPercent <= 60 ? "Medium" : "High";
 
  const summary = abnormalCount === 0
    ? `All measured parameters are within normal reference ranges (${levelLabel} Risk — ${riskPercent}%). Continue your current health practices and schedule routine annual follow-up.`
    : `${abnormalCount} parameter${abnormalCount > 1 ? "s are" : " is"} outside the normal reference range (${levelLabel} Risk — ${riskPercent}%). Review the findings below and consult the recommended specialists promptly.`;
 
  return { explanations, conditions, specialists, tips, summary };
};
 
// ── PDF: opens printable window (works in all browsers/sandboxes) ─────────────
const generatePDF = (report, user) => {
  const { values, risk, aiData, date } = report;
  const lvl = riskLevel(risk);
  const color = riskColor(lvl);

  const rowsHtml = Object.entries(values).map(([k, v]) => {
    const r = RISK_RANGES[k];
    if (!r || !v) return "";
    const cls = classifyValue(k, v);
    const statusColor = cls === "normal" ? "#10b981" : cls === "low" ? "#3b82f6" : "#ef4444";
    return `<tr><td>${r.label}</td><td><strong>${v} ${r.unit}</strong></td><td>${r.rangeText}</td><td style="color:${statusColor};font-weight:700">${cls.charAt(0).toUpperCase()+cls.slice(1)}</td><td style="font-size:12px;color:#555">${aiData?.explanations?.[k] || ""}</td></tr>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Decode Care – Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,serif;color:#1a1a2e;padding:40px;font-size:14px}
h1{color:#0f4c75;font-size:26px}
h2{font-size:15px;color:#0f4c75;border-bottom:1px solid #c7d9e8;padding-bottom:5px;margin:20px 0 10px}
.header{display:flex;justify-content:space-between;border-bottom:3px solid #0f4c75;padding-bottom:16px;margin-bottom:22px}
.badge{display:inline-block;padding:5px 16px;border-radius:20px;background:${color};color:#fff;font-weight:700;font-size:13px}
.bar-wrap{background:#eee;border-radius:8px;height:14px;margin:10px 0 4px;overflow:hidden}
.bar{height:100%;width:${risk}%;background:linear-gradient(90deg,#10b981 0%,#f59e0b 50%,#ef4444 100%)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#0f4c75;color:#fff;padding:8px 10px;text-align:left}
td{padding:7px 10px;border-bottom:1px solid #eef2f7}
ul{padding-left:18px} li{margin-bottom:5px;font-size:13px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:4px}
.box{background:#f8fafc;border-radius:8px;padding:14px 16px}
.disclaimer{margin-top:32px;padding:13px;background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;font-size:11px;color:#666;line-height:1.6}
@media print{body{padding:20px}}
</style></head><body>
<div class="header">
  <div><h1>🏥 Decode Care</h1><p style="color:#666;font-size:13px;margin-top:4px">Medical Report &middot; ${new Date(date).toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"})}</p></div>
  <div style="text-align:right"><strong style="font-size:17px">${user.name}</strong><br><span style="color:#666;font-size:12px">Age: ${user.age||"N/A"}</span><br><br><span class="badge">${lvl} Risk</span></div>
</div>
<h2>Overall Risk Score: ${risk}%</h2>
<div class="bar-wrap"><div class="bar"></div></div>
<p style="font-size:13px;color:#555;margin-top:8px">${aiData?.summary||""}</p>
<h2>Lab Values</h2>
<table><tr><th>Parameter</th><th>Value</th><th>Normal Range</th><th>Status</th><th>Interpretation</th></tr>${rowsHtml}</table>
<div class="cols" style="margin-top:22px">
  ${aiData?.conditions?.length  ? `<div class="box"><h2 style="margin-top:0;color:#ef4444">⚠ Possible Conditions</h2><ul>${aiData.conditions.map(c=>`<li>${c}</li>`).join("")}</ul></div>` : ""}
  ${aiData?.specialists?.length ? `<div class="box"><h2 style="margin-top:0;color:#1e88e5">👨‍⚕️ Recommended Specialists</h2><ul>${aiData.specialists.map(s=>`<li>${s}</li>`).join("")}</ul></div>` : ""}
</div>
${aiData?.tips?.length ? `<div class="box" style="margin-top:18px"><h2 style="margin-top:0;color:#10b981">🌿 Preventive Tips</h2><ul>${aiData.tips.map(t=>`<li>${t}</li>`).join("")}</ul></div>` : ""}
<div class="disclaimer">⚠️ <strong>Medical Disclaimer:</strong> This AI-based system is for health awareness purposes only and is not a substitute for professional medical diagnosis or treatment. Always consult a qualified healthcare professional before making any health decisions based on this report.</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) { alert("Please allow popups for this site to download the PDF report."); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 500);
};

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════
const StatusBadge = ({ status }) => {
  const MAP = { normal: ["#10b981","Normal"], high: ["#ef4444","High"], low: ["#3b82f6","Low"], unknown: ["#94a3b8","—"] };
  const [bg, label] = MAP[status] || MAP.unknown;
  return <span style={{ background:bg, color:"#fff", padding:"2px 9px", borderRadius:20, fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, whiteSpace:"nowrap" }}>{label}</span>;
};

const RiskBadge = ({ level }) => (
  <span style={{ background:riskColor(level), color:"#fff", padding:"4px 14px", borderRadius:20, fontSize:12, fontWeight:700 }}>{level} Risk</span>
);

const ProgressBar = ({ pct }) => (
  <div style={{ background:"#e2e8f0", borderRadius:10, height:10, overflow:"hidden", marginTop:8 }}>
    <div style={{ width:`${pct}%`, height:"100%", background:"linear-gradient(90deg,#10b981 0%,#f59e0b 50%,#ef4444 100%)", backgroundSize:"300% 100%", backgroundPosition:`${Math.round(pct)}% 0`, borderRadius:10, transition:"width 1s ease" }}/>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
const iSt = { width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:14, marginBottom:12, outline:"none", boxSizing:"border-box", fontFamily:"inherit", background:"#fafbff", color:"#1e293b" };

function AuthScreen({ onLogin }) {
  const [mode, setMode]   = useState("login");
  const [form, setForm]   = useState({ email:"", password:"", name:"", age:"" });
  const [error, setError] = useState("");
  const [busy, setBusy]   = useState(false);

  const handle = async () => {
    setError(""); setBusy(true);
    const users = loadJSON(USERS_KEY, {});
    const hash  = await hashPassword(form.password);
    if (mode === "login") {
      const u = users[form.email];
      if (!u || u.hash !== hash) { setError("Invalid email or password."); setBusy(false); return; }
      saveJSON(SESSION_KEY, form.email);
      onLogin({ ...u, email: form.email });
    } else {
      if (!form.name || !form.email || !form.password) { setError("All fields required."); setBusy(false); return; }
      if (users[form.email]) { setError("Email already registered."); setBusy(false); return; }
      const nu = { name:form.name, age:form.age, hash };
      users[form.email] = nu;
      saveJSON(USERS_KEY, users);
      saveJSON(SESSION_KEY, form.email);
      onLogin({ ...nu, email: form.email });
    }
    setBusy(false);
  };

  const F = (k) => ({ value: form[k], onChange: e => setForm({...form,[k]:e.target.value}) });

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f4c75 0%,#1b262c 60%,#0a3d62 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <div style={{ background:"rgba(255,255,255,0.97)", borderRadius:20, padding:"48px 44px", width:420, boxShadow:"0 30px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign:"center", marginBottom:30 }}>
          <div style={{ fontSize:40 }}>🏥</div>
          <h1 style={{ fontFamily:"'Crimson Pro',serif", fontSize:30, fontWeight:700, color:"#0f4c75", margin:"4px 0 0" }}>Decode Care</h1>
          <p style={{ color:"#64748b", fontSize:13, marginTop:6 }}>AI-Powered Medical Report Analysis</p>
        </div>
        <div style={{ display:"flex", background:"#f1f5f9", borderRadius:10, padding:4, marginBottom:22 }}>
          {["login","register"].map(m => (
            <button key={m} onClick={()=>{setMode(m);setError("");}} style={{ flex:1, padding:"8px 0", border:"none", borderRadius:8, cursor:"pointer", fontWeight:600, fontSize:13, transition:"all .2s", background:mode===m?"#0f4c75":"transparent", color:mode===m?"#fff":"#64748b" }}>
              {m==="login"?"Sign In":"Register"}
            </button>
          ))}
        </div>
        {mode==="register" && <>
          <input placeholder="Full Name" {...F("name")} style={iSt}/>
          <input placeholder="Age" type="number" {...F("age")} style={iSt}/>
        </>}
        <input placeholder="Email" type="email" {...F("email")} style={iSt}/>
        <input placeholder="Password" type="password" {...F("password")} style={iSt} onKeyDown={e=>e.key==="Enter"&&handle()}/>
        {error && <p style={{ color:"#ef4444", fontSize:13, margin:"0 0 8px" }}>⚠ {error}</p>}
        <button onClick={handle} disabled={busy} style={{ width:"100%", padding:13, background:"linear-gradient(135deg,#0f4c75,#1e88e5)", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:15, cursor:busy?"wait":"pointer", marginTop:4 }}>
          {busy?"Please wait…":mode==="login"?"Sign In":"Create Account"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD PANEL
// ═══════════════════════════════════════════════════════════════════════════════
const EMPTY = { hemoglobin:"", fbs:"", hba1c:"", cholesterol:"", creatinine:"", systolic:"", diastolic:"" };

function UploadPanel({ user, onReportAdded }) {
  const [drag, setDrag]     = useState(false);
  const [values, setValues] = useState({ ...EMPTY });
  const [busy, setBusy]     = useState(false);
  const [fileName, setFile] = useState("");

const handleFile = async (file) => {
  if (!file) return;

  setFile(file.name);
  setBusy(true);

  const reader = new FileReader();

  reader.onload = async () => {
    try {
      const { data: { text } } = await Tesseract.recognize(
        reader.result,
        "eng",
        {
          logger: m => console.log(m),
        }
      );

      console.log("OCR TEXT:", text);

      // ✅ CLEAN TEXT
      const cleanText = text
        .toLowerCase()
        .replace(/[^a-z0-9.\s:/%-]/g, " ")
        .replace(/\s+/g, " ");

      console.log("CLEAN TEXT:", cleanText);

      // ✅ FLEXIBLE EXTRACT FUNCTION
      const extract = (patterns) => {
        for (let pattern of patterns) {
          const match = cleanText.match(pattern);
          if (match) return match[1];
        }
        return "";
      };

      // ✅ EXTRACT VALUES
      const extractedValues = {
        hemoglobin: extract([
          /hemoglobin\s*[:\-]?\s*(\d+(\.\d+)?)/,
          /\bhb\b\s*[:\-]?\s*(\d+(\.\d+)?)/,
        ]),

        fbs: extract([
          /fasting blood sugar\s*[:\-]?\s*(\d+(\.\d+)?)/,
          /glucose\s*[:\-]?\s*(\d+(\.\d+)?)/,
          /\bfbs\b\s*[:\-]?\s*(\d+(\.\d+)?)/,
        ]),

        hba1c: extract([
          /hba1c\s*[:\-]?\s*(\d+(\.\d+)?)/,
          /a1c\s*[:\-]?\s*(\d+(\.\d+)?)/,
        ]),

        cholesterol: extract([
          /cholesterol\s*[:\-]?\s*(\d+(\.\d+)?)/,
          /cholestrol\s*[:\-]?\s*(\d+(\.\d+)?)/,
        ]),

        creatinine: extract([
          /creatinine\s*[:\-]?\s*(\d+(\.\d+)?)/,
        ]),

        systolic: cleanText.match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/)?.[1] || "",
        diastolic: cleanText.match(/(\d{2,3})\s*[\/\-]\s*(\d{2,3})/)?.[2] || ""
      };

      console.log("FINAL VALUES:", extractedValues);

      // ✅ SET VALUES
      setValues(extractedValues);

    } catch (err) {
      console.error("OCR ERROR:", err);
    }

    setBusy(false);
  };

  reader.readAsDataURL(file);
};

  const hasAny = Object.values(values).some(v => v.trim());

  const handleAnalyze = async () => {
    if (!hasAny || busy) return;
    setBusy(true);
    const risk   = computeRisk(values);
    const aiData = await analyzeWithAI(values, user.name);
    const report = { id:generateId(), date:new Date().toISOString(), values:{...values}, risk, aiData, userId:user.email };
    const all    = loadJSON(REPORTS_KEY, []);
    all.unshift(report);
    saveJSON(REPORTS_KEY, all);
    onReportAdded(report);
    setValues({ ...EMPTY });
    setFile("");
    setBusy(false);
  };

  const liveRisk = hasAny ? computeRisk(values) : null;

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
      <h2 style={{ fontFamily:"'Crimson Pro',serif", fontSize:22, color:"#0f4c75", marginBottom:16, fontWeight:700 }}>Upload Medical Report</h2>

      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>document.getElementById("dcFile").click()}
        style={{ border:`2px dashed ${drag?"#1e88e5":"#cbd5e1"}`, borderRadius:12, padding:"22px 20px", textAlign:"center", background:drag?"#eff6ff":"#f8fafc", marginBottom:16, cursor:"pointer", transition:"all .2s" }}>
        <div style={{ fontSize:30, marginBottom:5 }}>📄</div>
        <p style={{ color:"#475569", fontSize:13, margin:0 }}><strong>Drop file here</strong> or click to browse</p>
        <p style={{ color:"#94a3b8", fontSize:11, margin:"4px 0 0" }}>PDF · JPG · PNG — values extracted automatically</p>
        {fileName && <p style={{ color:"#0f4c75", fontSize:12, marginTop:8, fontWeight:600 }}>✓ {fileName}</p>}
        <input id="dcFile" type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
      </div>

      <p style={{ fontSize:12, color:"#94a3b8", marginBottom:12, textAlign:"center" }}>— or enter values manually —</p>

      <div style={{ display:"grid", gap:8 }}>
        {Object.entries(RISK_RANGES).map(([key, cfg]) => {
          const cls = values[key] ? classifyValue(key, values[key]) : null;
          const borderColor = cls==="high" ? "#fca5a5" : cls==="low" ? "#93c5fd" : "#e2e8f0";
          return (
            <div key={key} style={{ display:"flex", alignItems:"center", gap:8 }}>
              <label style={{ width:162, fontSize:12, color:"#475569", fontWeight:500, flexShrink:0 }}>{cfg.label}</label>
              <input value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})} placeholder={cfg.rangeText}
                style={{ flex:1, padding:"7px 10px", border:`1.5px solid ${borderColor}`, borderRadius:8, fontSize:13, outline:"none", background:"#fafbff", color:"#1e293b", transition:"border .2s" }}/>
              <span style={{ fontSize:11, color:"#94a3b8", width:44, textAlign:"right", flexShrink:0 }}>{cfg.unit}</span>
              {cls && <StatusBadge status={cls}/>}
            </div>
          );
        })}
      </div>

      {liveRisk !== null && (
        <div style={{ marginTop:14, padding:"11px 14px", background:"#f8fafc", borderRadius:10, border:"1px solid #e2e8f0" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:12, color:"#64748b", fontWeight:600 }}>Estimated Risk</span>
            <RiskBadge level={riskLevel(liveRisk)}/>
          </div>
          <ProgressBar pct={liveRisk}/>
          <p style={{ fontSize:11, color:"#94a3b8", marginTop:5, marginBottom:0 }}>{liveRisk}% — {Object.values(values).filter(v=>v).length}/7 values entered</p>
        </div>
      )}

      <button onClick={handleAnalyze} disabled={busy||!hasAny}
        style={{ width:"100%", marginTop:16, padding:13, border:"none", borderRadius:12, background:busy||!hasAny?"#cbd5e1":"linear-gradient(135deg,#0f4c75,#1e88e5)", color:"#fff", fontWeight:700, fontSize:14, cursor:busy||!hasAny?"not-allowed":"pointer", transition:"background .2s" }}>
        {busy ? "🔬 Analyzing with AI…" : "🚀 Analyze Report"}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY CARD
// ═══════════════════════════════════════════════════════════════════════════════
import LabCharts from "./components/LabCharts";
function getSpecialistReason(values, specialist) {
  const s = specialist.toLowerCase();

  if (s.includes("cardio")) {
    if (values.systolic > 120 || values.diastolic > 80) {
      return "elevated blood pressure";
    }
  }

  if (s.includes("endocrin")) {
    if (values.fbs > 100 || values.hba1c > 5.6) {
      return "high blood sugar levels";
    }
  }

  if (s.includes("hemat")) {
    if (values.hemoglobin < 13 || values.hemoglobin > 17) {
      return "abnormal hemoglobin levels";
    }
  }

  if (s.includes("nephro")) {
    if (values.creatinine > 1.2) {
      return "kidney-related indicators";
    }
  }

  return "your health indicators";
}
function SummaryCard({ report, user, onDownload }) {
  const [speaking, setSpeaking] = useState(false);
  const { values, risk, aiData, date } = report;
  const lvl = riskLevel(risk);

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <h2 style={{ fontFamily:"'Crimson Pro',serif", fontSize:22, color:"#0f4c75", margin:0, fontWeight:700 }}>Health Summary</h2>
          <p style={{ color:"#64748b", fontSize:12, margin:"4px 0 0" }}>{new Date(date).toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"})}</p>
        </div>
        <div style={{ textAlign:"right" }}>
          <p style={{ fontWeight:700, fontSize:15, color:"#1e293b", margin:0 }}>{user.name}</p>
          <p style={{ color:"#64748b", fontSize:12, margin:"2px 0 6px" }}>Age: {user.age||"N/A"}</p>
          <RiskBadge level={lvl}/>
        </div>
      </div>

      <div style={{ background:"#fff", borderRadius:12, padding:"15px 18px", boxShadow:"0 1px 8px rgba(0,0,0,0.06)", marginBottom:13 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:13, fontWeight:600, color:"#475569" }}>Overall Risk Score</span>
          <span style={{ fontSize:24, fontWeight:800, color:riskColor(lvl) }}>{risk}%</span>
        </div>
        <ProgressBar pct={risk}/>
        {aiData?.summary && <p style={{ fontSize:12, color:"#64748b", marginTop:9, marginBottom:0, lineHeight:1.6 }}>💡 {aiData.summary}</p>}
      </div>

      <div style={{ background:"#fff", borderRadius:12, padding:"15px 18px", boxShadow:"0 1px 8px rgba(0,0,0,0.06)", marginBottom:13 }}>
        <h3 style={{ fontSize:11, fontWeight:700, color:"#0f4c75", marginBottom:11, marginTop:0, textTransform:"uppercase", letterSpacing:1 }}>Lab Values</h3>
        {Object.entries(values).map(([k, v]) => {
          if (!v) return null;
          const cfg = RISK_RANGES[k];
          const cls = classifyValue(k, v);
          const valColor = cls==="normal"?"#10b981":cls==="low"?"#3b82f6":"#ef4444";
          return (
            <div key={k} style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #f1f5f9" }}>
              <div style={{ flex:1, paddingRight:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{cfg.label}</span>
                  <StatusBadge status={cls}/>
                </div>
                <span style={{ fontSize:11, color:"#94a3b8" }}>Normal: {cfg.rangeText}</span>
                {aiData?.explanations?.[k] && <p style={{ fontSize:11, color:"#64748b", margin:"3px 0 0", lineHeight:1.5 }}>{aiData.explanations[k]}</p>}
              </div>
              <span style={{ fontWeight:800, fontSize:15, color:valColor, whiteSpace:"nowrap" }}>{v}<span style={{ fontSize:11, fontWeight:400, color:"#94a3b8" }}> {cfg.unit}</span></span>
            </div>
          );
        })}
      </div>
      <LabCharts values={values} />
      {(aiData?.conditions?.length > 0 || aiData?.specialists?.length > 0) && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:11, marginBottom:13 }}>
          {aiData?.conditions?.length > 0 && (
            <div style={{ background:"#fff0f0", borderRadius:12, padding:"13px 15px" }}>
              <h3 style={{ fontSize:10, fontWeight:700, color:"#ef4444", marginBottom:9, marginTop:0, textTransform:"uppercase", letterSpacing:0.8 }}>⚠ Possible Conditions</h3>
              {aiData.conditions.map((c,i) => <p key={i} style={{ margin:"3px 0", fontSize:12, color:"#374151" }}>• {c}</p>)}
            </div>
          )}
          {aiData?.specialists?.length > 0 && (
            <div style={{ background:"#eff6ff", borderRadius:12, padding:"13px 15px" }}>
              <h3 style={{ fontSize:10, fontWeight:700, color:"#1e88e5", marginBottom:9, marginTop:0, textTransform:"uppercase", letterSpacing:0.8 }}>👨‍⚕️ Consult</h3>
              {aiData.specialists.map((s,i) => <p key={i} style={{ margin:"3px 0", fontSize:12, color:"#374151" }}>• {s}</p>)}
            </div>
          )}
        </div>
      )}
      {aiData?.specialists?.length > 0 && (
        <div style={{
        background:"#ffffff",
        borderRadius:12,
        padding:"15px",
        marginBottom:14,
        boxShadow:"0 1px 8px rgba(0,0,0,0.06)"
  }}>
    <h3 style={{
      fontSize:11,
      fontWeight:700,
      color:"#0f4c75",
      marginBottom:10,
      textTransform:"uppercase"
    }}>
      all Nearby Specialists
    </h3>

    {aiData.specialists.map((s, i) => {
      const clean = s.split("/")[0].trim().replace(/\s+/g, "+");
      const reason = getSpecialistReason(values, clean);

      return (
        <div key={i} style={{ marginBottom:14 }}>
          <p style={{ fontWeight:600, color:"#1e293b" }}>
            {clean}
          </p>
          <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 6px" }}>
              Recommended due to {reason || "your health indicators"}
          </p>

          <a
            href={`https://www.google.com/maps/search/${clean}+near+me`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:"inline-block",
              marginTop:"6px",
              padding:"8px 12px",
              background:"#1e88e5",
              color:"#fff",
              borderRadius:"6px",
              textDecoration:"none",
              fontSize:"12px",
              fontWeight:"600"
            }}
          >
            🔍 View Top Doctors Nearby
          </a>
        </div>
      );
    })}
  </div>
)}

      {aiData?.tips?.length > 0 && (
        <div style={{ background:"#f0fdf4", borderRadius:12, padding:"13px 15px", marginBottom:14 }}>
          <h3 style={{ fontSize:10, fontWeight:700, color:"#10b981", marginBottom:9, marginTop:0, textTransform:"uppercase", letterSpacing:0.8 }}>🌿 Preventive Tips</h3>
          {aiData.tips.map((t,i) => <p key={i} style={{ margin:"3px 0", fontSize:12, color:"#374151" }}>• {t}</p>)}
        </div>
      )}

      <button onClick={onDownload} style={{ width:"100%", padding:"11px", border:"none", borderRadius:10, background:"#0f4c75", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", letterSpacing:0.3 }}>
        📥 Download PDF Report
      </button>
      <button
  onClick={() => {
    if (speaking) {
      window.speechSynthesis.cancel(); // STOP
      setSpeaking(false);
    } else {
      speakText(generateSpeech(aiData));
      setSpeaking(true);
    }
  }}
  style={{
    width: "100%",
    marginTop: 10,
    padding: "10px",
    background: speaking ? "#ef4444" : "#10b981",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    fontWeight: 600,
    cursor: "pointer"
  }}
>
  {speaking ? "⛔ Stop Reading" : "🔊 Read Report"}
</button>
      <p style={{ fontSize:10, color:"#94a3b8", textAlign:"center", marginTop:10, lineHeight:1.6 }}>
        ⚠️ This AI-based system is for health awareness only and is not a substitute for professional medical diagnosis or treatment.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHATBOT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
function ChatBot({ activeReport }) {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hello 👋 Ask me about your health report." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = { role: "user", text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const context = activeReport
      ? `Risk Score: ${activeReport.risk}%.
         Lab Values: ${Object.entries(activeReport.values)
           .map(([k, v]) => `${k}: ${v}`)
           .join(", ")}`
      : "No report uploaded yet.";

    const reply = await askGemini(input, context);

    setMessages(prev => [...prev, { role: "assistant", text: reply }]);
    setLoading(false);
  };

  return (
    <div style={{
      background:"#fff",
      borderRadius:16,
      padding:16,
      height:"78vh",
      display:"flex",
      flexDirection:"column",
      boxShadow:"0 1px 12px rgba(0,0,0,0.07)"
    }}>
      <h3 style={{marginBottom:10}}>🤖 Health Assistant</h3>

      <div style={{flex:1, overflowY:"auto", marginBottom:10}}>
        {messages.map((m,i) => (
          <div key={i} style={{textAlign:m.role==="user"?"right":"left",marginBottom:8}}>
            <div style={{
              display:"inline-block",
              padding:"8px 12px",
              borderRadius:12,
              background: m.role === "user"?"#1e88e5":"#f3f4f6",
              color: m.role === "user"?"#fff":"#1a1a1a",
              maxWidth:"70%",
              wordWrap:"break-word"
            }}>
              <p style={{margin:0,fontSize:13,lineHeight:1.5}}>{m.text}</p>
            </div>
          </div>
        ))}
        {loading && <div style={{textAlign:"left",marginBottom:8}}><div style={{display:"inline-block",padding:"8px 12px",borderRadius:12,background:"#f3f4f6",color:"#1a1a1a"}}><p style={{margin:0,fontSize:13}}>Thinking...</p></div></div>}
      </div>

      <div style={{display:"flex",gap:8}}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleSend()}
          placeholder="Ask about your health..."
          style={{flex:1,padding:"10px 14px",border:"1px solid #e2e8f0",borderRadius:10,outline:"none",fontSize:13}}
        />
        <button onClick={handleSend} disabled={loading} style={{padding:"10px 16px",background:"#0f4c75",color:"#fff",border:"none",borderRadius:10,cursor:loading?"wait":"pointer",fontWeight:600}}>
          Send
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const [user, setUser] = useState(null);
  const [activeReport, setActiveReport] = useState(null);

  useEffect(() => {
    const sessionEmail = loadJSON(SESSION_KEY, null);
    if (sessionEmail) {
      const users = loadJSON(USERS_KEY, {});
      const u = users[sessionEmail];
      if (u) setUser({ ...u, email: sessionEmail });
    }
  }, []);

  if (!user) return <AuthScreen onLogin={setUser}/>;

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const reports = loadJSON(REPORTS_KEY, []).filter(r => r.userId === user.email);

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#f5f7fa",minHeight:"100vh",padding:20}}>
      <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet"/>
      <div style={{maxWidth:1400,margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <h1 style={{fontFamily:"'Crimson Pro',serif",fontSize:32,color:"#0f4c75",margin:0}}>🏥 Decode Care</h1>
          <button onClick={handleLogout} style={{padding:"8px 16px",background:"#ef4444",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontWeight:600,fontSize:13}}>
            Logout
          </button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1.2fr",gap:20}}>
          <div style={{background:"#fff",borderRadius:16,padding:20,boxShadow:"0 1px 12px rgba(0,0,0,0.07)"}}>
            <UploadPanel user={user} onReportAdded={r=>{setActiveReport(r);}} />
          </div>

          <div style={{display:"grid",gridTemplateRows:"auto 1fr",gap:20}}>
            {activeReport ? (
              <div style={{background:"#fff",borderRadius:16,padding:20,boxShadow:"0 1px 12px rgba(0,0,0,0.07)"}}>
                <SummaryCard report={activeReport} user={user} onDownload={()=>generatePDF(activeReport,user)}/>
              </div>
            ) : reports.length > 0 ? (
              <div style={{background:"#fff",borderRadius:16,padding:20,boxShadow:"0 1px 12px rgba(0,0,0,0.07)"}}>
                <SummaryCard report={reports[0]} user={user} onDownload={()=>generatePDF(reports[0],user)}/>
              </div>
            ) : (
              <div style={{background:"#fff",borderRadius:16,padding:20,textAlign:"center",color:"#94a3b8"}}>
                <p>No reports yet. Upload a report to get started.</p>
              </div>
            )}

            <div style={{background:"#fff",borderRadius:16,boxShadow:"0 1px 12px rgba(0,0,0,0.07)"}}>
              <ChatBot activeReport={activeReport || reports[0]} />
            </div>
          </div>
        </div>

        {reports.length > 1 && (
          <div style={{marginTop:20,background:"#fff",borderRadius:16,padding:20,boxShadow:"0 1px 12px rgba(0,0,0,0.07)"}}>
            <h2 style={{fontSize:18,color:"#0f4c75",marginTop:0}}>📋 Previous Reports</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {reports.slice(1).map((r,i)=>(
                <div key={i} onClick={()=>setActiveReport(r)} style={{padding:12,background:"#f8fafc",borderRadius:10,cursor:"pointer",border:"1px solid #e2e8f0",transition:"all .2s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,color:"#94a3b8"}}>{new Date(r.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span>
                    <span style={{fontSize:12,fontWeight:700,color:riskColor(riskLevel(r.risk))}}>{r.risk}%</span>
                  </div>
                  <p style={{margin:"6px 0 0",fontSize:11,color:"#475569"}}>{riskLevel(r.risk)} Risk</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;