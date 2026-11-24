/**
 * Decode Care — API client
 * Drop this file into your React project's src/api/ folder.
 *
 * Usage:
 *   import api from './api/client';
 *   const { token, user } = await api.auth.register({ name, email, password, age });
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

// ── Token storage ─────────────────────────────────────────────────────────────
const TOKEN_KEY = "dc_token";

const tokenStore = {
  get: ()          => localStorage.getItem(TOKEN_KEY),
  set: (t)         => localStorage.setItem(TOKEN_KEY, t),
  clear: ()        => localStorage.removeItem(TOKEN_KEY),
};

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function request(method, path, { body, isFormData = false, token } = {}) {
  const headers = {};
  const tok = token ?? tokenStore.get();
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  // PDF / binary response
  if (res.headers.get("content-type")?.includes("application/pdf")) {
    const blob = await res.blob();
    return blob;
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.detail || `HTTP ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status, data });
  }

  return data;
}

const get    = (path, opts)       => request("GET",    path, opts);
const post   = (path, body, opts) => request("POST",   path, { body, ...opts });
const del    = (path, opts)       => request("DELETE", path, opts);

// ── Auth ──────────────────────────────────────────────────────────────────────
const auth = {
  register: async ({ name, email, password, age, gender }) => {
    const res = await post("/auth/register", { name, email, password, age, gender });
    tokenStore.set(res.access_token);
    return res; // { access_token, token_type, user }
  },

  login: async ({ email, password }) => {
    const res = await post("/auth/login", { email, password });
    tokenStore.set(res.access_token);
    return res;
  },

  logout: () => {
    tokenStore.clear();
  },

  me: () => get("/auth/me"),
};

// ── Reports ───────────────────────────────────────────────────────────────────
const reports = {
  /**
   * Upload a file (PDF / image) for OCR + AI analysis.
   * @param {File}   file
   * @param {object} meta  { patient_name?, patient_age? }
   */
  upload: async (file, { patient_name, patient_age } = {}) => {
    const form = new FormData();
    form.append("file", file);
    if (patient_name) form.append("patient_name", patient_name);
    if (patient_age)  form.append("patient_age",  patient_age);
    return post("/reports/upload", form, { isFormData: true });
  },

  /**
   * Submit manually entered lab values.
   * @param {object} labValues  { hemoglobin?, fbs?, hba1c?, ... }
   * @param {object} meta       { patient_name?, patient_age? }
   */
  create: (labValues, { patient_name, patient_age } = {}) =>
    post("/reports", { lab_values: labValues, patient_name, patient_age }),

  /** List summary cards for the current user. */
  list: () => get("/reports"),

  /** Full report detail. */
  get: (id) => get(`/reports/${id}`),

  /**
   * Download PDF as a Blob, then trigger browser download.
   */
  downloadPDF: async (id, filename) => {
    const blob = await get(`/reports/${id}/pdf`);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename || `DecodeCare_Report_${id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },

  delete: (id) => del(`/reports/${id}`),
};

// ── Utility: check if user is logged in ───────────────────────────────────────
const isAuthenticated = () => Boolean(tokenStore.get());

const api = { auth, reports, isAuthenticated, tokenStore };
export default api;
